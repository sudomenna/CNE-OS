/**
 * MOD-TICKET — assignTicket
 *
 * docs/20-domain/06-ticket.md §3 (INV-TICKET-03, INV-TICKET-06)
 * docs/30-contracts/07-module-interfaces.md §MOD-TICKET
 *
 * ADR-10: throws TicketNotFoundError
 * ADR-11: tx is mandatory first argument (mutating function)
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { ticket, ticketAssignmentHistory } from '@/lib/db/schema/ticket'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { TicketNotFoundError } from './errors'

export async function assignTicket(
  tx: DbTx,
  ticketId: string,
  toUserId: string | null,
  assignedByUserId: string,
): Promise<void> {
  // Fetch current ticket to get contactId/brandId and current assignee
  const rows = await tx.select().from(ticket).where(eq(ticket.id, ticketId))
  const current = rows[0]

  if (!current) {
    throw new TicketNotFoundError(ticketId)
  }

  const fromUserId = current.assignedUserId

  // UPDATE ticket.assigned_user_id
  await tx
    .update(ticket)
    .set({
      assignedUserId: toUserId,
      updatedAt: sql`now()`,
    })
    .where(eq(ticket.id, ticketId))

  // INV-TICKET-06: append to assignment history
  await tx.insert(ticketAssignmentHistory).values({
    ticketId,
    fromUserId: fromUserId ?? null,
    toUserId: toUserId,
    assignedByUserId,
  })

  // Emit TE-TICKET-ASSIGNED or TE-TICKET-UNASSIGNED
  if (toUserId === null) {
    // TE-TICKET-UNASSIGNED
    await emitTimelineEvent(
      {
        contactId: current.contactId,
        brandId: current.brandId,
        kind: 'ticket_unassigned',
        source: 'MOD-TICKET',
        actorUserId: assignedByUserId,
        subjectKind: 'ticket',
        subjectId: ticketId,
        payload: {
          ticket_id: ticketId,
          from_user_id: fromUserId ?? null,
        },
      },
      tx,
    )
  } else {
    // TE-TICKET-ASSIGNED
    await emitTimelineEvent(
      {
        contactId: current.contactId,
        brandId: current.brandId,
        kind: 'ticket_assigned',
        source: 'MOD-TICKET',
        actorUserId: assignedByUserId,
        subjectKind: 'ticket',
        subjectId: ticketId,
        payload: {
          ticket_id: ticketId,
          from_user_id: fromUserId ?? null,
          to_user_id: toUserId,
        },
      },
      tx,
    )
  }
}
