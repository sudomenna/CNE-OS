/**
 * MOD-BILLING — Timeline payload schemas for subscription events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Assinatura / Cobrança
 * docs/20-domain/13-subscription-billing.md §9
 * T-9-17
 *
 * Kinds (snake_case of TE-ID):
 *   subscription_started    ← TE-SUBSCRIPTION-STARTED
 *   subscription_renewed    ← TE-SUBSCRIPTION-RENEWED
 *   subscription_past_due   ← TE-SUBSCRIPTION-PAST-DUE
 *   subscription_cancelled  ← TE-SUBSCRIPTION-CANCELLED
 */
import { z } from 'zod'

// ── TE-SUBSCRIPTION-STARTED ──────────────────────────────────────────────────
// Emitted when a subscription is activated (enters trial or active state).
export const TeSubscriptionStartedSchema = z.object({
  subscriptionId: z.string().uuid(),
  contactId: z.string().uuid(),
  offerId: z.string().uuid(),
  status: z.enum(['trial', 'active']),
  trialEndsAt: z.string().datetime().optional(),
})

export type TeSubscriptionStarted = z.infer<typeof TeSubscriptionStartedSchema>

// ── TE-SUBSCRIPTION-RENEWED ──────────────────────────────────────────────────
// Emitted when a recurring installment is paid and the period advances.
export const TeSubscriptionRenewedSchema = z.object({
  subscriptionId: z.string().uuid(),
  contactId: z.string().uuid(),
  newPeriodStart: z.string().datetime(),
  newPeriodEnd: z.string().datetime(),
})

export type TeSubscriptionRenewed = z.infer<typeof TeSubscriptionRenewedSchema>

// ── TE-SUBSCRIPTION-PAST-DUE ─────────────────────────────────────────────────
// Emitted when an installment becomes overdue and the subscription transitions
// to past_due status.
export const TeSubscriptionPastDueSchema = z.object({
  subscriptionId: z.string().uuid(),
  contactId: z.string().uuid(),
  installmentId: z.string().uuid().optional(),
})

export type TeSubscriptionPastDue = z.infer<typeof TeSubscriptionPastDueSchema>

// ── TE-SUBSCRIPTION-CANCELLED ────────────────────────────────────────────────
// Emitted when a subscription is cancelled (by user, admin, or dunning failure).
export const TeSubscriptionCancelledSchema = z.object({
  subscriptionId: z.string().uuid(),
  contactId: z.string().uuid(),
  reason: z.string().min(1),
  currentPeriodEnd: z.string().datetime(),
})

export type TeSubscriptionCancelled = z.infer<typeof TeSubscriptionCancelledSchema>
