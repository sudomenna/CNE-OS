/**
 * MOD-TRANSACTION — approveTransaction
 *
 * T-8-11
 * docs/20-domain/11-transaction-snapshot.md §10 (fluxo FLOW-05, passos 1-12)
 * BR-OFFER-UNIQUENESS: verifica duplicidade antes de aprovar
 * BR-SNAPSHOT-IMMUTABILITY: snapshot INSERT apenas — nunca UPDATE
 *
 * ADR-10: funções públicas retornam Promise<T>, lançam DomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 *
 * Zero I/O direto. Consome:
 *   - tx: DbTx para acesso ao DB
 *   - grantFromTransaction (MOD-ENTITLEMENT) — injetável
 *   - reclassifyContact — injetável (wraps classifyContact + persist)
 *   - markWonForContact — injetável (wraps markWon para entradas abertas do contato)
 *   - emit — injetável (emitTimelineEvent)
 */

import { and, eq, ne, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  transaction,
  transactionSnapshot,
  transactionItem,
  transactionStatusHistory,
} from '@/lib/db/schema/transaction'
import { offer } from '@/lib/db/schema/offer'
import type { Transaction } from '@/lib/db/schema/transaction'
import { composeSnapshot } from './snapshot'
import { grantFromTransaction as defaultGrantFromTransaction } from '@/lib/domain/entitlement/grant'
import { incrementSalesCounter } from '@/lib/domain/offer/sales-counter'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'
import {
  TransactionNotFoundError,
  DuplicateOfferPurchaseError,
} from './errors'
import { assertRenewalEligibility } from '@/lib/domain/offer/renewal'

// ---------------------------------------------------------------------------
// Erros específicos de approveTransaction (ADR-10)
// ---------------------------------------------------------------------------

/**
 * Lançado quando se tenta aprovar uma transação que já está aprovada.
 * docs/20-domain/11-transaction-snapshot.md §6 — idempotência: approved → approved = erro.
 */
export class TransactionAlreadyApprovedError extends Error {
  readonly transactionId: string
  readonly name = 'TransactionAlreadyApprovedError'

  constructor(transactionId: string) {
    super(`transaction ${transactionId} is already approved`)
    this.transactionId = transactionId
  }
}

/**
 * Lançado quando se tenta aprovar uma transação em status inválido (nem 'pending').
 * docs/20-domain/11-transaction-snapshot.md §6 — só pending pode transitar para approved.
 */
export class InvalidTransactionStatusError extends Error {
  readonly transactionId: string
  readonly currentStatus: string
  readonly name = 'InvalidTransactionStatusError'

  constructor(transactionId: string, currentStatus: string) {
    super(
      `transaction ${transactionId} cannot be approved from status '${currentStatus}' — only 'pending' transitions to 'approved'`,
    )
    this.transactionId = transactionId
    this.currentStatus = currentStatus
  }
}

// ---------------------------------------------------------------------------
// Tipos de dependências injetáveis (facilitam testes unitários)
// ---------------------------------------------------------------------------

export type GrantFn = (tx: DbTx, transactionId: string) => Promise<unknown>

/**
 * Função injetável para reclassificar o contato após aprovação.
 * Na produção, wrapper de classifyContact + persist.
 * Em testes, mock simples.
 */
export type ReclassifyFn = (tx: DbTx, contactId: string) => Promise<void>

/**
 * Função injetável para fechar oportunidades abertas do contato como won.
 * Na produção, busca entradas abertas de funil do contato e chama markWon.
 * Em testes, mock simples.
 */
export type MarkWonFn = (tx: DbTx, contactId: string, transactionId: string) => Promise<void>

export type EmitFn = (input: TimelineEventInput, tx?: DbTx) => Promise<unknown>

// ---------------------------------------------------------------------------
// Deps injetáveis (permitindo no-ops como padrão seguro)
// ---------------------------------------------------------------------------

const noopReclassify: ReclassifyFn = async (_tx, _contactId) => {
  // Stub: reclassify persistente será implementado em tarefa separada (T-8-xx)
  // BR-CONTACT-CLASSIFICATION: MOD-CONTACT.reclassify é a interface pública alvo
}

