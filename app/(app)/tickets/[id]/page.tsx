/**
 * /tickets/[id] — Detalhe do ticket
 * MOD-TICKET — Server Component
 * docs/20-domain/06-ticket.md
 */

import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { db } from '@/lib/db/client'
import { ticket, ticketNote, ticketStatusHistory } from '@/lib/db/schema/ticket'
import { TicketDetail } from '@/components/ticket/ticket-detail'
import type { TicketDetailData } from '@/components/ticket/ticket-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const rows = await db
    .select({ number: ticket.number, title: ticket.title })
    .from(ticket)
    .where(eq(ticket.id, id))
    .limit(1)

  const row = rows[0]
  if (!row) return { title: 'Ticket — CNE-OS' }
  return { title: `#${row.number} ${row.title} — CNE-OS` }
}

export default async function TicketDetailPage({ params }: PageProps) {
  const { id } = await params

  const [ticketRows, notesRows, historyRows] = await Promise.all([
    db.select().from(ticket).where(eq(ticket.id, id)).limit(1),
    db
      .select()
      .from(ticketNote)
      .where(eq(ticketNote.ticketId, id))
      .orderBy(ticketNote.createdAt),
    db
      .select()
      .from(ticketStatusHistory)
      .where(eq(ticketStatusHistory.ticketId, id))
      .orderBy(ticketStatusHistory.createdAt),
  ])

  const row = ticketRows[0]
  if (!row) {
    notFound()
  }

  const ticketData: TicketDetailData = {
    id: row.id,
    number: row.number,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    assignedUserId: row.assignedUserId,
    openedByUserId: row.openedByUserId,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    notes: notesRows.map((n) => ({
      id: n.id,
      authorUserId: n.authorUserId,
      body: n.body,
      isInternal: n.isInternal,
      createdAt: n.createdAt,
    })),
    statusHistory: historyRows.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      changedByUserId: h.changedByUserId,
      reason: h.reason,
      createdAt: h.createdAt,
    })),
  }

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <nav aria-label="Navegacao" className="text-sm text-muted-foreground">
        <Link
          href={'/tickets' as Route}
          className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Tickets
        </Link>
        <span aria-hidden="true" className="mx-2">
          /
        </span>
        <span className="text-foreground">#{row.number}</span>
      </nav>

      <TicketDetail ticket={ticketData} />
    </div>
  )
}
