/**
 * MOD-TIMELINE — Kind registry with Zod payload schemas
 *
 * docs/30-contracts/03-timeline-event-catalog.md
 * docs/50-business-rules/BR-TIMELINE.md
 *
 * All inbox and ticket schemas live in their own files (T-3-15).
 * Unknown kinds throw UnknownTimelineKindError in emitTimelineEvent.
 */
import { z } from 'zod'
import type { ModuleSource } from '@/lib/timeline/emit'

// ── Re-export domain schemas ────────────────────────────────────────────────
export {
  ticketOpenedSchema,
  ticketStatusChangedSchema,
  ticketResolvedSchema,
  ticketReopenedSchema,
  ticketAssignedSchema,
  ticketUnassignedSchema,
} from './ticket-events'

export {
  conversationOpenedSchema,
  conversationReopenedSchema,
  conversationClosedSchema,
  conversationAssignedSchema,
  conversationUnassignedSchema,
  conversationStatusChangedSchema,
} from './conversation-events'

export { messageInboundSchema, messageOutboundSchema } from './message-inbound'

export { campaignLinkClickedSchema, campaignLinkClickedPayloadSchema } from './campaign-click'
export type { CampaignLinkClicked, CampaignLinkClickedPayload } from './campaign-click'

export {
  funnelEnteredSchema,
  funnelStageChangedSchema,
  opportunityLabelChangedSchema,
  opportunityWonSchema,
  opportunityLostSchema,
} from './funnel-events'

export type {
  FunnelEntered,
  FunnelStageChanged,
  OpportunityLabelChanged,
  OpportunityWon,
  OpportunityLost,
} from './funnel-events'

// ── Internal imports for registry ───────────────────────────────────────────
import {
  ticketOpenedSchema,
  ticketStatusChangedSchema,
  ticketResolvedSchema,
  ticketReopenedSchema,
  ticketAssignedSchema,
  ticketUnassignedSchema,
} from './ticket-events'

import {
  conversationOpenedSchema,
  conversationReopenedSchema,
  conversationClosedSchema,
  conversationAssignedSchema,
  conversationUnassignedSchema,
  conversationStatusChangedSchema,
} from './conversation-events'

import { messageInboundSchema, messageOutboundSchema } from './message-inbound'

import { campaignLinkClickedPayloadSchema } from './campaign-click'

import {
  funnelEnteredSchema,
  funnelStageChangedSchema,
  opportunityLabelChangedSchema,
  opportunityWonSchema,
  opportunityLostSchema,
} from './funnel-events'

type KindEntry = {
  source: ModuleSource
  schema: z.ZodTypeAny
}

type KindRegistry = Record<string, KindEntry>

