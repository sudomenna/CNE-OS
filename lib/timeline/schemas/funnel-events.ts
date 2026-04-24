/**
 * MOD-FUNNEL — Timeline payload schemas for funnel / opportunity events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Marketing / Funil
 * T-5-15
 *
 * Kinds (snake_case of TE-ID):
 *   funnel_entered          ← TE-FUNNEL-ENTERED
 *   funnel_stage_changed    ← TE-FUNNEL-STAGE-CHANGED
 *   opportunity_label_changed ← TE-OPPORTUNITY-LABEL-CHANGED
 *   opportunity_won         ← TE-OPPORTUNITY-WON
 *   opportunity_lost        ← TE-OPPORTUNITY-LOST
 */
import { z } from 'zod'

// ── TE-FUNNEL-ENTERED ────────────────────────────────────────────────────────
// Payload: { funnel_id, entry_id, stage_id, entry_creative_id?, entry_campaign_id? }
export const funnelEnteredSchema = z.object({
  funnel_id: z.string().uuid(),
  entry_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  entry_creative_id: z.string().uuid().optional(),
  entry_campaign_id: z.string().uuid().optional(),
})

export type FunnelEntered = z.infer<typeof funnelEnteredSchema>

// ── TE-FUNNEL-STAGE-CHANGED ──────────────────────────────────────────────────
// Payload: { entry_id, from_stage_id, to_stage_id, score? }
export const funnelStageChangedSchema = z.object({
  entry_id: z.string().uuid(),
  from_stage_id: z.string().uuid(),
  to_stage_id: z.string().uuid(),
  score: z.number().optional(),
})

export type FunnelStageChanged = z.infer<typeof funnelStageChangedSchema>

// ── TE-OPPORTUNITY-LABEL-CHANGED ─────────────────────────────────────────────
// Payload: { entry_id, from: label, to: label }
// label values follow funnel_opportunity_label enum (01-enums.md)
const opportunityLabelEnum = z.enum([
  'open',
  'negotiating',
  'concluded',
  'won',
  'lost',
  'reopened',
])

export const opportunityLabelChangedSchema = z.object({
  entry_id: z.string().uuid(),
  from: opportunityLabelEnum,
  to: opportunityLabelEnum,
})

export type OpportunityLabelChanged = z.infer<typeof opportunityLabelChangedSchema>

// ── TE-OPPORTUNITY-WON ───────────────────────────────────────────────────────
// Payload: { entry_id, transaction_id }
export const opportunityWonSchema = z.object({
  entry_id: z.string().uuid(),
  transaction_id: z.string().uuid(),
})

export type OpportunityWon = z.infer<typeof opportunityWonSchema>

// ── TE-OPPORTUNITY-LOST ──────────────────────────────────────────────────────
// Payload: { entry_id, reason }
export const opportunityLostSchema = z.object({
  entry_id: z.string().uuid(),
  reason: z.string().min(1),
})

export type OpportunityLost = z.infer<typeof opportunityLostSchema>
