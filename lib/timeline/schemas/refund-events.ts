/**
 * MOD-REFUND — Timeline payload schemas for refund events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Oferta / Transação / Direito
 * docs/20-domain/14-refund.md
 * T-8-21
 *
 * Kinds (snake_case of TE-ID):
 *   refund_opened    ← TE-REFUND-OPENED
 *   refund_approved  ← TE-REFUND-APPROVED
 *   refund_rejected  ← TE-REFUND-REJECTED
 *
 * Note: TE-SALE-REFUNDED (emitted when a sale reaches refunded status) lives
 * in sale-events.ts; these events track the refund request lifecycle itself.
 */
import { z } from 'zod'

// ── TE-REFUND-OPENED ─────────────────────────────────────────────────────────
// Emitted when a refund request is created (status: requested).
export const refundOpenedPayloadSchema = z.object({
  refund_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  reason: z.string().min(1),
})

export type RefundOpenedPayload = z.infer<typeof refundOpenedPayloadSchema>

// ── TE-REFUND-APPROVED ───────────────────────────────────────────────────────
// Emitted when a refund request is approved.
export const refundApprovedPayloadSchema = z.object({
  refund_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
})

export type RefundApprovedPayload = z.infer<typeof refundApprovedPayloadSchema>

// ── TE-REFUND-REJECTED ───────────────────────────────────────────────────────
// Emitted when a refund request is rejected.
export const refundRejectedPayloadSchema = z.object({
  refund_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
  reason: z.string().min(1),
})

export type RefundRejectedPayload = z.infer<typeof refundRejectedPayloadSchema>
