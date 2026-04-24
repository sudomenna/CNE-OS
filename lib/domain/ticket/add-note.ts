/**
 * MOD-TICKET — addTicketNote
 *
 * docs/20-domain/06-ticket.md §3 (ticket_note — APPEND-ONLY)
 * docs/30-contracts/07-module-interfaces.md §MOD-TICKET
 *
 * ADR-10: throws TicketNotFoundError
 * ADR-11: tx is mandatory first argument (mutating function)
 *
 * Note: no timeline event emitted — note is an internal detail (task spec §addTicketNote)
 */
import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { ticket, ticketNote } from '@/lib/db/schema/ticket'
import type { TicketNote } from '@/lib/db/schema/ticket'
import { TicketNotFoundError } from './errors'

export async function addTicketNote(
  tx: DbTx,
  ticketId: string,
  authorUserId: string,
  body: string,
  isInternal: boolean = true,
): Promise<TicketNote> {
  // Verify ticket exists
  const tickets = await tx.select({ id: ticket.id }).from(ticket).where(eq(ticket.id, ticketId))

  if (!tickets[0]) {
    throw new TicketNotFoundError(ticketId)
  }

  const rows = await tx
    .insert(ticketNote)
    .values({
      ticketId,
      authorUserId,
      body,
      isInternal,
    })
    .returning()

  const row = rows[0]
  if (!row) {
    throw new Error('addTicketNote: INSERT ticket_note returned no row')
  }

  return row
}
