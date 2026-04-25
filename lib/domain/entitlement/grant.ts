/**
 * MOD-ENTITLEMENT — grantFromTransaction
 *
 * T-8-09
 * docs/20-domain/12-entitlement.md §10 (fluxo principal)
 * BR-ENTITLEMENT-CONSOLIDATION: usa consolidate() para nunca criar duplicata ativa
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado no DB).
 *
 * Zero I/O direto: consome tx para DB e emitTimelineEvent (injetável via parâmetro
 * em testes) para eventos.
 */

import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  customerEntitlement,
  entitlementHistory,
} from '@/lib/db/schema/entitlement'
import type { CustomerEntitlement as DbCustomerEntitlement } from '@/lib/db/schema/entitlement'
import {
  transaction,
  transactionSnapshot,
} from '@/lib/db/schema/transaction'
import { consolidate } from './consolidate'
import type {
  CustomerEntitlement as DomainCustomerEntitlement,
  IncomingEntitlement,
} from './consolidate'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Erros tipados (ADR-10)
// ---------------------------------------------------------------------------

export class EntitlementDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EntitlementDomainError'
  }
}

export class TransactionSnapshotNotFoundError extends EntitlementDomainError {
  readonly transactionId: string

  constructor(transactionId: string) {
    super(
      `transaction_snapshot not found for transaction ${transactionId} — must be approved with snapshot`,
    )
    this.name = 'TransactionSnapshotNotFoundError'
    this.transactionId = transactionId
  }
}

export class TransactionNotFoundError extends EntitlementDomainError {
  readonly transactionId: string

  constructor(transactionId: string) {
    super(`transaction ${transactionId} not found`)
    this.name = 'TransactionNotFoundError'
    this.transactionId = transactionId
  }
}

// ---------------------------------------------------------------------------
// Tipo de dependência injetável para emissão de timeline (facilita testes)
// ---------------------------------------------------------------------------

export type EmitFn = (
  input: TimelineEventInput,
  tx?: DbTx,
) => Promise<unknown>

// ---------------------------------------------------------------------------
// Tipo auxiliar para snapshot de estado de entitlement (usado em history)
// ---------------------------------------------------------------------------

type EntitlementStateSnapshot = {
  started_at: string | null
  ends_at: string | null
  quantity: number
  status: string
}

function toStateSnapshot(
  ent: DbCustomerEntitlement,
): EntitlementStateSnapshot {
  return {
    started_at: ent.startedAt.toISOString(),
    ends_at: ent.endsAt != null ? ent.endsAt.toISOString() : null,
    quantity: ent.quantity,
    status: ent.status,
  }
}

// ---------------------------------------------------------------------------
// Helper: mapear linha crua do SELECT FOR UPDATE para DomainCustomerEntitlement
// A coluna ref_kind é validada pelo CHECK constraint do DB (só 'product'|'benefit')
// ---------------------------------------------------------------------------

function rawRowToDomain(raw: Record<string, unknown>): DomainCustomerEntitlement {
  return {
    id: raw['id'] as string,
    contactId: raw['contact_id'] as string,
    brandId: raw['brand_id'] as string,
    kind: raw['kind'] as DomainCustomerEntitlement['kind'],
    refKind: raw['ref_kind'] as 'product' | 'benefit',
    refId: raw['ref_id'] as string,
    quantity: raw['quantity'] as number,
    startedAt: new Date(raw['started_at'] as string),
    endsAt: raw['ends_at'] != null ? new Date(raw['ends_at'] as string) : null,
    status: raw['status'] as DomainCustomerEntitlement['status'],
    accessRule: (raw['access_rule'] as Record<string, unknown>) ?? {},
  }
}

// ---------------------------------------------------------------------------
// grantFromTransaction
// ---------------------------------------------------------------------------

