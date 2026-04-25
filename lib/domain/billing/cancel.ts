/**
 * MOD-BILLING — cancelSubscription
 *
 * T-9-08
 * docs/20-domain/13-subscription-billing.md §6.1, §5 (INV-BILL-07)
 * docs/50-business-rules/BR-SUBSCRIPTION.md §Preservação de direitos ao cancelar
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado no DB).
 *
 * Zero I/O direto: consome tx para DB e emitFn (injetável em testes) para timeline.
 */

import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { subscription, subscriptionStatusHistory } from '@/lib/db/schema/billing'
import type { Subscription } from '@/lib/db/schema/billing'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Erros tipados (ADR-10)
// ---------------------------------------------------------------------------

export class SubscriptionCancelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SubscriptionCancelError'
  }
}

export class SubscriptionNotFoundForCancelError extends SubscriptionCancelError {
  readonly subscriptionId: string

  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} not found`)
    this.name = 'SubscriptionNotFoundForCancelError'
    this.subscriptionId = subscriptionId
  }
}

// ---------------------------------------------------------------------------
// Tipo de dependência injetável para emissão de timeline (facilita testes)
// ---------------------------------------------------------------------------

export type EmitFn = (input: TimelineEventInput, tx?: DbTx) => Promise<unknown>

// ---------------------------------------------------------------------------
// cancelSubscription
// ---------------------------------------------------------------------------

/**
 * Cancela uma subscription ativa (trial, active ou past_due).
 *
 * Lógica (docs/20-domain/13-subscription-billing.md §6.1, BR-SUBSCRIPTION §cancelamento):
 *   1. Busca subscription por id. Se não encontrada, lança SubscriptionNotFoundForCancelError.
 *      (ADR-10)
 *   2. Se já está em `cancelled` ou `expired`, retorna idempotentemente (noop).
 *      (BR-SUBSCRIPTION: terminais não têm transições — INV-BILL-08)
 *   3. UPDATE status='cancelled', cancelled_at=now(), cancel_reason=reason, updated_at=now().
 *      (INV-BILL-04: cancelled exige cancelled_at IS NOT NULL)
 *   4. INSERT em subscription_status_history (INV-BILL-06: toda mudança de status grava linha).
 *   5. Emite TE-SUBSCRIPTION-CANCELLED com { subscriptionId, contactId, reason, currentPeriodEnd }.
 *   6. NÃO revoga entitlements — INV-BILL-07: entitlements ficam ativos até current_period_end.
 *      (Revogação ocorre apenas via refund — BR-REFUND)
 *   7. Retorna a subscription atualizada.
 *
 * @param tx             Transação DB ativa (ADR-11)
 * @param subscriptionId UUID da assinatura a cancelar
 * @param reason         Motivo do cancelamento (ex: 'admin_cancel', 'dunning_exhausted', 'refund')
 * @param emit           Injeção da função de emissão de timeline (default: emitTimelineEvent)
 */
export async function cancelSubscription(
  tx: DbTx,
  subscriptionId: string,
  reason: string,
  emit: EmitFn = emitTimelineEvent,
): Promise<Subscription> {
  // 1. Buscar subscription pelo id
  const rows = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.id, subscriptionId))
    .limit(1)

  const sub = rows[0]
  if (!sub) {
    // ADR-10: lança DomainError quando entidade não encontrada
    throw new SubscriptionNotFoundForCancelError(subscriptionId)
  }

  // 2. Idempotência: terminais não têm transições (INV-BILL-08, BR-SUBSCRIPTION)
  // cancelled e expired são terminais — retorna sem UPDATE
  if (sub.status === 'cancelled' || sub.status === 'expired') {
    return sub
  }

  const previousStatus = sub.status
  const now = new Date()

  // 3. UPDATE status='cancelled', cancelled_at, cancel_reason, updated_at
  // INV-BILL-04: status='cancelled' exige cancelled_at IS NOT NULL (ck_subscription_cancelled)
  const updated = await tx
    .update(subscription)
    .set({
      status: 'cancelled',
      cancelledAt: now,
      cancelReason: reason,
      updatedAt: now,
    })
    .where(eq(subscription.id, subscriptionId))
    .returning()

  const updatedSub = updated[0]!

  // 4. INSERT em subscription_status_history (INV-BILL-06: toda mudança de status grava linha)
  await tx.insert(subscriptionStatusHistory).values({
    subscriptionId,
    oldStatus: previousStatus as 'trial' | 'active' | 'past_due' | 'paused',
    newStatus: 'cancelled',
    note: reason,
  })

  // 5. Emite TE-SUBSCRIPTION-CANCELLED
  // docs/20-domain/13-subscription-billing.md §9
  await emit(
    {
      contactId: updatedSub.contactId,
      brandId: updatedSub.brandId,
      kind: 'subscription_cancelled',
      source: 'MOD-BILLING',
      actorSystem: 'cancelSubscription',
      subjectKind: 'subscription',
      subjectId: subscriptionId,
      payload: {
        subscriptionId,
        contactId: updatedSub.contactId,
        reason,
        currentPeriodEnd: updatedSub.currentPeriodEnd.toISOString(),
      },
    },
    tx,
  )

  // 6. NÃO revoga entitlements — INV-BILL-07: entitlements permanecem ativos até current_period_end.
  // BR-SUBSCRIPTION §Preservação de direitos ao cancelar:
  //   customer_entitlement derivados permanecem 'active' até current_period_end.
  //   Cron noturno de expiração revoga após current_period_end.
  //   Revogação imediata ocorre apenas em refund (BR-REFUND).

  // 7. Retornar subscription atualizada
  return updatedSub
}