const noopMarkWon: MarkWonFn = async (_tx, _contactId, _transactionId) => {
  // Stub: markWon por contactId será orquestrado via MOD-FUNNEL.markWon por entryId
  // A busca de funnel entries abertas e o markWon por lote ficam em T-8-xx
}

// ---------------------------------------------------------------------------
// approveTransaction — orquestrador dos 12 passos atômicos
// ---------------------------------------------------------------------------

/**
 * Aprova uma transação pendente, executando todos os 12 passos atômicos
 * dentro de uma única transação SQL.
 *
 * Passos (docs/20-domain/11-transaction-snapshot.md §10):
 * 1.  SELECT ... FOR UPDATE em `transaction` (evita race)
 * 2.  Verificar BR-OFFER-UNIQUENESS — lança DuplicateOfferPurchaseError se violado
 * 3.  selectCondition — selecionar condição comercial (validado na criação; snapshot vai registrar)
 * 4.  incrementSalesCounter(tx, offerId) — atômico (ADR-07)
 * 5.  composeSnapshot(tx, transactionId) — serializa payload v1
 * 6.  INSERT em transaction_snapshot
 * 7.  INSERT em transaction_item por item do snapshot
 * 8.  UPDATE transaction: status='approved', approved_at=now(), snapshot_id=<novo>
 * 9.  INSERT em transaction_status_history
 * 10. grantFromTransaction(tx, transactionId) — concede/consolida entitlements
 * 11. reclassifyContact(tx, contactId) — reclassifica contato (MOD-CONTACT)
 * 12. markWonForContact(tx, contactId, transactionId) — fecha oportunidade no funil (MOD-FUNNEL)
 * 13. Emite TE-SALE-APPROVED via emitTimelineEvent
 *
 * Falha em qualquer passo = rollback total (a transação SQL fornecida pelo caller garante isso).
 *
 * @param tx             Transação DB ativa (ADR-11) — caller é responsável por BEGIN/COMMIT/ROLLBACK
 * @param transactionId  UUID da transação a aprovar
 * @param externalRef    ID externo do provedor (opcional — para linkagem de auditoria)
 * @param grantFn        Função de concessão de entitlements (padrão: grantFromTransaction)
 * @param reclassifyFn   Função de reclassificação de contato (padrão: no-op — implementar em T-8-xx)
 * @param markWonFn      Função de fechamento de oportunidade (padrão: no-op — implementar em T-8-xx)
 * @param emit           Função de emissão de timeline (padrão: emitTimelineEvent)
 *
 * @returns Transação com status='approved'
 * @throws  TransactionNotFoundError        se transactionId não existir
 * @throws  TransactionAlreadyApprovedError se status já é 'approved' (idempotência)
 * @throws  InvalidTransactionStatusError   se status não é 'pending'
 * @throws  DuplicateOfferPurchaseError     se BR-OFFER-UNIQUENESS seria violada
 */
