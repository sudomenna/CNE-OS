/**
 * MOD-BILLING — advanceSubscription
 *
 * T-9-07
 * docs/20-domain/13-subscription-billing.md §6.1 (matriz de transições), §5 (INV-BILL-07)
 * docs/50-business-rules/BR-SUBSCRIPTION.md (tabela de decisão)
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado no DB).
 *
 * Zero I/O direto: consome tx para DB e emitFn (injetável em testes) para timeline.
 */

import { and, eq, gte } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { installment, subscription, subscriptionStatusHistory } from '@/lib/db/schema/billing'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'expired'

// ---------------------------------------------------------------------------
// Erros tipados (ADR-10)
// ---------------------------------------------------------------------------

export class SubscriptionNotFoundError extends Error {
  readonly subscriptionId: string

  constructor(subscriptionId: string) {
    super(`subscription ${subscriptionId} not found`)
    this.name = 'SubscriptionNotFoundError'
    this.subscriptionId = subscriptionId
  }
}

// ---------------------------------------------------------------------------
// Tipo de dependência injetável para emissão de timeline (facilita testes)
// ---------------------------------------------------------------------------

export type EmitFn = (input: TimelineEventInput, tx?: DbTx) => Promise<unknown>

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Verifica se existe installment pago para a subscription a partir de uma data.
 * BR-SUBSCRIPTION: installment.paid_at >= referenceDate identifica pagamento no período.
 */
async function hasPaidInstallmentSince(
  tx: DbTx,
  subscriptionId: string,
  referenceDate: Date,
): Promise<boolean> {
  const rows = await tx
    .select({ id: installment.id })
    .from(installment)
    .where(
      and(
        eq(installment.subscriptionId, subscriptionId),
        eq(installment.status, 'paid'),
        gte(installment.paidAt, referenceDate),
      ),
    )
    .limit(1)

  return rows.length > 0
}

/**
 * Avança um período de cobrança em 30 dias (Fase 1 — duração fixa por período).
 * OQ-BILL-02: renovação atualiza current_period_* na mesma subscription.
 */
function advancePeriodEnd(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() + 30 * 24 * 60 * 60 * 1000)
}

// ---------------------------------------------------------------------------
// advanceSubscription
// ---------------------------------------------------------------------------

/**
 * Aplica a matriz completa de transições de estado da subscription.
 * Chamado por cron Inngest para varrer assinaturas e avançar seu ciclo.
 *
 * Matriz de transições (docs/20-domain/13-subscription-billing.md §6.1):
 *   trial       + trial_ends_at <= now + pago          → active
 *   trial       + trial_ends_at <= now + não pago      → past_due (TE-SUBSCRIPTION-PAST-DUE)
 *   active      + current_period_end <= now + pago     → renova período (TE-SUBSCRIPTION-RENEWED)
 *   active      + current_period_end <= now + não pago + next_billing_at → past_due (TE-SUBSCRIPTION-PAST-DUE)
 *   active      + current_period_end <= now + sem next_billing_at        → expired
 *   past_due    + pago desde entrou em past_due        → active
 *   cancelled | expired                                → noop
 *
 * @param tx             Transação DB ativa (ADR-11)
 * @param subscriptionId UUID da assinatura
 * @param now            Timestamp de referência (injetável para testes)
 * @param emit           Injeção da função de emissão de timeline
 */
