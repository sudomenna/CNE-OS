/**
 * MOD-TICKET — setTicketStatus
 *
 * docs/20-domain/06-ticket.md §6 — transition matrix
 * docs/30-contracts/07-module-interfaces.md §MOD-TICKET
 *
 * ADR-10: throws InvalidTicketTransitionError / TicketNotFoundError
 * ADR-11: tx is mandatory first argument (mutating function)
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { ticket, ticketStatusHistory } from '@/lib/db/schema/ticket'
import type { Ticket } from '@/lib/db/schema/ticket'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { dispatchTrigger } from '@/lib/domain/automation/dispatch'
import { TicketNotFoundError, InvalidTicketTransitionError } from './errors'

export type TicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_reply'
  | 'resolved'
  | 'cancelled'

/**
 * Valid transitions — docs/20-domain/06-ticket.md §6
 *
 * Key = fromStatus, value = set of allowed toStatus values.
 * Same-status transitions are excluded (diagonal = –).
 */
const VALID_TRANSITIONS: Record<TicketStatus, ReadonlySet<TicketStatus>> = {
  open: new Set(['in_progress', 'waiting_reply', 'resolved', 'cancelled']),
  in_progress: new Set(['open', 'waiting_reply', 'resolved', 'cancelled']),
  waiting_reply: new Set(['open', 'in_progress', 'resolved', 'cancelled']),
  // resolved → open | in_progress (reabertura); resolved → waiting_reply ❌; resolved → cancelled ❌
  resolved: new Set(['open', 'in_progress']),
  // cancelled → open (reabertura only); all other transitions ❌
  cancelled: new Set(['open']),
}

function isReopening(from: TicketStatus, to: TicketStatus): boolean {
  return (from === 'resolved' || from === 'cancelled') && to === 'open'
}

export async function setTicketStatus(
  tx: DbTx,
  ticketId: string,
  toStatus: TicketStatus,
  actorUserId: string,
  reason?: string | null,
): Promise<Ticket> {
  // Fetch current ticket
  const rows = await tx.select().from(ticket).where(eq(ticket.id, ticketId))
  const current = rows[0]

  if (!current) {
    throw new TicketNotFoundError(ticketId)
  }

  const fromStatus = current.status as TicketStatus

  // Same status → no-op guard (treat as invalid transition)
  if (fromStatus === toStatus) {
    throw new InvalidTicketTransitionError(fromStatus, toStatus)
  }

  // Guard: validate transition matrix
  const allowed = VALID_TRANSITIONS[fromStatus]
  if (!allowed.has(toStatus)) {
    // BR-TICKET-TRANSITIONS: cancelled is a terminal state except for reopen to open
    throw new InvalidTicketTransitionError(fromStatus, toStatus)
  }

  const now = new Date()
  const resolvedAt = toStatus === 'resolved' ? now : toStatus === 'open' ? null : current.resolvedAt

  // UPDATE ticket status
  const updated = await tx
    .update(ticket)
    .set({
      status: toStatus,
      resolvedAt: resolvedAt ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(ticket.id, ticketId))
    .returning()

  const updatedRow = updated[0]
  if (!updatedRow) {
    throw new Error('setTicketStatus: UPDATE ticket returned no row')
  }

  // INV-TICKET-06: append to status history
  await tx.insert(ticketStatusHistory).values({
    ticketId,
    fromStatus,
    toStatus,
    changedByUserId: actorUserId,
    reason: reason ?? null,
  })

  // Emit appropriate timeline event
  const reopening = isReopening(fromStatus, toStatus)

  if (reopening) {
    // TE-TICKET-REOPENED
    await emitTimelineEvent(
      {
        contactId: current.contactId,
        brandId: current.brandId,
        kind: 'ticket_reopened',
        source: 'MOD-TICKET',
        actorUserId,
        subjectKind: 'ticket',
        subjectId: ticketId,
        payload: {
          ticket_id: ticketId,
          from_status: fromStatus,
          reason: reason ?? null,
        },
      },
      tx,
    )
  } else if (toStatus === 'resolved') {
    // TE-TICKET-RESOLVED
    await emitTimelineEvent(
      {
        contactId: current.contactId,
        brandId: current.brandId,
        kind: 'ticket_resolved',
        source: 'MOD-TICKET',
        actorUserId,
        subjectKind: 'ticket',
        subjectId: ticketId,
        payload: {
          ticket_id: ticketId,
          from_status: fromStatus,
          reason: reason ?? null,
        },
      },
      tx,
    )
  } else {
    // TE-TICKET-STATUS-CHANGED (all other transitions)
    await emitTimelineEvent(
      {
        contactId: current.contactId,
        brandId: current.brandId,
        kind: 'ticket_status_changed',
        source: 'MOD-TICKET',
        actorUserId,
        subjectKind: 'ticket',
        subjectId: ticketId,
        payload: {
          ticket_id: ticketId,
          from_status: fromStatus,
          to_status: toStatus,
          reason: reason ?? null,
        },
      },
      tx,
    )
  }

  // FLOW-13 T-13-24: dispatchTrigger 'ticket_closed' quando ticket transita para
  // resolved ou cancelled (ambos são estados terminais considerados "fechamento").
  // fire-and-forget — não bloqueia o retorno nem propaga falha para o caller.
  // Nota: 'ticket_closed' não está em automation_trigger_kind enum ainda;
  // o dispatch é silencioso (retorna []) até que o enum seja estendido.
  if (toStatus === 'resolved' || toStatus === 'cancelled') {
    void dispatchTrigger('ticket_closed', {
      subjectKind: 'ticket',
      subjectId: ticketId,
      data: {
        ticket_id: ticketId,
        contact_id: updatedRow.contactId,
        brand_id: updatedRow.brandId,
        from_status: fromStatus,
        to_status: toStatus,
        reason: reason ?? null,
      },
    }, tx).catch((err: unknown) =>
      console.error('[ticket.set-status] dispatchTrigger ticket_closed failed', err),
    )
  }

  return updatedRow
}