export async function approveTransaction(
  tx: DbTx,
  transactionId: string,
  externalRef?: string,
  grantFn: GrantFn = defaultGrantFromTransaction,
  reclassifyFn: ReclassifyFn = noopReclassify,
  markWonFn: MarkWonFn = noopMarkWon,
  emit: EmitFn = emitTimelineEvent,
): Promise<Transaction> {
  // -------------------------------------------------------------------------
  // Passo 1: SELECT ... FOR UPDATE — evitar race de aprovação dupla
  // docs/20-domain/11-transaction-snapshot.md §10 passo 1
  // -------------------------------------------------------------------------
  const lockedRows = await tx.execute(
    sql`SELECT * FROM transaction WHERE id = ${transactionId} FOR UPDATE LIMIT 1`,
  )

  const rawTrx = (lockedRows as unknown as Array<Record<string, unknown>>)[0]

  if (!rawTrx) {
    throw new TransactionNotFoundError(transactionId)
  }

  const currentStatus = rawTrx['status'] as string
  const contactId = rawTrx['contact_id'] as string
  const offerId = rawTrx['offer_id'] as string
  const brandId = rawTrx['brand_id'] as string
  const offerConditionId = rawTrx['offer_condition_id'] as string

  // -------------------------------------------------------------------------
  // Passo 1b: validar status — idempotência e guarda de transição
  // docs/20-domain/11-transaction-snapshot.md §6
  // -------------------------------------------------------------------------
  if (currentStatus === 'approved') {
    // BR-SNAPSHOT-IMMUTABILITY: already approved → não reprocessar
    throw new TransactionAlreadyApprovedError(transactionId)
  }

  if (currentStatus !== 'pending') {
    throw new InvalidTransactionStatusError(transactionId, currentStatus)
  }

  // -------------------------------------------------------------------------
  // Passo 2: BR-OFFER-UNIQUENESS — verificar se já existe approved para (contact, offer)
  // docs/50-business-rules/BR-OFFER-UNIQUENESS.md — defesa em profundidade
  // O índice parcial uq_transaction_unique_offer_per_contact já barra no DB,
  // mas verificamos antes para dar erro amigável e com contexto de negócio.
  // -------------------------------------------------------------------------

  // BR-OFFER-UNIQUENESS: busca transação approved diferente da atual para o mesmo (contact, offer)
  const existingApproved = await tx
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.contactId, contactId),
        eq(transaction.offerId, offerId),
        eq(transaction.status, 'approved'),
        ne(transaction.id, transactionId),
      ),
    )
    .limit(1)

  if (existingApproved.length > 0) {
    // BR-OFFER-UNIQUENESS: contato já tem outra transação approved para esta oferta
    throw new DuplicateOfferPurchaseError(contactId, offerId)
  }

  // -------------------------------------------------------------------------
  // Passo 2b: BR-RENEWAL — verificar elegibilidade de renovação (se aplicável)
  // docs/60-flows/10-renewal-via-new-offer.md §passo 3
  // docs/50-business-rules/BR-RENEWAL.md §Enforcement
  // -------------------------------------------------------------------------
  const offerTypeRows = await tx
    .select({ type: offer.type })
    .from(offer)
    .where(eq(offer.id, offerId))
    .limit(1)

  const offerType = offerTypeRows[0]?.type

  if (offerType === 'renewal') {
    // BR-RENEWAL: verificar entitlement ativo da oferta original antes de aprovar
    await assertRenewalEligibility(tx, contactId, offerId)
  }

  // -------------------------------------------------------------------------
  // Passo 3: selectCondition
  // Na prática, a condição já foi escolhida em createPendingTransaction e está
  // em offer_condition_id. composeSnapshot vai registrar a condição escolhida.
  // Aqui não repetimos a seleção — a condição já está fixada na transação.
  // BR-OFFER-DECISION: se houve conflito, a transação teria ficado em pending
  // aguardando resolução manual. Ao chegar em approveTransaction, a condição
  // já foi determinada.
  // -------------------------------------------------------------------------
  // offerConditionId already available from the locked row above; used in snapshot below.
  void offerConditionId // explicitly acknowledging we have it

  // -------------------------------------------------------------------------
  // Passo 4: incrementSalesCounter — UPDATE atômico (ADR-07)
  // docs/20-domain/10-offer-engine.md §3.7
  // -------------------------------------------------------------------------
  await incrementSalesCounter(tx, offerId)

  // -------------------------------------------------------------------------
  // Passo 5: composeSnapshot — serializa payload v1 (função pura com leitura DB)
  // BR-SNAPSHOT-IMMUTABILITY: captura o estado ATUAL de offer, condition, items, etc.
  // -------------------------------------------------------------------------
  const payload = await composeSnapshot(tx, transactionId)

  // Enriquecer source com externalRef se fornecido
  if (externalRef != null && payload.source != null) {
    payload.source.external_id = externalRef
  }

  // -------------------------------------------------------------------------
  // Passo 6: INSERT em transaction_snapshot
  // BR-SNAPSHOT-IMMUTABILITY: append-only — trigger bloqueia UPDATE/DELETE
  // -------------------------------------------------------------------------
  const snapshotRows = await tx
    .insert(transactionSnapshot)
    .values({
      transactionId,
      flag: 'normal',
      payload: payload as unknown as Record<string, unknown>,
    })
    .returning()

  const snapshot = snapshotRows[0]
  if (!snapshot) {
    throw new Error('approveTransaction: INSERT transaction_snapshot returned no rows')
  }

  // -------------------------------------------------------------------------
  // Passo 7: INSERT em transaction_item por item do snapshot
  // docs/20-domain/11-transaction-snapshot.md §3.4
  // -------------------------------------------------------------------------
  for (const item of payload.items) {
    await tx.insert(transactionItem).values({
      transactionId,
      snapshotId: snapshot.id,
      itemKind: item.kind,
      productId: item.product?.id ?? null,
      commercialBenefitId: item.commercial_benefit?.id ?? null,
      quantity: item.quantity,
      resolvedRules: {
        ...item.access_rule,
        vigency_months: item.vigency_months,
      },
      responsibleUserId: item.responsible_user_id ?? null,
      deliveryStatus: 'pending',
    })
  }

  // -------------------------------------------------------------------------
  // Passo 8: UPDATE transaction — status='approved', snapshot_id, approved_at
  // INV-TRX-02: ck_transaction_approved_coherence exige approved_at + snapshot_id NOT NULL
  // -------------------------------------------------------------------------
  const updatedRows = await tx
    .update(transaction)
    .set({
      status: 'approved',
      snapshotId: snapshot.id,
      approvedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(transaction.id, transactionId))
    .returning()

  const updatedTrx = updatedRows[0]
  if (!updatedTrx) {
    throw new Error('approveTransaction: UPDATE transaction returned no rows')
  }

  // -------------------------------------------------------------------------
  // Passo 9: INSERT em transaction_status_history
  // docs/20-domain/11-transaction-snapshot.md §3.5 — append-only
  // -------------------------------------------------------------------------
  await tx.insert(transactionStatusHistory).values({
    transactionId,
    fromStatus: 'pending',
    toStatus: 'approved',
    actorSystem: 'approveTransaction',
    reason: externalRef != null ? `external_ref:${externalRef}` : 'approved',
  })

  // -------------------------------------------------------------------------
  // Passo 10: grantFromTransaction — conceder/consolidar entitlements
  // MOD-ENTITLEMENT interface pública (docs/30-contracts/07-module-interfaces.md §MOD-ENTITLEMENT)
  // BR-ENTITLEMENT-CONSOLIDATION: grantFromTransaction aplica consolidação
  // -------------------------------------------------------------------------
  await grantFn(tx, transactionId)

  // -------------------------------------------------------------------------
  // Passo 11: reclassifyContact — reclassificar contato
  // MOD-CONTACT interface pública: classifyContact (pura) + persist
  // BR-CONTACT-CLASSIFICATION: hierarquia mentorado > student > customer > lead
  // -------------------------------------------------------------------------
  await reclassifyFn(tx, contactId)

  // -------------------------------------------------------------------------
  // Passo 12: markWonForContact — fechar oportunidade no funil
  // MOD-FUNNEL interface pública: markWon(tx, entryId, transactionId)
  // docs/20-domain/11-transaction-snapshot.md §10 passo 10
  // -------------------------------------------------------------------------
  await markWonFn(tx, contactId, transactionId)

  // -------------------------------------------------------------------------
  // Passo 13: Emitir TE-SALE-APPROVED
  // docs/30-contracts/03-timeline-event-catalog.md §Oferta/Transação/Direito
  // Payload obrigatório: { transaction_id, offer_id, condition_id, snapshot_id }
  // -------------------------------------------------------------------------
  await emit(
    {
      contactId,
      brandId,
      kind: 'sale_approved',
      source: 'MOD-TRANSACTION',
      actorSystem: 'approveTransaction',
      subjectKind: 'transaction',
      subjectId: transactionId,
      payload: {
        transaction_id: transactionId,
        offer_id: offerId,
        condition_id: offerConditionId,
        snapshot_id: snapshot.id,
      },
    },
    tx,
  )

  return updatedTrx
}