/**
 * Concede direitos adquiridos a partir de uma transação aprovada.
 *
 * Para cada item no snapshot da transação:
 *   1. Busca entitlement ativo existente com mesmo (contact_id, brand_id, ref_kind, ref_id)
 *      usando SELECT FOR UPDATE para evitar race condition (T-8-09 risco).
 *   2. Chama `consolidate(existing, incoming)`.
 *   3. Aplica resultado:
 *      - create            → INSERT em customer_entitlement
 *      - extend_expiration → UPDATE ends_at
 *      - promote_perpetuous → UPDATE ends_at = null
 *      - merge_quantity    → UPDATE quantity
 *      - reactivate        → UPDATE status + campos relevantes
 *      - noop              → sem UPDATE (apenas history)
 *   4. INSERT em entitlement_history (from/to snapshot)
 *   5. Emite TE-ENTITLEMENT-GRANTED (create/reactivate) ou
 *      TE-ENTITLEMENT-EXTENDED (extend/promote/merge)
 *
 * Retorna array de entitlements resultantes (um por item do snapshot).
 *
 * @param tx              Transação DB ativa (ADR-11)
 * @param transactionId   UUID da transação aprovada
 * @param emit            Injeção da função de emissão (default: emitTimelineEvent)
 */
export async function grantFromTransaction(
  tx: DbTx,
  transactionId: string,
  emit: EmitFn = emitTimelineEvent,
): Promise<DbCustomerEntitlement[]> {
  // 1. Buscar a transação para obter contact_id e brand_id
  const txRows = await tx
    .select()
    .from(transaction)
    .where(eq(transaction.id, transactionId))
    .limit(1)

  const trx = txRows[0]
  if (!trx) {
    throw new TransactionNotFoundError(transactionId)
  }

  // 2. Buscar o snapshot da transação (deve existir após approveTransaction)
  const snapshotRows = await tx
    .select()
    .from(transactionSnapshot)
    .where(eq(transactionSnapshot.transactionId, transactionId))
    .limit(1)

  const snapshotRow = snapshotRows[0]
  if (!snapshotRow) {
    throw new TransactionSnapshotNotFoundError(transactionId)
  }

  // Payload é jsonb — fazer cast seguro
  const payload = snapshotRow.payload as {
    brand?: { id?: string }
    items?: Array<{
      kind: string
      product?: { id: string }
      commercial_benefit?: { id: string }
      quantity: number
      access_rule: Record<string, unknown>
      vigency_months: number | null
    }>
  }

  const snapshotItems = payload.items ?? []
  const now = new Date()
  const results: DbCustomerEntitlement[] = []

  // 3. Para cada item do snapshot
  for (const item of snapshotItems) {
    // Determinar ref_kind e ref_id a partir do item
    let refId: string | undefined
    let refKind: 'product' | 'benefit'
    let entitlementKind: 'product_access' | 'benefit' | 'other'

    if (item.product?.id) {
      refId = item.product.id
      refKind = 'product'
      entitlementKind = 'product_access'
    } else if (item.commercial_benefit?.id) {
      refId = item.commercial_benefit.id
      refKind = 'benefit'
      entitlementKind = 'benefit'
    } else {
      // Item sem product nem commercial_benefit — pular (sem ref para entitlement)
      continue
    }

    // Calcular ends_at a partir de vigency_months
    const endsAt =
      item.vigency_months != null && item.vigency_months > 0
        ? new Date(now.getTime() + item.vigency_months * 30 * 24 * 60 * 60 * 1000)
        : null

    const incoming: IncomingEntitlement = {
      contactId: trx.contactId,
      brandId: trx.brandId,
      kind: entitlementKind,
      refKind,
      refId,
      quantity: item.quantity,
      startedAt: now,
      endsAt,
      accessRule: item.access_rule ?? {},
    }

    // 4. SELECT FOR UPDATE no existing ativo
    // BR-ENTITLEMENT-CONSOLIDATION: evitar race condition (T-8-09 risco)
    // Drizzle não tem FOR UPDATE nativo — usamos sql raw
    const existingRows = await tx.execute(
      sql`SELECT * FROM customer_entitlement
          WHERE contact_id = ${trx.contactId}
            AND brand_id = ${trx.brandId}
            AND ref_kind = ${refKind}
            AND ref_id = ${refId}::uuid
            AND status = 'active'
          FOR UPDATE
          LIMIT 1`,
    )

    const rawRow = (existingRows as unknown as Array<Record<string, unknown>>)[0]

    // Mapear linha crua para o tipo de domínio (consolidate usa DomainCustomerEntitlement)
    const existingDomain: DomainCustomerEntitlement | null = rawRow
      ? rawRowToDomain(rawRow)
      : null

    // 5. Consolidar
    const result = consolidate(existingDomain, incoming)

    let resultEntitlement: DbCustomerEntitlement

    // Snapshot "from" para entitlement_history
    // Reconstruir DbCustomerEntitlement parcial a partir do rawRow para o history
    const fromDbRow: DbCustomerEntitlement | null = rawRow
      ? {
          id: rawRow['id'] as string,
          contactId: rawRow['contact_id'] as string,
          brandId: rawRow['brand_id'] as string,
          kind: rawRow['kind'] as DbCustomerEntitlement['kind'],
          refKind: rawRow['ref_kind'] as string,
          refId: rawRow['ref_id'] as string,
          quantity: rawRow['quantity'] as number,
          startedAt: new Date(rawRow['started_at'] as string),
          endsAt:
            rawRow['ends_at'] != null
              ? new Date(rawRow['ends_at'] as string)
              : null,
          status: rawRow['status'] as DbCustomerEntitlement['status'],
          originTransactionId: rawRow['origin_transaction_id'] as string,
          lastUpdateTransactionId: rawRow['last_update_transaction_id'] as string,
          accessRule: (rawRow['access_rule'] as Record<string, unknown>) ?? {},
          createdAt: new Date(rawRow['created_at'] as string),
          updatedAt: new Date(rawRow['updated_at'] as string),
        }
      : null

    const fromSnapshot: EntitlementStateSnapshot | null = fromDbRow
      ? toStateSnapshot(fromDbRow)
      : null

    if (result.action === 'create') {
      // INSERT novo customer_entitlement
      const inserted = await tx
        .insert(customerEntitlement)
        .values({
          contactId: incoming.contactId,
          brandId: incoming.brandId,
          kind: incoming.kind,
          refKind: incoming.refKind,
          refId: incoming.refId,
          quantity: incoming.quantity,
          startedAt: incoming.startedAt,
          endsAt: incoming.endsAt ?? undefined,
          status: 'active',
          originTransactionId: transactionId,
          lastUpdateTransactionId: transactionId,
          accessRule: incoming.accessRule,
        })
        .returning()

      resultEntitlement = inserted[0]!

      // INSERT entitlement_history
      await tx.insert(entitlementHistory).values({
        entitlementId: resultEntitlement.id,
        from: fromSnapshot,
        to: toStateSnapshot(resultEntitlement),
        reason: result.reason,
        causedByTransactionId: transactionId,
      })

      // TE-ENTITLEMENT-GRANTED
      await emit(
        {
          contactId: trx.contactId,
          brandId: trx.brandId,
          kind: 'entitlement_granted',
          source: 'MOD-ENTITLEMENT',
          actorSystem: 'grantFromTransaction',
          subjectKind: 'entitlement',
          subjectId: resultEntitlement.id,
          payload: {
            entitlement_id: resultEntitlement.id,
            kind: resultEntitlement.kind,
            ref_id: resultEntitlement.refId,
            ...(resultEntitlement.endsAt != null
              ? { ends_at: resultEntitlement.endsAt.toISOString() }
              : {}),
          },
        },
        tx,
      )
    } else if (result.action === 'reactivate') {
      // UPDATE: reativar com parâmetros do incoming
      const next = result.next
      const updated = await tx
        .update(customerEntitlement)
        .set({
          quantity: next.quantity,
          startedAt: next.startedAt,
          endsAt: next.endsAt ?? null,
          status: 'active',
          accessRule: next.accessRule,
          lastUpdateTransactionId: transactionId,
          updatedAt: now,
        })
        .where(eq(customerEntitlement.id, next.id))
        .returning()

      resultEntitlement = updated[0]!

      // INSERT entitlement_history
      await tx.insert(entitlementHistory).values({
        entitlementId: resultEntitlement.id,
        from: fromSnapshot,
        to: toStateSnapshot(resultEntitlement),
        reason: result.reason,
        causedByTransactionId: transactionId,
      })

      // BR-ENTITLEMENT-CONSOLIDATION: reactivate emite TE-ENTITLEMENT-GRANTED
      await emit(
        {
          contactId: trx.contactId,
          brandId: trx.brandId,
          kind: 'entitlement_granted',
          source: 'MOD-ENTITLEMENT',
          actorSystem: 'grantFromTransaction',
          subjectKind: 'entitlement',
          subjectId: resultEntitlement.id,
          payload: {
            entitlement_id: resultEntitlement.id,
            kind: resultEntitlement.kind,
            ref_id: resultEntitlement.refId,
            ...(resultEntitlement.endsAt != null
              ? { ends_at: resultEntitlement.endsAt.toISOString() }
              : {}),
          },
        },
        tx,
      )
    } else if (
      result.action === 'extend_expiration' ||
      result.action === 'promote_perpetuous' ||
      result.action === 'merge_quantity'
    ) {
      const next = result.next
      const previousEndsAt = fromDbRow?.endsAt ?? null

      const updated = await tx
        .update(customerEntitlement)
        .set({
          quantity: next.quantity,
          endsAt: next.endsAt ?? null,
          accessRule: next.accessRule,
          lastUpdateTransactionId: transactionId,
          updatedAt: now,
        })
        .where(eq(customerEntitlement.id, next.id))
        .returning()

      resultEntitlement = updated[0]!

      // INSERT entitlement_history
      await tx.insert(entitlementHistory).values({
        entitlementId: resultEntitlement.id,
        from: fromSnapshot,
        to: toStateSnapshot(resultEntitlement),
        reason: result.reason,
        causedByTransactionId: transactionId,
      })

      // TE-ENTITLEMENT-EXTENDED
      // from/to são os valores de ends_at antes e depois
      // BR-ENTITLEMENT-CONSOLIDATION: promote_perpetuous e merge_quantity também emitem EXTENDED
      const fromValue =
        previousEndsAt != null
          ? previousEndsAt.toISOString()
          : new Date(0).toISOString()
      const toValue =
        resultEntitlement.endsAt != null
          ? resultEntitlement.endsAt.toISOString()
          : new Date(0).toISOString()

      await emit(
        {
          contactId: trx.contactId,
          brandId: trx.brandId,
          kind: 'entitlement_extended',
          source: 'MOD-ENTITLEMENT',
          actorSystem: 'grantFromTransaction',
          subjectKind: 'entitlement',
          subjectId: resultEntitlement.id,
          payload: {
            entitlement_id: resultEntitlement.id,
            from: fromValue,
            to: toValue,
          },
        },
        tx,
      )
    } else {
      // noop — apenas INSERT em history para rastreabilidade
      // result.action === 'noop'
      // existing é não-nulo aqui (noop só ocorre quando há existing)
      resultEntitlement = fromDbRow!

      await tx.insert(entitlementHistory).values({
        entitlementId: resultEntitlement.id,
        from: fromSnapshot,
        to: toStateSnapshot(resultEntitlement),
        reason: result.reason,
        causedByTransactionId: transactionId,
      })
      // Noop: não emite evento de timeline
    }

    results.push(resultEntitlement)
  }

  return results
}
