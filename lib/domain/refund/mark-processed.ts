/**
 * MOD-REFUND — markProcessed
 *
 * T-8-18
 * docs/20-domain/14-refund.md §6 transições
 * BR-REFUND: confirmação do estorno pelo provedor externo
 *
 * ADR-10: retorna Promise<Refund> e lança DomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 *
 * Chamado pelo handler do webhook do provedor ao confirmar que o estorno foi processado.
 *
 * Zero I/O direto: consome tx para DB.
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  refund,
  refundStatusHistory,
  type Refund,
} from '@/lib/db/schema/refund'
import { integrationProviderEnum } from '@/lib/db/schema/webhook-log'
import {
  RefundNotFoundError,
  InvalidRefundStatusError,
} from './errors'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type IntegrationProvider = (typeof integrationProviderEnum.enumValues)[number]

export type MarkProcessedInput = {
  refundId: string
  externalRefundId: string
  provider: IntegrationProvider
}

// ---------------------------------------------------------------------------
// markProcessed
// ---------------------------------------------------------------------------

/**
 * Marca um refund como 'processed' após confirmação do provedor externo.
 *
 * Passos:
 * 1. Busca refund + valida status == 'approved'
 * 2. UPDATE refund.status = 'processed', seta processed_at, external_refund_id, external_provider
 * 3. INSERT em refund_status_history
 *
 * @param tx              Transação DB ativa (ADR-11)
 * @param refundId        UUID do refund a marcar como processado
 * @param externalRefundId ID do estorno no provedor externo
 * @param provider        Provedor externo que confirmou o estorno
 * @returns               Refund com status='processed'
 * @throws                RefundNotFoundError se refundId não existir
 * @throws                InvalidRefundStatusError se status não é 'approved'
 */
export async function markProcessed(
  tx: DbTx,
  refundId: string,
  externalRefundId: string,
  provider: IntegrationProvider,
): Promise<Refund> {
  // -------------------------------------------------------------------------
  // Busca o refund
  // -------------------------------------------------------------------------
  const refundRows = await tx
    .select({
      id: refund.id,
      status: refund.status,
    })
    .from(refund)
    .where(eq(refund.id, refundId))
    .limit(1)

  const existing = refundRows[0]

  if (!existing) {
    throw new RefundNotFoundError(refundId)
  }

  // -------------------------------------------------------------------------
  // Validar status — só 'approved' pode ser marcado como processed
  // docs/20-domain/14-refund.md §6
  // Webhook do provedor confirma estorno → approved → processed
  // -------------------------------------------------------------------------
  if (existing.status !== 'approved') {
    throw new InvalidRefundStatusError(refundId, existing.status, 'approved')
  }

  // -------------------------------------------------------------------------
  // Passo 2: UPDATE refund.status = 'processed'
  // Preenche external_refund_id, external_provider, processed_at
  // docs/20-domain/14-refund.md §3.1 campos external_refund_id, external_provider
  // -------------------------------------------------------------------------
  const processedRows = await tx
    .update(refund)
    .set({
      status: 'processed',
      externalRefundId,
      externalProvider: provider,
      processedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(refund.id, refundId))
    .returning()

  const processedRefund = processedRows[0]
  if (!processedRefund) {
    throw new Error('markProcessed: UPDATE refund returned no rows')
  }

  // -------------------------------------------------------------------------
  // Passo 3: INSERT em refund_status_history
  // docs/20-domain/14-refund.md §3.3 — padrão append-only
  // -------------------------------------------------------------------------
  await tx.insert(refundStatusHistory).values({
    refundId,
    fromStatus: 'approved',
    toStatus: 'processed',
    changedBy: null,
    reason: `external_refund_id:${externalRefundId}`,
  })

  return processedRefund
}
