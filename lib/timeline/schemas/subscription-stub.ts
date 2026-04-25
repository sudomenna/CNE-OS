/**
 * MOD-BILLING — Timeline payload schemas for subscription events (stubs)
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Assinatura / Cobrança
 * T-8-21
 *
 * These are stubs: MOD-BILLING is not yet implemented (Sprint 9+).
 * A single stub schema covers all subscription / installment TE-IDs.
 *
 * Kind: te_subscription_stub
 */
import { z } from 'zod'

// ── Subscription stub ────────────────────────────────────────────────────────
// Covers: TE-SUBSCRIPTION-STARTED, TE-SUBSCRIPTION-RENEWED,
//         TE-SUBSCRIPTION-PAST-DUE, TE-SUBSCRIPTION-CANCELLED,
//         TE-INSTALLMENT-PAID, TE-INSTALLMENT-OVERDUE
//
// event_type carries the specific TE-ID string for routing in the future.
export const subscriptionStubPayloadSchema = z.object({
  subscription_id: z.string().min(1),
  event_type: z.string().min(1),
})

export type SubscriptionStubPayload = z.infer<typeof subscriptionStubPayloadSchema>
