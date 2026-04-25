/**
 * MOD-AUTOMATION — Schemas de filtro por trigger kind (T-11-13)
 *
 * Schema Zod discriminado por `kind` para `automation_trigger.filter`.
 * Cada kind tem shape diferente conforme docs/20-domain/15-automation.md §7 triggers.
 * Kinds definidos em docs/30-contracts/01-enums.md §Automação: automation_trigger_kind.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Schemas de filtro por kind
// docs/20-domain/15-automation.md §7 — Triggers (Fase 1)
// ---------------------------------------------------------------------------

const funnelEnterFilterSchema = z.object({
  kind: z.literal('funnel_enter'),
  funnel_id: z.string().uuid().optional(),
})

const funnelStageChangeFilterSchema = z.object({
  kind: z.literal('funnel_stage_change'),
  funnel_id: z.string().uuid().optional(),
  from_stage: z.string().optional(),
  to_stage: z.string().optional(),
})

const newMessageFilterSchema = z.object({
  kind: z.literal('new_message'),
  // channel: subset de channel_kind — docs/30-contracts/01-enums.md §Inbox/Ticket
  channel: z.enum(['whatsapp', 'email', 'instagram']).optional(),
})

const checkoutAbandonedFilterSchema = z.object({
  kind: z.literal('checkout_abandoned'),
  offer_id: z.string().uuid().optional(),
})

const saleApprovedFilterSchema = z.object({
  kind: z.literal('sale_approved'),
  offer_id: z.string().uuid().optional(),
})

const ticketOpenedFilterSchema = z.object({
  kind: z.literal('ticket_opened'),
  category: z.string().optional(),
})

const brevoEventFilterSchema = z.object({
  kind: z.literal('brevo_event'),
  event_name: z.string().optional(),
})

const integrationEventFilterSchema = z.object({
  kind: z.literal('integration_event'),
  event_type: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Union discriminada por kind
// ---------------------------------------------------------------------------

export const triggerFilterSchema = z.discriminatedUnion('kind', [
  funnelEnterFilterSchema,
  funnelStageChangeFilterSchema,
  newMessageFilterSchema,
  checkoutAbandonedFilterSchema,
  saleApprovedFilterSchema,
  ticketOpenedFilterSchema,
  brevoEventFilterSchema,
  integrationEventFilterSchema,
])

export type TriggerFilterInput = z.infer<typeof triggerFilterSchema>
