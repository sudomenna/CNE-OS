'use server'

/**
 * MOD-BILLING — Server Actions de leitura (subscriptions)
 * T-9-14: UI /billing/subscriptions lista + detalhe
 *
 * Spec: docs/20-domain/13-subscription-billing.md §3.1, §3.2
 * Contract: docs/30-contracts/05-api-server-actions.md
 * RBAC: leituras usam requireSession() apenas (padrão read-only do projeto).
 */

import { z } from 'zod'
import { and, desc, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { subscription, installment } from '@/lib/db/schema/billing'
import { contact } from '@/lib/db/schema/contact'
import { offer } from '@/lib/db/schema/offer'
import { requireSession } from '@/lib/auth/session'
import { toActionResult, ActionError } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'cancelled'
  | 'expired'

export type SubscriptionListItem = {
  id: string
  status: SubscriptionStatus
  contactId: string
  contactName: string
  offerId: string
  offerName: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  nextBillingAt: Date | null
  cancelledAt: Date | null
  createdAt: Date
}

export type InstallmentItem = {
  id: string
  sequence: number
  dueAt: Date
  amount: string
  status: 'scheduled' | 'paid' | 'overdue' | 'refunded' | 'cancelled'
  paidAt: Date | null
  retryCount: number
  lastRetryAt: Date | null
  boletoUrl: string | null
  externalId: string | null
}

export type SubscriptionDetail = SubscriptionListItem & {
  trialEndsAt: Date | null
  cancelReason: string | null
  externalProvider: string | null
  externalId: string | null
  installments: InstallmentItem[]
}

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const listSubscriptionsSchema = z.object({
  status: z
    .enum(['trial', 'active', 'past_due', 'paused', 'cancelled', 'expired'])
    .optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
})

const getSubscriptionSchema = z.object({
  id: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// listSubscriptionsAction
// ---------------------------------------------------------------------------

/**
 * Lista assinaturas com filtro opcional de status + paginação.
 * Retorna join de contato e oferta para exibição na tabela.
 */
export async function listSubscriptionsAction(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()

    const input = listSubscriptionsSchema.parse(rawInput)
    const offset = (input.page - 1) * input.pageSize

    // Condições de filtro
    const conditions = []
    if (input.status) {
      conditions.push(eq(subscription.status, input.status))
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined

    // Busca com join contact + offer (paginada) + count total em paralelo
    const [rows, countResult] = await Promise.all([
      db
      .select({
        id: subscription.id,
        status: subscription.status,
        contactId: subscription.contactId,
        contactName: contact.fullName,
        offerId: subscription.offerId,
        offerName: offer.name,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        nextBillingAt: subscription.nextBillingAt,
        cancelledAt: subscription.cancelledAt,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .innerJoin(contact, eq(subscription.contactId, contact.id))
      .innerJoin(offer, eq(subscription.offerId, offer.id))
        .where(where)
        .orderBy(desc(subscription.createdAt))
        .limit(input.pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(subscription)
        .where(where),
    ])

    const total = countResult[0]?.count ?? 0
    const totalPages = Math.max(1, Math.ceil(total / input.pageSize))

    return {
      items: rows as SubscriptionListItem[],
      total,
      totalPages,
      page: input.page,
    }
  })
}

// ---------------------------------------------------------------------------
// getSubscriptionAction
// ---------------------------------------------------------------------------

/**
 * Busca detalhe de uma subscription com suas installments.
 */
export async function getSubscriptionAction(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()

    const { id } = getSubscriptionSchema.parse(rawInput)

    // Subscription com join contato + oferta
    const rows = await db
      .select({
        id: subscription.id,
        status: subscription.status,
        contactId: subscription.contactId,
        contactName: contact.fullName,
        offerId: subscription.offerId,
        offerName: offer.name,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        nextBillingAt: subscription.nextBillingAt,
        cancelledAt: subscription.cancelledAt,
        cancelReason: subscription.cancelReason,
        trialEndsAt: subscription.trialEndsAt,
        externalProvider: subscription.externalProvider,
        externalId: subscription.externalId,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .innerJoin(contact, eq(subscription.contactId, contact.id))
      .innerJoin(offer, eq(subscription.offerId, offer.id))
      .where(eq(subscription.id, id))
      .limit(1)

    const sub = rows[0]
    if (!sub) {
      throw new ActionError('NOT_FOUND', `Assinatura ${id} não encontrada`)
    }

    // Installments da assinatura
    const installmentRows = await db
      .select({
        id: installment.id,
        sequence: installment.sequence,
        dueAt: installment.due_at,
        amount: installment.amount,
        status: installment.status,
        paidAt: installment.paidAt,
        retryCount: installment.retryCount,
        lastRetryAt: installment.lastRetryAt,
        boletoUrl: installment.boletoUrl,
        externalId: installment.externalId,
      })
      .from(installment)
      .where(eq(installment.subscriptionId, id))
      .orderBy(installment.sequence)

    return {
      ...sub,
      installments: installmentRows as InstallmentItem[],
    } as SubscriptionDetail
  })
}
