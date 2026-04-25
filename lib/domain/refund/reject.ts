/**
 * MOD-REFUND — rejectRefund
 *
 * T-8-18
 * docs/20-domain/14-refund.md §6 transições
 * BR-REFUND: rejeição de solicitação de reembolso
 *
 * ADR-10: retorna Promise<Refund> e lança DomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 *
 * Zero I/O direto: consome tx para DB e emit (injetável) para timeline.
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  refund,
  refundStatusHistory,
  type Refund,
} from '@/lib/db/schema/refund'
import { transaction } from '@/lib/db/schema/transaction'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'
import {
  RefundNotFoundError,
  InvalidRefundStatusError,
} from './errors'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EmitFn = (input: TimelineEventInput, tx?: DbTx) => Promise<unknown>

// ---------------------------------------------------------------------------
// rejectRefund
// ---------------------------------------------------------------------------

/**
 * Rejeita um refund em status 'requested'.
 *
 * Passos:
 * 1. Busca refund (com join na transaction para contactId/brandId)
 * 2. Valida status == 'requested'
 * 3. UPDATE refund.status = 'rejected', seta rejected_at
 * 4. INSERT em refund_status_history
 * 5. Emite TE-REFUND-REJECTED
 *
 * @param tx              Transação DB ativa (ADR-11)
 * @param refundId        UUID do refund a rejeitar
 * @param approverUserId  UUID do usuário que rejeita (admin|financial — INV-REFUND-02)
 * @param reason          Motivo da rejeição
 * @param emit            Função de emissão de timeline (padrão: emitTimelineEvent)
 * @returns               Refund com status='rejected'
 * @throws                RefundNotFoundError se refundId não existir
 * @throws                InvalidRefundStatusError se status não é 'requested'
 */
export async function rejectRefund(
  tx: DbTx,
  refundId: string,
  approverUserId: string,
  reason: string,
  emit: EmitFn = emitTimelineEvent,
): Promise<Refund> {
  // -------------------------------------------------------------------------
  // Busca o refund com join na transaction (para contactId/brandId da timeline)
  // -------------------------------------------------------------------------
  const rows = await tx
    .select({
      refundId: refund.id,
      refundStatus: refund.status,
      transactionId: refund.transactionId,
      contactId: transaction.contactId,
      brandId: transaction.brandId,
    })
    .from(refund)
    .innerJoin(transaction, eq(transaction.id, refund.transactionId))
    .where(eq(refund.id, refundId))
    .limit(1)

  const row = rows[0]

  if (!row) {
    throw new RefundNotFoundError(refundId)
  }

  // -------------------------------------------------------------------------
  // Validar status — só 'requested' pode ser rejeitado
  // docs/20-domain/14-refund.md §6
  // -------------------------------------------------------------------------
  if (row.refundStatus !== 'requested') {
    throw new InvalidRefundStatusError(refundId, row.refundStatus, 'requested')
  }

  // -------------------------------------------------------------------------
  // Passo 3: UPDATE refund.status = 'rejected', seta rejected_at
  // docs/20-domain/14-refund.md §6 transições
  // -------------------------------------------------------------------------
  const rejectedRows = await tx
    .update(refund)
    .set({
      status: 'rejected',
      approvedByUserId: approverUserId,
      rejectedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(refund.id, refundId))
    .returning()

  const rejectedRefund = rejectedRows[0]
  if (!rejectedRefund) {
    throw new Error('rejectRefund: UPDATE refund returned no rows')
  }

  // -------------------------------------------------------------------------
  // Passo 4: INSERT em refund_status_history
  // docs/20-domain/14-refund.md §3.3 — padrão append-only
  // -------------------------------------------------------------------------
  await tx.insert(refundStatusHistory).values({
    refundId,
    fromStatus: 'requested',
    toStatus: 'rejected',
    changedBy: approverUserId,
    reason,
  })

  // -------------------------------------------------------------------------
  // Passo 5: Emite TE-REFUND-REJECTED
  // docs/20-domain/14-refund.md §9, lib/timeline/schemas/refund-events.ts
  // Payload: { refund_id, transaction_id, reason }
  // -------------------------------------------------------------------------
  await emit(
    {
      contactId: row.contactId,
      brandId: row.brandId,
      kind: 'refund_rejected',
      source: 'MOD-REFUND',
      actorUserId: approverUserId,
      subjectKind: 'refund',
      subjectId: refundId,
      payload: {
        refund_id: refundId,
        transaction_id: row.transactionId,
        reason,
      },
    },
    tx,
  )

  return rejectedRefund
}
