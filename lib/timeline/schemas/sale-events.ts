/**
 * MOD-TRANSACTION / MOD-REFUND — Timeline payload schemas for sale events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Oferta / Transação / Direito
 * T-8-21
 *
 * Kinds (snake_case of TE-ID):
 *   sale_pending     ← TE-SALE-PENDING
 *   sale_approved    ← TE-SALE-APPROVED  (replaces inline stub in index.ts)
 *   sale_refused     ← TE-SALE-REFUSED
 *   sale_refunded    ← TE-SALE-REFUNDED
 */
import { z } from 'zod'

// ── TE-SALE-PENDING ──────────────────────────────────────────────────────────
// Payload: { transaction_id, offer_id, condition_id }
export const salePendingPayloadSchema = z.object({
  transaction_id: z.string().uuid(),
  offer_id: z.string().uuid(),
  condition_id: z.string().uuid(),
})

export type SalePendingPayload = z.infer<typeof salePendingPayloadSchema>

// ── TE-SALE-APPROVED ─────────────────────────────────────────────────────────
// Payload: { transaction_id, offer_id, condition_id, snapshot_id }
export const saleApprovedPayloadSchema = z.object({
  transaction_id: z.string().uuid(),
  offer_id: z.string().uuid(),
  condition_id: z.string().uuid(),
  snapshot_id: z.string().uuid(),
})

export type SaleApprovedPayload = z.infer<typeof saleApprovedPayloadSchema>

// ── TE-SALE-REFUSED ──────────────────────────────────────────────────────────
// Payload: { transaction_id, reason }
export const saleRefusedPayloadSchema = z.object({
  transaction_id: z.string().uuid(),
  reason: z.string().min(1),
})

export type SaleRefusedPayload = z.infer<typeof saleRefusedPayloadSchema>

// ── TE-SALE-REFUNDED ─────────────────────────────────────────────────────────
// Payload: { transaction_id, refund_id, reason }
// Emitted by MOD-REFUND (not MOD-TRANSACTION)
export const saleRefundedPayloadSchema = z.object({
  transaction_id: z.string().uuid(),
  refund_id: z.string().uuid(),
  reason: z.string().min(1),
})

export type SaleRefundedPayload = z.infer<typeof saleRefundedPayloadSchema>
