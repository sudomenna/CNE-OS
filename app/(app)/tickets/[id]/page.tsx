/**
 * /tickets/[id] — Detalhe do ticket
 * MOD-TICKET — Server Component
 * docs/20-domain/06-ticket.md
 */

import { eq, and, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { db } from '@/lib/db/client'
import { ticket, ticketNote, ticketStatusHistory } from '@/lib/db/schema/ticket'
import { userAccount } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { TicketDetail } from '@/components/ticket/ticket-detail'
import type { TicketDetailData } from '@/components/ticket/ticket-detail'
import { TicketDetailTabs } from '@/components/ticket/ticket-detail-tabs'
import { TicketEditForm } from '@/components/ticket/ticket-edit-form'

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

  // Auth — get current user for tabs + form
  const ctx = await requireSession()

  const [ticketRows, notesRows, historyRows, usersRows] = await Promise.all([
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
    db
      .select({ id: userAccount.id, name: userAccount.fullName })
      .from(userAccount)
      .where(and(eq(userAccount.isActive, true), isNull(userAccount.deletedAt)))
      .orderBy(userAccount.fullName),
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

  const users = usersRows.map((u) => ({ id: u.id, name: u.name }))

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

      {/* Two-column layout on md+ */}
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Left: header summary + tabs */}
        <div className="space-y-6">
          {/* Header card with status controls */}
          <TicketDetail ticket={ticketData} />

          {/* Tabs: Descricao | Atividade | Notas | Historico */}
          <div className="rounded-lg border border-border bg-card p-6">
            <TicketDetailTabs
              ticketId={row.id}
              description={row.description}
              currentUserId={ctx.user.id}
              notes={ticketData.notes}
              statusHistory={ticketData.statusHistory}
            />
          </div>
        </div>

        {/* Right: inline edit form */}
        <div className="space-y-4">
          <TicketEditForm
            ticket={{
              id: row.id,
              title: row.title,
              category: row.category,
              priority: row.priority,
              status: row.status,
              assignedUserId: row.assignedUserId,
            }}
            users={users}
          />
        </div>
      </div>
    </div>
  )
}
