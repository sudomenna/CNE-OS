/**
 * MOD-INBOX — Timeline payload schemas for conversation events
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Inbox / atendimento
 * T-3-15
 */
import { z } from 'zod'

export const conversationOpenedSchema = z.object({
  conversation_id: z.string().uuid(),
  channel_account_id: z.string().uuid(),
})

export const conversationReopenedSchema = z.object({
  conversation_id: z.string().uuid(),
})

export const conversationClosedSchema = z.object({
  conversation_id: z.string().uuid(),
  reason: z.string().optional(),
})

export const conversationAssignedSchema = z.object({
  conversation_id: z.string().uuid(),
  to_user_id: z.string().uuid(),
})

export const conversationUnassignedSchema = z.object({
  conversation_id: z.string().uuid(),
})

export const conversationStatusChangedSchema = z.object({
  conversation_id: z.string().uuid(),
  from_status: z.string(),
  to_status: z.string(),
})