export const KIND_REGISTRY: KindRegistry = {
  // ── Contact / identity (MOD-CONTACT, MOD-MERGE) ──────────────────────────
  contact_created: {
    source: 'MOD-CONTACT',
    schema: z.object({
      origin: z.enum(['checkout', 'message', 'import', 'manual', 'integration']),
      source_ref: z.string().optional(),
    }),
  },
  contact_updated: {
    source: 'MOD-CONTACT',
    schema: z.object({
      field: z.string(),
      from: z.unknown(),
      to: z.unknown(),
    }),
  },
  contact_tag_added: {
    source: 'MOD-CONTACT',
    schema: z.object({
      tag: z.string(),
      source: z.enum(['manual', 'benefit', 'automation']),
    }),
  },
  contact_tag_removed: {
    source: 'MOD-CONTACT',
    schema: z.object({
      tag: z.string(),
    }),
  },
  contact_blacklisted: {
    source: 'MOD-CONTACT',
    schema: z.object({
      from_status: z.string().optional(),
      reason: z.string().optional(),
    }),
  },
  contact_issue_opened: {
    source: 'MOD-MERGE',
    schema: z.object({
      issue_id: z.string(),
      kind: z.string(),
      detail: z.string(),
    }),
  },
  contact_issue_resolved: {
    source: 'MOD-MERGE',
    schema: z.object({
      issue_id: z.string(),
      resolution: z.string(),
    }),
  },
  contact_merged: {
    source: 'MOD-MERGE',
    schema: z.object({
      merged_into: z.string().uuid(),
      merged_from: z.string().uuid(),
      reason: z.string(),
    }),
  },
  contact_unmerged: {
    source: 'MOD-MERGE',
    schema: z.object({
      merge_id: z.string().uuid(),
      principal_contact_id: z.string().uuid(),
      secondary_contact_id: z.string().uuid(),
      reason: z.string(),
    }),
  },

  // ── Transaction (MOD-TRANSACTION) ────────────────────────────────────────
  sale_approved: {
    source: 'MOD-TRANSACTION',
    schema: z.object({
      transaction_id: z.string().uuid(),
      amount: z.number().positive(),
      offer_id: z.string().uuid(),
    }),
  },

  // ── Inbox / conversation (MOD-INBOX) ─────────────────────────────────────
  message_inbound: {
    source: 'MOD-INBOX',
    schema: messageInboundSchema,
  },
  message_outbound: {
    source: 'MOD-INBOX',
    schema: messageOutboundSchema,
  },
  conversation_opened: {
    source: 'MOD-INBOX',
    schema: conversationOpenedSchema,
  },
  conversation_reopened: {
    source: 'MOD-INBOX',
    schema: conversationReopenedSchema,
  },
  conversation_closed: {
    source: 'MOD-INBOX',
    schema: conversationClosedSchema,
  },
  conversation_assigned: {
    source: 'MOD-INBOX',
    schema: conversationAssignedSchema,
  },
  conversation_unassigned: {
    source: 'MOD-INBOX',
    schema: conversationUnassignedSchema,
  },
  conversation_status_changed: {
    source: 'MOD-INBOX',
    schema: conversationStatusChangedSchema,
  },

  // ── Ticket (MOD-TICKET) ───────────────────────────────────────────────────
  ticket_opened: {
    source: 'MOD-TICKET',
    schema: ticketOpenedSchema,
  },
  ticket_status_changed: {
    source: 'MOD-TICKET',
    schema: ticketStatusChangedSchema,
  },
  ticket_resolved: {
    source: 'MOD-TICKET',
    schema: ticketResolvedSchema,
  },
  ticket_reopened: {
    source: 'MOD-TICKET',
    schema: ticketReopenedSchema,
  },
  ticket_assigned: {
    source: 'MOD-TICKET',
    schema: ticketAssignedSchema,
  },
  ticket_unassigned: {
    source: 'MOD-TICKET',
    schema: ticketUnassignedSchema,
  },

  // ── Campaign / Marketing (MOD-CAMPAIGN) ──────────────────────────────────
  // TE-CAMPAIGN-CLICK: docs/30-contracts/03-timeline-event-catalog.md §Marketing / Funil
  campaign_link_clicked: {
    source: 'MOD-CAMPAIGN',
    schema: campaignLinkClickedPayloadSchema,
  },

  // ── Funnel / Opportunity (MOD-FUNNEL) ────────────────────────────────────
  // TE-FUNNEL-ENTERED
  funnel_entered: {
    source: 'MOD-FUNNEL',
    schema: funnelEnteredSchema,
  },
  // TE-FUNNEL-STAGE-CHANGED
  funnel_stage_changed: {
    source: 'MOD-FUNNEL',
    schema: funnelStageChangedSchema,
  },
  // TE-OPPORTUNITY-LABEL-CHANGED
  opportunity_label_changed: {
    source: 'MOD-FUNNEL',
    schema: opportunityLabelChangedSchema,
  },
  // TE-OPPORTUNITY-WON
  opportunity_won: {
    source: 'MOD-FUNNEL',
    schema: opportunityWonSchema,
  },
  // TE-OPPORTUNITY-LOST
  opportunity_lost: {
    source: 'MOD-FUNNEL',
    schema: opportunityLostSchema,
  },
}

export function getKindEntry(kind: string): KindEntry | null {
  return KIND_REGISTRY[kind] ?? null
}
