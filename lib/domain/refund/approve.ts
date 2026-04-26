/**
 * MOD-REFUND — approveRefund
 *
 * T-8-18
 * docs/20-domain/14-refund.md §5 (invariantes), §7 (efeitos colaterais — ordem canônica)
 * BR-REFUND: aprovação atômica com 8 efeitos em cascata
 * BR-SNAPSHOT-IMMUTABILITY: INV-REFUND-06 — não altera transaction_snapshot.payload
 *
 * ADR-10: retorna Promise<Refund> e lança DomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 *
 * INV-REFUND-04: tudo em 1 transação SQL; falha em qualquer passo = rollback total.
 *
 * Zero I/O direto: consome tx para DB e funções injetáveis para efeitos externos.
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  refund,
  refundEffectLog,
  refundStatusHistory,
  type Refund,
} from '@/lib/db/schema/refund'
import {
  transaction,
  transactionStatusHistory,
} from '@/lib/db/schema/transaction'
import type { CustomerEntitlement } from '@/lib/db/schema/entitlement'
import {
  subscription,
  subscriptionStatusHistory,
} from '@/lib/db/schema/billing'
import { flagSnapshotRefunded } from '@/lib/domain/transaction/flag-snapshot'
import { revokeByTransaction } from '@/lib/domain/entitlement/revoke'
import { revertFunnelEntryAfterRefund } from '@/lib/domain/funnel/revert'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'
import {
  RefundNotFoundError,
  InvalidRefundStatusError,
} from './errors'

// ---------------------------------------------------------------------------
// Tipos de dependências injetáveis (facilitam testes unitários)
// ---------------------------------------------------------------------------

/**
 * Função injetável para reclassificar o contato após revogação de direitos.
 * Na produção, wrapper de MOD-CONTACT.reclassify.
 * Em testes, stub simples.
 */
export type ReclassifyFn = (tx: DbTx, contactId: string) => Promise<void>

/**
 * Função injetável para reverter oportunidade no funil.
 * Na produção, busca funnel_entry com label='won' e transactionId, seta 'reopened'.
 * Em testes, stub simples.
 */
export type RevertOpportunityFn = (tx: DbTx, transactionId: string) => Promise<void>

export type EmitFn = (input: TimelineEventInput, tx?: DbTx) => Promise<unknown>

export type RevokeByTransactionFn = (
  tx: DbTx,
  transactionId: string,
  reason: string,
) => Promise<CustomerEntitlement[]>

export type FlagSnapshotFn = (
  tx: DbTx,
  snapshotId: string,
  refundId: string,
) => Promise<void>

/**
 * Resultado do cancelamento inline de subscription durante aprovação de refund.
 * T-9-08 irá depois extrair para cancelSubscription canônica em MOD-BILLING.
 */
export type CancelledSubscriptionResult = {
  subscriptionId: string
  previousStatus: string
}

/**
 * Função injetável para cancelar subscription associada à transação.
 * Default: implementação inline direto no DB (sem importar cancel.ts — T-9-16).
 * T-9-08 irá refatorar para cancelSubscription de MOD-BILLING.
 */
export type CancelSubscriptionByTransactionFn = (
  tx: DbTx,
  transactionId: string,
  approverUserId: string,
) => Promise<CancelledSubscriptionResult | null>

// ---------------------------------------------------------------------------
// Stubs injetáveis padrão
// ---------------------------------------------------------------------------

const noopReclassify: ReclassifyFn = async (_tx, _contactId) => {
  // Stub: reclassificação de contato pós-refund — MOD-CONTACT.reclassify (T-8-xx)
  // BR-CONTACT-CLASSIFICATION: pode voltar de customer/student para lead
}


/**
 * Implementação inline de cancelamento de subscription vinculada à transação.
 *
 * BR-REFUND §7 passo 7: cancela subscription com origin_transaction_id = transactionId
 * e status IN ('trial','active','past_due').
 *
 * INV-BILL-07 (BR-SUBSCRIPTION): entitlements NÃO são revogados aqui — apenas
 * o status da subscription é marcado como 'cancelled'. Os entitlements foram
 * revogados no passo 3 (revokeByTransaction), que é específico de refund.
 * O cancelamento normal (sem refund) preserva entitlements até current_period_end.
 *
 * T-9-08 irá extrair esta lógica para cancelSubscription canônica em MOD-BILLING.
 */
