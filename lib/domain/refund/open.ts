/**
 * MOD-REFUND — openRefund
 *
 * T-8-18
 * docs/20-domain/14-refund.md §5 invariantes, §6 transições
 * BR-REFUND: abertura de solicitação de reembolso
 *
 * ADR-10: retorna Promise<Refund> e lança DomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 *
 * Zero I/O direto: consome tx para DB e emit (injetável) para timeline.
 */
import { and, eq, inArray } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { transaction } from '@/lib/db/schema/transaction'
import {
  refund,
  refundStatusHistory,
  type Refund,
} from '@/lib/db/schema/refund'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'
import {
  RefundTransactionNotFoundError,
  TransactionNotApprovedError,
  ActiveRefundExistsError,
} from './errors'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type OpenRefundInput = {
  transactionId: string
  userId: string
  amount: string // numeric(12,2) como string
  reason: string
}

export type EmitFn = (input: TimelineEventInput, tx?: DbTx) => Promise<unknown>

// ---------------------------------------------------------------------------
// openRefund
// ---------------------------------------------------------------------------

/**
 * Abre uma solicitação de reembolso para uma transação aprovada.
 *
 * Passos:
 * 1. Verifica que a transação existe e está em status 'approved'
 * 2. INV-REFUND-01: verifica que não existe refund ativo (requested|approved) para a transação
 * 3. INSERT em refund com status='requested'
 * 4. INSERT em refund_status_history
 * 5. Emite TE-REFUND-OPENED
 *
 * @param tx            Transação DB ativa (ADR-11)
 * @param transactionId UUID da transação a reembolsar
 * @param userId        UUID do usuário que abre o refund (support/financial/admin)
 * @param amount        Valor do reembolso (string numeric(12,2))
 * @param reason        Motivo da solicitação
 * @param emit          Função de emissão de timeline (padrão: emitTimelineEvent)
 * @returns             Refund criado com status='requested'
 * @throws              RefundTransactionNotFoundError se transação não existe
 * @throws              TransactionNotApprovedError se transação não está aprovada
 * @throws              ActiveRefundExistsError se já existe refund ativo (INV-REFUND-01)
 */
export async function openRefund(
  tx: DbTx,
  transactionId: string,
  userId: string,
  amount: string,
  reason: string,
  emit: EmitFn = emitTimelineEvent,
): Promise<Refund> {
  // -------------------------------------------------------------------------
  // Passo 1: verificar que a transação existe e está 'approved'
  // docs/20-domain/14-refund.md §6 — guarda de abertura
  // -------------------------------------------------------------------------
  const trxRows = await tx
    .select({
      id: transaction.id,
      status: transaction.status,
      contactId: transaction.contactId,
      brandId: transaction.brandId,
    })
    .from(transaction)
    .where(eq(transaction.id, transactionId))
    .limit(1)

  const trx = trxRows[0]

  if (!trx) {
    throw new RefundTransactionNotFoundError(transactionId)
  }

  if (trx.status !== 'approved') {
    // BR-REFUND: só transações approved podem ter refund aberto
    throw new TransactionNotApprovedError(transactionId, trx.status)
  }

  // -------------------------------------------------------------------------
  // Passo 2: INV-REFUND-01 — não pode haver refund ativo para mesma transação
  // docs/20-domain/14-refund.md §5 INV-REFUND-01
  // O índice parcial uq_refund_active_per_transaction barra no DB,
  // mas verificamos antes para dar erro de negócio explícito.
  // -------------------------------------------------------------------------

  // INV-REFUND-01: verifica refund ativo (requested|approved) para a transação
  const activeRefundRows = await tx
    .select({ id: refund.id })
    .from(refund)
    .where(
      and(
        eq(refund.transactionId, transactionId),
        inArray(refund.status, ['requested', 'approved']),
      ),
    )
    .limit(1)

  const activeRefund = activeRefundRows[0]
  if (activeRefund) {
    // INV-REFUND-01: transação já possui um refund ativo
    throw new ActiveRefundExistsError(transactionId, activeRefund.id)
  }

  // -------------------------------------------------------------------------
  // Passo 3: INSERT em refund com status='requested'
  // docs/20-domain/14-refund.md §3.1
  // -------------------------------------------------------------------------
  const newRefundRows = await tx
    .insert(refund)
    .values({
      transactionId,
      openedByUserId: userId,
      amount,
      reason,
      status: 'requested',
    })
    .returning()

  const newRefund = newRefundRows[0]
  if (!newRefund) {
    throw new Error('openRefund: INSERT refund returned no rows')
  }

  // -------------------------------------------------------------------------
  // Passo 4: INSERT em refund_status_history
  // docs/20-domain/14-refund.md §3.3 — padrão append-only
  // -------------------------------------------------------------------------
  await tx.insert(refundStatusHistory).values({
    refundId: newRefund.id,
    fromStatus: null,
    toStatus: 'requested',
    changedBy: userId,
    reason,
  })

  // -------------------------------------------------------------------------
  // Passo 5: Emite TE-REFUND-OPENED
  // docs/30-contracts/03-timeline-event-catalog.md §Oferta/Transação/Direito
  // -------------------------------------------------------------------------
  // TE-REFUND-OPENED payload: { refund_id, transaction_id, reason }
  // docs/20-domain/14-refund.md §9, lib/timeline/schemas/refund-events.ts
  await emit(
    {
      contactId: trx.contactId,
      brandId: trx.brandId,
      kind: 'refund_opened',
      source: 'MOD-REFUND',
      actorUserId: userId,
      subjectKind: 'refund',
      subjectId: newRefund.id,
      payload: {
        refund_id: newRefund.id,
        transaction_id: transactionId,
        reason,
      },
    },
    tx,
  )

  return newRefund
}
