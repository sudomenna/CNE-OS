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

// ── Sale events (T-8-21) ─────────────────────────────────────────────────────
export {
  salePendingPayloadSchema,
  saleApprovedPayloadSchema,
  saleRefusedPayloadSchema,
  saleRefundedPayloadSchema,
} from './sale-events'

export type {
  SalePendingPayload,
  SaleApprovedPayload,
  SaleRefusedPayload,
  SaleRefundedPayload,
} from './sale-events'

// ── Entitlement events (T-8-21) ──────────────────────────────────────────────
export {
  entitlementGrantedPayloadSchema,
  entitlementExtendedPayloadSchema,
  entitlementRevokedPayloadSchema,
} from './entitlement-events'

export type {
  EntitlementGrantedPayload,
  EntitlementExtendedPayload,
  EntitlementRevokedPayload,
} from './entitlement-events'

// ── Subscription / Installment events (MOD-BILLING, T-9-17) ─────────────────
export {
  TeSubscriptionStartedSchema,
  TeSubscriptionRenewedSchema,
  TeSubscriptionPastDueSchema,
  TeSubscriptionCancelledSchema,
} from './subscription-events'
export type {
  TeSubscriptionStarted,
  TeSubscriptionRenewed,
  TeSubscriptionPastDue,
  TeSubscriptionCancelled,
} from './subscription-events'

export {
  TeInstallmentPaidSchema,
  TeInstallmentOverdueSchema,
} from './installment-events'
export type {
  TeInstallmentPaid,
  TeInstallmentOverdue,
} from './installment-events'

// ── Refund events (T-8-21) ───────────────────────────────────────────────────
export {
  refundOpenedPayloadSchema,
  refundApprovedPayloadSchema,
  refundRejectedPayloadSchema,
} from './refund-events'

export type {
  RefundOpenedPayload,
  RefundApprovedPayload,
  RefundRejectedPayload,
} from './refund-events'

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

import {
  salePendingPayloadSchema,
  saleApprovedPayloadSchema,
  saleRefusedPayloadSchema,
  saleRefundedPayloadSchema,
} from './sale-events'

import {
  entitlementGrantedPayloadSchema,
  entitlementExtendedPayloadSchema,
  entitlementRevokedPayloadSchema,
} from './entitlement-events'

import {
  TeSubscriptionStartedSchema,
  TeSubscriptionRenewedSchema,
  TeSubscriptionPastDueSchema,
  TeSubscriptionCancelledSchema,
} from './subscription-events'
import {
  TeInstallmentPaidSchema,
  TeInstallmentOverdueSchema,
} from './installment-events'

import {
  refundOpenedPayloadSchema,
  refundApprovedPayloadSchema,
  refundRejectedPayloadSchema,
} from './refund-events'

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

  // ── Sale events (MOD-TRANSACTION / MOD-REFUND) ───────────────────────────
  // TE-SALE-PENDING: docs/30-contracts/03-timeline-event-catalog.md
  sale_pending: {
    source: 'MOD-TRANSACTION',
    schema: salePendingPayloadSchema,
  },
  // TE-SALE-APPROVED
  sale_approved: {
    source: 'MOD-TRANSACTION',
    schema: saleApprovedPayloadSchema,
  },
  // TE-SALE-REFUSED
  sale_refused: {
    source: 'MOD-TRANSACTION',
    schema: saleRefusedPayloadSchema,
  },
  // TE-SALE-REFUNDED
  sale_refunded: {
    source: 'MOD-REFUND',
    schema: saleRefundedPayloadSchema,
  },

  // ── Entitlement events (MOD-ENTITLEMENT) ─────────────────────────────────
  // TE-ENTITLEMENT-GRANTED
  entitlement_granted: {
    source: 'MOD-ENTITLEMENT',
    schema: entitlementGrantedPayloadSchema,
  },
  // TE-ENTITLEMENT-EXTENDED
  entitlement_extended: {
    source: 'MOD-ENTITLEMENT',
    schema: entitlementExtendedPayloadSchema,
  },
  // TE-ENTITLEMENT-REVOKED
  entitlement_revoked: {
    source: 'MOD-ENTITLEMENT',
    schema: entitlementRevokedPayloadSchema,
  },

  // ── Subscription events (MOD-BILLING, T-9-17) ────────────────────────────
  subscription_started: {
    source: 'MOD-BILLING',
    schema: TeSubscriptionStartedSchema,
  },
  subscription_renewed: {
    source: 'MOD-BILLING',
    schema: TeSubscriptionRenewedSchema,
  },
  subscription_past_due: {
    source: 'MOD-BILLING',
    schema: TeSubscriptionPastDueSchema,
  },
  subscription_cancelled: {
    source: 'MOD-BILLING',
    schema: TeSubscriptionCancelledSchema,
  },
  // ── Installment events (MOD-BILLING, T-9-17) ──────────────────────────────
  installment_paid: {
    source: 'MOD-BILLING',
    schema: TeInstallmentPaidSchema,
  },
  installment_overdue: {
    source: 'MOD-BILLING',
    schema: TeInstallmentOverdueSchema,
  },

  // ── Refund lifecycle events (MOD-REFUND) ─────────────────────────────────
  // TE-REFUND-OPENED
  refund_opened: {
    source: 'MOD-REFUND',
    schema: refundOpenedPayloadSchema,
  },
  // TE-REFUND-APPROVED
  refund_approved: {
    source: 'MOD-REFUND',
    schema: refundApprovedPayloadSchema,
  },
  // TE-REFUND-REJECTED
  refund_rejected: {
    source: 'MOD-REFUND',
    schema: refundRejectedPayloadSchema,
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
