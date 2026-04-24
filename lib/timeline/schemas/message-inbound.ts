/**
 * MOD-INBOX — Timeline payload schemas for message events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Inbox / atendimento
 * T-3-15
 */
import { z } from 'zod'

export const messageInboundSchema = z.object({
  conversation_id: z.string().uuid(),
  direction: z.enum(['inbound', 'outbound']),
  body_preview: z.string().max(200),
})

// Outbound message shares the same payload shape as inbound
export const messageOutboundSchema = messageInboundSchema
