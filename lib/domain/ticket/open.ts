/**
 * MOD-TICKET — openTicket
 *
 * docs/20-domain/06-ticket.md §2
 * docs/30-contracts/07-module-interfaces.md §MOD-TICKET
 *
 * ADR-10: throws TicketDomainError subtypes, never returns Result<T,E>
 * ADR-11: tx is mandatory first argument (mutating function)
 */
import type { DbTx } from '@/lib/db/client'
import { ticket, ticketStatusHistory } from '@/lib/db/schema/ticket'
import type { Ticket } from '@/lib/db/schema/ticket'
import { emitTimelineEvent } from '@/lib/timeline/emit'

export type OpenTicketInput = {
  contactId: string
  brandId: string
  category: 'commercial' | 'support' | 'financial' | 'cancellation' | 'refund' | 'access' | 'registration' | 'other'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  title: string
  description?: string | null
  openedByUserId: string
  originConversationId?: string | null
}

export async function openTicket(tx: DbTx, input: OpenTicketInput): Promise<Ticket> {
  const {
    contactId,
    brandId,
    category,
    priority,
    title,
    description,
    openedByUserId,
    originConversationId,
  } = input

  // INSERT ticket with status='open'
  const rows = await tx
    .insert(ticket)
    .values({
      contactId,
      brandId,
      category,
      priority,
      title,
      description: description ?? null,
      openedByUserId,
      originConversationId: originConversationId ?? null,
      status: 'open',
    })
    .returning()

  const row = rows[0]
  if (!row) {
    throw new Error('openTicket: INSERT ticket returned no row')
  }

  // INV-TICKET-06: cada transição de status gera linha no histórico
  await tx.insert(ticketStatusHistory).values({
    ticketId: row.id,
    fromStatus: null,
    toStatus: 'open',
    changedByUserId: openedByUserId,
    reason: null,
  })

  // TE-TICKET-OPENED
  await emitTimelineEvent(
    {
      contactId,
      brandId,
      kind: 'ticket_opened',
      source: 'MOD-TICKET',
      actorUserId: openedByUserId,
      subjectKind: 'ticket',
      subjectId: row.id,
      payload: {
        ticket_id: row.id,
        ticket_number: row.number,
        category,
        priority,
      },
    },
    tx,
  )

  return row
}
