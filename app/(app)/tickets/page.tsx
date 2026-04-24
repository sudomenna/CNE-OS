/**
 * /tickets — Lista de tickets
 * MOD-TICKET — Server Component
 * docs/20-domain/06-ticket.md
 */

import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { ticket } from '@/lib/db/schema/ticket'
import { TicketCard } from '@/components/ticket/ticket-card'
import type { TicketCardRow } from '@/components/ticket/ticket-card'

export const metadata = {
  title: 'Tickets — CNE-OS',
}

type TicketStatus = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'cancelled'

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

export default async function TicketsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const statusParam =
    typeof params['status'] === 'string' && params['status'] !== ''
      ? (params['status'] as TicketStatus)
      : undefined

  const whereConditions = [
    isNull(ticket.deletedAt),
    ...(statusParam ? [eq(ticket.status, statusParam)] : []),
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tickets</h1>
          <p className="text-sm text-slate-500 mt-1">
            {tickets.length} {tickets.length === 1 ? 'ticket encontrado' : 'tickets encontrados'}
          </p>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filtrar por status">
        {STATUS_OPTIONS.map((opt) => {
          const isActive = (statusParam ?? '') === opt.value
          const href = opt.value ? `/tickets?status=${opt.value}` : '/tickets'
          return (
            <a
              key={opt.value}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex h-8 items-center rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </a>
          )
        })}
      </div>

      {/* Ticket list */}
      {tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm text-slate-400">Nenhum ticket encontrado.</p>
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Lista de tickets">
          {tickets.map((t) => (
            <li key={t.id}>
              <TicketCard ticket={t as TicketCardRow} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
