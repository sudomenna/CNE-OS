/**
 * MOD-ENTITLEMENT — Timeline payload schemas for entitlement events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Oferta / Transação / Direito
 * T-8-21
 *
 * Kinds (snake_case of TE-ID):
 *   entitlement_granted   ← TE-ENTITLEMENT-GRANTED
 *   entitlement_extended  ← TE-ENTITLEMENT-EXTENDED
 *   entitlement_revoked   ← TE-ENTITLEMENT-REVOKED
 */
import { z } from 'zod'

// ── TE-ENTITLEMENT-GRANTED ───────────────────────────────────────────────────
// Payload: { entitlement_id, kind, ref_id, ends_at? }
// kind follows entitlement_kind enum (01-enums.md): product_access | benefit | other
export const entitlementGrantedPayloadSchema = z.object({
  entitlement_id: z.string().uuid(),
  kind: z.enum(['product_access', 'benefit', 'other']),
  ref_id: z.string().uuid(),
  ends_at: z.string().datetime().optional(),
})

export type EntitlementGrantedPayload = z.infer<typeof entitlementGrantedPayloadSchema>

// ── TE-ENTITLEMENT-EXTENDED ──────────────────────────────────────────────────
// Payload: { entitlement_id, from, to }
// from/to are ISO datetime strings (ends_at before and after extension)
export const entitlementExtendedPayloadSchema = z.object({
  entitlement_id: z.string().uuid(),
  from: z.string().datetime(),
  to: z.string().datetime(),
})

export type EntitlementExtendedPayload = z.infer<typeof entitlementExtendedPayloadSchema>

// ── TE-ENTITLEMENT-REVOKED ───────────────────────────────────────────────────
// Payload: { entitlement_id, reason }
export const entitlementRevokedPayloadSchema = z.object({
  entitlement_id: z.string().uuid(),
  reason: z.string().min(1),
})

export type EntitlementRevokedPayload = z.infer<typeof entitlementRevokedPayloadSchema>