const defaultCancelSubscriptionByTransaction: CancelSubscriptionByTransactionFn = async (
  tx,
  transactionId,
  approverUserId,
) => {
  // Buscar subscription ativa vinculada à transação
  // BR-REFUND §7 passo 7: status IN ('trial','active','past_due')
  const rows = await tx
    .select()
    .from(subscription)
    .where(
      // origin_transaction_id = transactionId AND status IN ('trial','active','past_due')
      sql`${subscription.originTransactionId} = ${transactionId}
          AND ${subscription.status} IN ('trial','active','past_due')`,
    )
    .limit(1)

  const sub = rows[0]
  if (!sub) {
    // Sem subscription ativa vinculada — não é erro (refund sem assinatura é válido)
    return null
  }

  // Bloqueia statuses já terminais — nunca deveria chegar aqui pela query, mas por segurança:
  if (sub.status === 'cancelled' || sub.status === 'expired') {
    return null
  }

  const previousStatus = sub.status

  // INV-BILL-04: cancelled exige cancelled_at (CHECK ck_subscription_cancelled)
  await tx
    .update(subscription)
    .set({
      status: 'cancelled',
      cancelledAt: sql`now()`,
      // BR-REFUND §7 passo 7 (SQL canônico): cancel_reason='refund'
      cancelReason: 'refund',
      updatedAt: sql`now()`,
    })
    .where(
      sql`${subscription.id} = ${sub.id}
          AND ${subscription.status} IN ('trial','active','past_due')`,
    )

  // Append subscription_status_history — padrão MOD-BILLING (BR-SUBSCRIPTION)
  await tx.insert(subscriptionStatusHistory).values({
    subscriptionId: sub.id,
    oldStatus: previousStatus as 'trial' | 'active' | 'past_due',
    newStatus: 'cancelled',
    changedBy: approverUserId,
    note: 'refund',
  })

  return { subscriptionId: sub.id, previousStatus }
}

// ---------------------------------------------------------------------------
// approveRefund
// ---------------------------------------------------------------------------

/**
 * Aprova um refund em status 'requested', executando 8 efeitos em cascata
 * dentro de uma única transação SQL (INV-REFUND-04).
 *
 * Ordem canônica dos efeitos (docs/20-domain/14-refund.md §7):
 * 1. UPDATE refund.status = 'approved' + refund_status_history
 * 2. flagSnapshotRefunded → INSERT em transaction_snapshot_flag_history
 *    + refund_effect_log kind='snapshot_flagged'
 * 3. revokeByTransaction → revoga entitlements ativos
 *    + refund_effect_log kind='entitlement_revoked' por direito
 * 4. UPDATE transaction.status = 'refunded' + transaction_status_history
 * 5. refund_effect_log já registrado nos passos anteriores per-efeito
 * 6. reclassifyContact (stub injetável) + refund_effect_log kind='contact_reclassified'
 * 7. revertOpportunity (stub injetável) + refund_effect_log kind='opportunity_reverted'
 * 8. Emite TE-REFUND-APPROVED + TE-SALE-REFUNDED + refund_effect_log kind='timeline_emitted'
 *
 * Falha em qualquer passo = rollback total (tx é gerenciada pelo caller).
 * refund.status permanece 'requested' após rollback.
 *
 * @param tx                          Transação DB ativa (ADR-11)
 * @param refundId                    UUID do refund a aprovar
 * @param approverUserId              UUID do usuário aprovador (admin|financial — INV-REFUND-02)
 * @param reclassifyFn                Fn de reclassificação de contato (padrão: no-op)
 * @param revertOpportunityFn         Fn de reversão de oportunidade (padrão: no-op)
 * @param revokeFn                    Fn de revogação de entitlements (padrão: revokeByTransaction)
 * @param flagSnapshotFn              Fn de flag de snapshot (padrão: flagSnapshotRefunded)
 * @param emit                        Fn de emissão de timeline (padrão: emitTimelineEvent)
 * @param cancelSubscriptionByTrxFn   Fn de cancelamento inline de subscription (padrão: defaultCancelSubscriptionByTransaction)
 * @returns                           Refund com status='approved'
 * @throws                            RefundNotFoundError se refundId não existir
 * @throws                            InvalidRefundStatusError se status não é 'requested'
 */
