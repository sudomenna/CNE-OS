/**
 * MOD-ENTITLEMENT — revokeByTransaction
 *
 * Chamado por MOD-REFUND para revogar todos os direitos originados de uma transação.
 *
 * docs/20-domain/12-entitlement.md §2 (interface pública), §10 (fluxo de revogação)
 * INV-ENT-07: revogação nunca apaga registro; marca status='revoked' e registra em entitlement_history.
 * INV-ENT-06: mudança de status gera linha em entitlement_status_history.
 * ADR-10: funções públicas retornam Promise<T> e lançam DomainError.
 * ADR-11: funções que mutam estado recebem tx: DbTx como primeiro argumento.
 */
import { and, eq, ne } from 'drizzle-orm'

import type { DbTx } from '@/lib/db/client'
import {
  customerEntitlement,
  entitlementHistory,
  entitlementStatusHistory,
  type CustomerEntitlement,
} from '@/lib/db/schema/entitlement'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class EntitlementDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EntitlementDomainError'
  }
}

/**
 * Lançado quando nenhum entitlement é encontrado para o transactionId fornecido
 * (ou todos já estavam revogados).
 *
 * ADR-10: NotFoundError
 */
export class EntitlementNotFoundError extends EntitlementDomainError {
  readonly transactionId: string

  constructor(transactionId: string) {
    super(`no active entitlements found for transaction ${transactionId}`)
    this.name = 'EntitlementNotFoundError'
    this.transactionId = transactionId
  }
}

// ---------------------------------------------------------------------------
// revokeByTransaction
// ---------------------------------------------------------------------------

/**
 * Revoga todos os `customer_entitlement` com `origin_transaction_id = transactionId`
 * e `status != 'revoked'`.
 *
 * Para cada entitlement revogado:
 *  - UPDATE status → 'revoked'
 *  - INSERT entitlement_history (snapshot before/after)
 *  - INSERT entitlement_status_history (transição de status)
 *
 * INV-ENT-07: nunca apaga; apenas marca 'revoked'.
 * INV-ENT-06: cada mudança de status gera linha em entitlement_status_history.
 *
 * @param tx     Drizzle transaction (ADR-11).
 * @param transactionId  ID da transação de origem dos entitlements a revogar.
 * @param reason Motivo da revogação (ex.: 'refund_revoke').
 * @returns      Array com os entitlements no estado 'revoked'.
 * @throws       EntitlementNotFoundError se nenhum entitlement (não-revogado) for encontrado.
 */
export async function revokeByTransaction(
  tx: DbTx,
  transactionId: string,
  reason: string,
): Promise<CustomerEntitlement[]> {
  // 1. Busca todos os entitlements da transação que ainda não estão revogados.
  //    Já-revogados são silenciosamente ignorados (idempotência).
  // INV-ENT-07: status != 'revoked' — só reprocessamos não-revogados.
  const toRevoke = await tx
    .select()
    .from(customerEntitlement)
    .where(
      and(
        eq(customerEntitlement.originTransactionId, transactionId),
        ne(customerEntitlement.status, 'revoked'),
      ),
    )

  // 2. Nenhum entitlement encontrado → lança NotFoundError.
  if (toRevoke.length === 0) {
    throw new EntitlementNotFoundError(transactionId)
  }

  const revokedEntitlements: CustomerEntitlement[] = []

  for (const ent of toRevoke) {
    const previousStatus = ent.status
    const now = new Date()

    // 3. Snapshot "before" para entitlement_history.
    const snapshotBefore = {
      started_at: ent.startedAt,
      ends_at: ent.endsAt,
      quantity: ent.quantity,
      status: previousStatus,
    }

    // 4. UPDATE status → 'revoked'.
    // INV-ENT-07: nunca DELETE; apenas UPDATE status.
    const [revoked] = await tx
      .update(customerEntitlement)
      .set({ status: 'revoked', updatedAt: now })
      .where(eq(customerEntitlement.id, ent.id))
      .returning()

    if (revoked === undefined) {
      // Corrida improvável; não deve acontecer dentro da mesma tx.
      throw new EntitlementDomainError(
        `failed to update entitlement ${ent.id} — row disappeared mid-transaction`,
      )
    }

    // 5. Snapshot "after" para entitlement_history.
    const snapshotAfter = {
      started_at: revoked.startedAt,
      ends_at: revoked.endsAt,
      quantity: revoked.quantity,
      status: revoked.status,
    }

    // 6. INSERT entitlement_history (append-only; INV-ENT-03).
    // BR-REFUND: razão refund_revoke indica origem do reembolso.
    await tx.insert(entitlementHistory).values({
      entitlementId: ent.id,
      from: snapshotBefore,
      to: snapshotAfter,
      reason,
      causedByTransactionId: transactionId,
    })

    // 7. INSERT entitlement_status_history (INV-ENT-06).
    await tx.insert(entitlementStatusHistory).values({
      entitlementId: ent.id,
      fromStatus: previousStatus,
      toStatus: 'revoked',
      reason,
    })

    revokedEntitlements.push(revoked)
  }

  // 8. Retorna array dos entitlements revogados.
  return revokedEntitlements
}
