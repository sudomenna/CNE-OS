/**
 * MOD-TICKET — Timeline payload schemas
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Ticket
 * Extracted from lib/timeline/schemas/index.ts (T-3-15).
 */
import { z } from 'zod'

export const ticketOpenedSchema = z.object({
  ticket_id: z.string().uuid(),
  ticket_number: z.number().int().positive(),
  category: z.string(),
  priority: z.string(),
})

export const ticketStatusChangedSchema = z.object({
  ticket_id: z.string().uuid(),
  from_status: z.string(),
  to_status: z.string(),
  reason: z.string().nullable().optional(),
})

export const ticketResolvedSchema = z.object({
  ticket_id: z.string().uuid(),
  from_status: z.string(),
  reason: z.string().nullable().optional(),
})

export const ticketReopenedSchema = z.object({
  ticket_id: z.string().uuid(),
  from_status: z.string(),
  reason: z.string().nullable().optional(),
})

export const ticketAssignedSchema = z.object({
  ticket_id: z.string().uuid(),
  from_user_id: z.string().uuid().nullable(),
  to_user_id: z.string().uuid(),
})

export const ticketUnassignedSchema = z.object({
  ticket_id: z.string().uuid(),
  from_user_id: z.string().uuid().nullable(),
})