export async function approveRefund(
  tx: DbTx,
  refundId: string,
  approverUserId: string,
  reclassifyFn: ReclassifyFn = noopReclassify,
  revertOpportunityFn: RevertOpportunityFn = revertFunnelEntryAfterRefund,
  revokeFn: RevokeByTransactionFn = revokeByTransaction,
  flagSnapshotFn: FlagSnapshotFn = flagSnapshotRefunded,
  emit: EmitFn = emitTimelineEvent,
  cancelSubscriptionByTrxFn: CancelSubscriptionByTransactionFn = defaultCancelSubscriptionByTransaction,
): Promise<Refund> {
  // -------------------------------------------------------------------------
  // Busca o refund — com lock via SELECT FOR UPDATE para evitar dupla aprovação
  // -------------------------------------------------------------------------
  const lockedRows = await tx.execute(
    sql`SELECT r.*, t.contact_id, t.brand_id, t.snapshot_id AS transaction_snapshot_id
        FROM refund r
        JOIN transaction t ON t.id = r.transaction_id
        WHERE r.id = ${refundId}
        FOR UPDATE OF r
        LIMIT 1`,
  )

  const rawRefund = (lockedRows as unknown as Array<Record<string, unknown>>)[0]

  if (!rawRefund) {
    throw new RefundNotFoundError(refundId)
  }

  const currentStatus = rawRefund['status'] as string
  const transactionId = rawRefund['transaction_id'] as string
  const contactId = rawRefund['contact_id'] as string
  const brandId = rawRefund['brand_id'] as string
  const snapshotId = rawRefund['transaction_snapshot_id'] as string | null
  const refundReason = rawRefund['reason'] as string

  // -------------------------------------------------------------------------
  // Passo 0: validar status — só 'requested' pode ser aprovado
  // docs/20-domain/14-refund.md §6
  // -------------------------------------------------------------------------
  if (currentStatus !== 'requested') {
    throw new InvalidRefundStatusError(refundId, currentStatus, 'requested')
  }

  // -------------------------------------------------------------------------
  // Passo 1: UPDATE refund.status = 'approved' + refund_status_history
  // docs/20-domain/14-refund.md §7 passo 1
  // -------------------------------------------------------------------------
  const approvedRows = await tx
    .update(refund)
    .set({
      status: 'approved',
      approvedByUserId: approverUserId,
      approvedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(refund.id, refundId))
    .returning()

  const approvedRefund = approvedRows[0]
  if (!approvedRefund) {
    throw new Error('approveRefund: UPDATE refund returned no rows')
  }

  await tx.insert(refundStatusHistory).values({
    refundId,
    fromStatus: 'requested',
    toStatus: 'approved',
    changedBy: approverUserId,
    reason: 'approved_by_user',
  })

  // -------------------------------------------------------------------------
  // Passo 2: Flag snapshot — INSERT em transaction_snapshot_flag_history
  // INV-REFUND-06: não altera transaction_snapshot.payload (BR-SNAPSHOT-IMMUTABILITY)
  // docs/20-domain/14-refund.md §7 passo 2
  // -------------------------------------------------------------------------
  if (snapshotId) {
    await flagSnapshotFn(tx, snapshotId, refundId)
  }

  // refund_effect_log kind='snapshot_flagged'
  await tx.insert(refundEffectLog).values({
    refundId,
    effectKind: 'snapshot_flagged',
    refId: snapshotId ?? undefined,
    detail: { snapshot_id: snapshotId, refund_id: refundId },
  })

  // -------------------------------------------------------------------------
  // Passo 3: revokeByTransaction — revoga entitlements ativos da transação
  // docs/20-domain/14-refund.md §7 passo 3
  // MOD-ENTITLEMENT interface pública: revokeByTransaction
  // -------------------------------------------------------------------------
  let revokedEntitlements: CustomerEntitlement[] = []
  try {
    revokedEntitlements = await revokeFn(tx, transactionId, 'refund_revoke')
  } catch (err) {
    // Se não há entitlements ativos, não é erro bloqueante — apenas registra
    // O revokeByTransaction lança EntitlementNotFoundError se não há nada para revogar
    // Neste contexto, pode ocorrer se a transação não tinha entitlements (válido).
    // Re-lança qualquer outro erro (erro de DB, etc.)
    const errName = (err as Error).name
    if (errName !== 'EntitlementNotFoundError') {
      throw err
    }
  }

  // refund_effect_log kind='entitlement_revoked' por direito revogado
  for (const ent of revokedEntitlements) {
    await tx.insert(refundEffectLog).values({
      refundId,
      effectKind: 'entitlement_revoked',
      refId: ent.id,
      detail: { entitlement_id: ent.id, transaction_id: transactionId },
    })
  }

  // -------------------------------------------------------------------------
  // Passo 4: UPDATE transaction.status = 'refunded' + transaction_status_history
  // docs/20-domain/14-refund.md §7 passo 4
  // -------------------------------------------------------------------------
  await tx
    .update(transaction)
    .set({
      status: 'refunded',
      updatedAt: sql`now()`,
    })
    .where(eq(transaction.id, transactionId))

  await tx.insert(transactionStatusHistory).values({
    transactionId,
    fromStatus: 'approved',
    toStatus: 'refunded',
    changedBy: approverUserId,
    reason: `refund_id:${refundId}`,
  })

  // -------------------------------------------------------------------------
  // Passo 5: refund_effect_log já registrado inline nos passos 2-4 acima
  // docs/20-domain/14-refund.md §7 passo 5
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Passo 6: reclassifyContact (stub injetável)
  // docs/20-domain/14-refund.md §7 passo 5 (reclassificar contato)
  // BR-CONTACT-CLASSIFICATION: pode reverter customer/student → lead
  // -------------------------------------------------------------------------
  await reclassifyFn(tx, contactId)

  await tx.insert(refundEffectLog).values({
    refundId,
    effectKind: 'contact_reclassified',
    refId: undefined,
    detail: { contact_id: contactId },
  })

  // -------------------------------------------------------------------------
  // Passo 7: revertOpportunity (stub injetável)
  // docs/20-domain/14-refund.md §7 passo 6 (reverter oportunidade no funil)
  // MOD-FUNNEL: setOpportunityLabel 'won' → 'reopened' (ou 'lost')
  // -------------------------------------------------------------------------
  await revertOpportunityFn(tx, transactionId)

  await tx.insert(refundEffectLog).values({
    refundId,
    effectKind: 'opportunity_reverted',
    refId: undefined,
    detail: { transaction_id: transactionId },
  })

  // -------------------------------------------------------------------------
  // Passo 7.5 (spec passo 7): cancelar subscription vinculada ao refund
  // docs/20-domain/14-refund.md §7 passo 7
  // BR-REFUND §7 passo 7: subscription com origin_transaction_id = transactionId
  //   e status IN ('trial','active','past_due') → status='cancelled', cancel_reason='refund'
  //
  // INV-BILL-07 (BR-SUBSCRIPTION): entitlements NÃO são revogados aqui.
  //   Entitlements já foram revogados no passo 3 (revokeByTransaction).
  //   O cancelamento de subscription via refund é cancelamento imediato (OQ-BR-REFUND-02).
  //
  // T-9-08 irá extrair defaultCancelSubscriptionByTransaction para cancelSubscription canônica.
  // -------------------------------------------------------------------------
  const cancelledSub = await cancelSubscriptionByTrxFn(tx, transactionId, approverUserId)

  if (cancelledSub) {
    await tx.insert(refundEffectLog).values({
      refundId,
      effectKind: 'subscription_cancelled',
      refId: cancelledSub.subscriptionId,
      detail: {
        subscription_id: cancelledSub.subscriptionId,
        previous_status: cancelledSub.previousStatus,
        cancel_reason: 'refund',
      },
    })
  }

  // -------------------------------------------------------------------------
  // Passo 8: Emite TE-REFUND-APPROVED + TE-SALE-REFUNDED
  // docs/20-domain/14-refund.md §7 passo 8, §9
  // docs/30-contracts/03-timeline-event-catalog.md §Oferta/Transação/Direito
  // -------------------------------------------------------------------------

  // TE-REFUND-APPROVED
  await emit(
    {
      contactId,
      brandId,
      kind: 'refund_approved',
      source: 'MOD-REFUND',
      actorUserId: approverUserId,
      subjectKind: 'refund',
      subjectId: refundId,
      payload: {
        refund_id: refundId,
        transaction_id: transactionId,
      },
    },
    tx,
  )

  // TE-SALE-REFUNDED — docs/30-contracts/03-timeline-event-catalog.md §TE-SALE-REFUNDED
  // Payload: { transaction_id, refund_id, reason }
  await emit(
    {
      contactId,
      brandId,
      kind: 'sale_refunded',
      source: 'MOD-REFUND',
      actorUserId: approverUserId,
      subjectKind: 'transaction',
      subjectId: transactionId,
      payload: {
        transaction_id: transactionId,
        refund_id: refundId,
        reason: refundReason,
      },
    },
    tx,
  )

  // refund_effect_log kind='timeline_emitted'
  await tx.insert(refundEffectLog).values({
    refundId,
    effectKind: 'timeline_emitted',
    refId: undefined,
    detail: { kinds: ['refund_approved', 'sale_refunded'] },
  })

  return approvedRefund
}
