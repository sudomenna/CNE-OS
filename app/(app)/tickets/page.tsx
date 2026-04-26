/**
 * /tickets — Lista de tickets
 * MOD-TICKET — Server Component
 * docs/20-domain/06-ticket.md
 */

import { Suspense } from 'react'
import { and, desc, eq, isNull, gte, lte } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { ticket } from '@/lib/db/schema/ticket'
import { userAccount } from '@/lib/db/schema/organization'
import { TicketCard } from '@/components/ticket/ticket-card'
import type { TicketCardRow } from '@/components/ticket/ticket-card'
import { TicketFilters } from '@/components/ticket/ticket-filters'
import { TicketListSkeleton, TicketListEmptyState } from '@/components/ticket/ticket-list-skeleton'

export const metadata = {
  title: 'Tickets — CNE-OS',
}

type TicketStatus = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'cancelled'
type TicketCategory =
  | 'commercial'
  | 'support'
  | 'financial'
  | 'cancellation'
  | 'refund'
  | 'access'
  | 'registration'
  | 'other'
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

const STATUS_OPTIONS: { value: TicketStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'waiting_reply', label: 'Aguardando' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'cancelled', label: 'Cancelado' },
]

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// ---------------------------------------------------------------------------
// Async sub-component — isolado para Suspense streaming
// ---------------------------------------------------------------------------

interface TicketListDataProps {
  statusParam?: TicketStatus | undefined
  categoryParam?: TicketCategory | undefined
  priorityParam?: TicketPriority | undefined
  assigneeParam?: string | undefined
  dateFromParam?: Date | undefined
  dateToParam?: Date | undefined
}

async function TicketListData({
  statusParam,
  categoryParam,
  priorityParam,
  assigneeParam,
  dateFromParam,
  dateToParam,
}: TicketListDataProps) {
  const whereConditions = [
    isNull(ticket.deletedAt),
    ...(statusParam ? [eq(ticket.status, statusParam)] : []),
    ...(categoryParam ? [eq(ticket.category, categoryParam)] : []),
    ...(priorityParam ? [eq(ticket.priority, priorityParam)] : []),
    ...(assigneeParam ? [eq(ticket.assignedUserId, assigneeParam)] : []),
    ...(dateFromParam ? [gte(ticket.createdAt, dateFromParam)] : []),
    ...(dateToParam ? [lte(ticket.createdAt, dateToParam)] : []),
  ]

  const tickets = await db
    .select({
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      assignedUserId: ticket.assignedUserId,
      createdAt: ticket.createdAt,
    })
    .from(ticket)
    .where(and(...whereConditions))
    .orderBy(desc(ticket.createdAt))
    .limit(50)

  if (tickets.length === 0) {
    return <TicketListEmptyState />
  }

  return (
    <ul className="space-y-2" aria-label="Lista de tickets">
      {tickets.map((t) => (
        <li key={t.id}>
          <TicketCard ticket={t as TicketCardRow} />
        </li>
      ))}
    </ul>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TicketsPage({ searchParams }: PageProps) {
  const params = await searchParams

  const statusParam =
    typeof params['status'] === 'string' && params['status'] !== ''
      ? (params['status'] as TicketStatus)
      : undefined

  const categoryParam =
    typeof params['category'] === 'string' && params['category'] !== ''
      ? (params['category'] as TicketCategory)
      : undefined

  const priorityParam =
    typeof params['priority'] === 'string' && params['priority'] !== ''
      ? (params['priority'] as TicketPriority)
      : undefined

  const assigneeParam =
    typeof params['assignee'] === 'string' && params['assignee'] !== ''
      ? params['assignee']
      : undefined

  const dateFromParam =
    typeof params['date_from'] === 'string' && params['date_from'] !== ''
      ? new Date(params['date_from'])
      : undefined

  const dateToParam =
    typeof params['date_to'] === 'string' && params['date_to'] !== ''
      ? (() => {
          const d = new Date(params['date_to'] as string)
          // Include full last day
          d.setHours(23, 59, 59, 999)
          return d
        })()
      : undefined

  const usersRows = await db
    .select({ id: userAccount.id, name: userAccount.fullName })
    .from(userAccount)
    .where(and(eq(userAccount.isActive, true), isNull(userAccount.deletedAt)))
    .orderBy(userAccount.fullName)

  const users = usersRows.map((u) => ({ id: u.id, name: u.name }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Tickets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie e acompanhe os tickets de atendimento.
          </p>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filtrar por status">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = (statusParam ?? '') === opt.value
          const baseParams = new URLSearchParams()
          if (opt.value) baseParams.set('status', opt.value)
          if (categoryParam) baseParams.set('category', categoryParam)
          if (priorityParam) baseParams.set('priority', priorityParam)
          if (assigneeParam) baseParams.set('assignee', assigneeParam)
          if (params['date_from']) baseParams.set('date_from', params['date_from'] as string)
          if (params['date_to']) baseParams.set('date_to', params['date_to'] as string)
          const href = baseParams.toString() ? `/tickets?${baseParams.toString()}` : '/tickets'

          return (
            <a
              key={opt.value}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </a>
          )
        })}
      </div>

      {/* Advanced filters */}
      <TicketFilters users={users} />

      {/* Ticket list with Suspense streaming */}
      <Suspense fallback={<TicketListSkeleton rows={7} />}>
        <TicketListData
          statusParam={statusParam}
          categoryParam={categoryParam}
          priorityParam={priorityParam}
          assigneeParam={assigneeParam}
          dateFromParam={dateFromParam}
          dateToParam={dateToParam}
        />
      </Suspense>
    </div>
  )
}