export async function advanceSubscription(
  tx: DbTx,
  subscriptionId: string,
  now: Date = new Date(),
  emit: EmitFn = emitTimelineEvent,
): Promise<SubscriptionStatus> {
  // 1. Buscar subscription pelo id
  const rows = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.id, subscriptionId))
    .limit(1)

  const sub = rows[0]
  if (!sub) {
    // ADR-10: lança DomainError quando entidade não encontrada
    throw new SubscriptionNotFoundError(subscriptionId)
  }

  const currentStatus = sub.status

  // 2. Terminais: cancelled e expired não têm transições (INV-BILL-08)
  // BR-SUBSCRIPTION §tabela-de-decisão: terminal states
  if (currentStatus === 'cancelled' || currentStatus === 'expired') {
    return currentStatus
  }

  // ---------------------------------------------------------------------------
  // Branch: trial
  // ---------------------------------------------------------------------------
  if (currentStatus === 'trial') {
    const trialEndsAt = sub.trialEndsAt

    // Sem trial_ends_at não há como avaliar expiração (INV-BILL-03 garante NOT NULL em trial)
    if (!trialEndsAt || trialEndsAt > now) {
      // Trial ainda ativo — noop
      return currentStatus
    }

    // trial_ends_at <= now: verificar se há pagamento no período
    // BR-SUBSCRIPTION: parcela paga a partir do início do período corrente
    const paid = await hasPaidInstallmentSince(tx, subscriptionId, sub.currentPeriodStart)

    if (paid) {
      // trial → active
      // BR-SUBSCRIPTION: trial expirado + parcela paga → active
      await applyTransition(tx, sub.id, sub.contactId, 'trial', 'active', now, emit, null)
      return 'active'
    } else {
      // trial → past_due
      // BR-SUBSCRIPTION: trial expirado + parcela não paga → past_due (entra em dunning)
      await applyTransition(tx, sub.id, sub.contactId, 'trial', 'past_due', now, emit, null)
      return 'past_due'
    }
  }

  // ---------------------------------------------------------------------------
  // Branch: active
  // ---------------------------------------------------------------------------
  if (currentStatus === 'active') {
    if (sub.currentPeriodEnd > now) {
      // Período ainda vigente — noop
      return currentStatus
    }

    // current_period_end <= now: verificar pagamento desde o início do período atual
    const paid = await hasPaidInstallmentSince(tx, subscriptionId, sub.currentPeriodStart)

    if (paid) {
      // BR-SUBSCRIPTION §OQ-BILL-02: renovação automática — atualiza current_period_*
      // active → renewed: avança período, emite TE-SUBSCRIPTION-RENEWED
      const newPeriodStart = sub.currentPeriodEnd
      const newPeriodEnd = advancePeriodEnd(sub.currentPeriodEnd)

      await tx
        .update(subscription)
        .set({
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          updatedAt: now,
        })
        .where(eq(subscription.id, sub.id))

      // INV-BILL-06: registrar no histórico (status permanece active, mas período avançou)
      await tx.insert(subscriptionStatusHistory).values({
        subscriptionId: sub.id,
        oldStatus: 'active',
        newStatus: 'active',
        note: 'period_renewed',
      })

      // TE-SUBSCRIPTION-RENEWED (§9)
      await emit(
        {
          contactId: sub.contactId,
          brandId: sub.brandId,
          kind: 'subscription_renewed',
          source: 'MOD-BILLING',
          actorSystem: 'advanceSubscription',
          subjectKind: 'subscription',
          subjectId: sub.id,
          payload: {
            subscriptionId: sub.id,
            contactId: sub.contactId,
            newPeriodStart: newPeriodStart.toISOString(),
            newPeriodEnd: newPeriodEnd.toISOString(),
          },
        },
        tx,
      )

      return 'active'
    }

    // Sem pagamento: verificar se há renovação automática
    if (!sub.nextBillingAt) {
      // BR-SUBSCRIPTION: active + fim de período sem renovação → expired
      // docs/20-domain/13-subscription-billing.md §6.1: "só quando assinatura sem renovação automática"
      await applyTransition(tx, sub.id, sub.contactId, 'active', 'expired', now, emit, null)
      return 'expired'
    }

    // Tem next_billing_at mas não pagou: active → past_due
    // BR-SUBSCRIPTION: parcela não paga após vencimento → past_due
    await applyTransition(tx, sub.id, sub.contactId, 'active', 'past_due', now, emit, null)
    return 'past_due'
  }

  // ---------------------------------------------------------------------------
  // Branch: past_due
  // ---------------------------------------------------------------------------
  if (currentStatus === 'past_due') {
    // Verificar se há pagamento desde a entrada em past_due
    // Para determinar quando entrou em past_due, usamos updated_at como proxy
    // (o registro é atualizado quando o status muda)
    // BR-SUBSCRIPTION: parcela paga após entrada em past_due → active + avança período
    const paid = await hasPaidInstallmentSince(tx, subscriptionId, sub.updatedAt)

    if (paid) {
      // past_due → active
      // BR-SUBSCRIPTION: retry sucedeu → active; avança current_period_*
      const newPeriodStart = sub.currentPeriodEnd
      const newPeriodEnd = advancePeriodEnd(sub.currentPeriodEnd)

      await tx
        .update(subscription)
        .set({
          status: 'active',
          currentPeriodStart: newPeriodStart,
          currentPeriodEnd: newPeriodEnd,
          updatedAt: now,
        })
        .where(eq(subscription.id, sub.id))

      // INV-BILL-06: registrar transição no histórico
      await tx.insert(subscriptionStatusHistory).values({
        subscriptionId: sub.id,
        oldStatus: 'past_due',
        newStatus: 'active',
        note: 'payment_recovered',
      })

      // past_due → active não emite TE específico nesta função
      // (coberto pelos eventos de installment paid)
      return 'active'
    }

    // Sem pagamento — permanece past_due (dunning é gerenciado por job separado)
    return 'past_due'
  }

  // paused e outros estados não cobertos — noop
  return currentStatus
}

// ---------------------------------------------------------------------------
// applyTransition — helper interno para transições simples
// ---------------------------------------------------------------------------

/**
 * Aplica uma transição de status simples:
 *   - UPDATE subscription.status + updated_at
 *   - INSERT subscription_status_history (INV-BILL-06)
 *   - Emite TE quando aplicável
 */
async function applyTransition(
  tx: DbTx,
  subscriptionId: string,
  contactId: string,
  oldStatus: SubscriptionStatus,
  newStatus: SubscriptionStatus,
  now: Date,
  emit: EmitFn,
  note: string | null,
): Promise<void> {
  await tx
    .update(subscription)
    .set({ status: newStatus, updatedAt: now })
    .where(eq(subscription.id, subscriptionId))

  // INV-BILL-06: toda mudança de status grava linha em subscription_status_history
  await tx.insert(subscriptionStatusHistory).values({
    subscriptionId,
    oldStatus,
    newStatus,
    note: note ?? `${oldStatus}_to_${newStatus}`,
  })

  // Emitir TE-SUBSCRIPTION-PAST-DUE quando entra em past_due
  // BR-SUBSCRIPTION: TE-SUBSCRIPTION-PAST-DUE na primeira transição para past_due
  if (newStatus === 'past_due') {
    await emit(
      {
        contactId,
        kind: 'subscription_past_due',
        source: 'MOD-BILLING',
        actorSystem: 'advanceSubscription',
        subjectKind: 'subscription',
        subjectId: subscriptionId,
        payload: {
          subscriptionId,
          contactId,
        },
      },
      tx,
    )
  }
}
