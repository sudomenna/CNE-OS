/**
 * MOD-TICKET — updateTicket
 *
 * docs/20-domain/06-ticket.md §3
 * docs/30-contracts/07-module-interfaces.md §MOD-TICKET
 *
 * ADR-10: throws TicketNotFoundError
 * ADR-11: tx is mandatory first argument (mutating function)
 *
 * Atualiza campos editáveis do ticket: title, description, category, priority.
 * Status e assigned_user_id têm funções dedicadas (setTicketStatus, assignTicket).
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { ticket } from '@/lib/db/schema/ticket'
import type { Ticket } from '@/lib/db/schema/ticket'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { TicketNotFoundError } from './errors'

export type TicketCategory =
  | 'commercial'
  | 'support'
  | 'financial'
  | 'cancellation'
  | 'refund'
  | 'access'
  | 'registration'
  | 'other'

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export type UpdateTicketInput = {
  title?: string
  description?: string | null
  category?: TicketCategory
  priority?: TicketPriority
  actorUserId: string
}

export async function updateTicket(
  tx: DbTx,
  ticketId: string,
  input: UpdateTicketInput,
): Promise<Ticket> {
  const rows = await tx.select().from(ticket).where(eq(ticket.id, ticketId))
  const current = rows[0]

  if (!current) {
    throw new TicketNotFoundError(ticketId)
  }

  const { actorUserId, ...fields } = input

  // Only build patch with fields that are actually being changed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {
    updatedAt: sql`now()`,
  }

  if (fields.title !== undefined) patch.title = fields.title
  if (fields.description !== undefined) patch.description = fields.description
  if (fields.category !== undefined) patch.category = fields.category
  if (fields.priority !== undefined) patch.priority = fields.priority

  const updated = await tx
    .update(ticket)
    .set(patch)
    .where(eq(ticket.id, ticketId))
    .returning()

  const updatedRow = updated[0]
  if (!updatedRow) {
    throw new Error('updateTicket: UPDATE ticket returned no row')
  }

  // Emit TE-TICKET-UPDATED for audit trail
  await emitTimelineEvent(
    {
      contactId: current.contactId,
      brandId: current.brandId,
      kind: 'ticket_updated',
      source: 'MOD-TICKET',
      actorUserId,
      subjectKind: 'ticket',
      subjectId: ticketId,
      payload: {
        ticket_id: ticketId,
        fields: Object.keys(fields),
      },
    },
    tx,
  )

  return updatedRow
}
