import Link from 'next/link'
import type { Route } from 'next'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TicketStatus = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'cancelled'
type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
type TicketCategory =
  | 'commercial'
  | 'support'
  | 'financial'
  | 'cancellation'
  | 'refund'
  | 'access'
  | 'registration'
  | 'other'

export interface TicketCardRow {
  id: string
  number: number
  title: string
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  assignedUserId: string | null
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Label / color maps
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_reply: 'Aguardando',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
}

const STATUS_BADGE: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  waiting_reply: 'bg-orange-100 text-orange-700',
  resolved: 'bg-green-100 text-green-700',
  cancelled: 'bg-slate-100 text-slate-500',
}

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
  urgent: 'Urgente',
}

const PRIORITY_BADGE: Record<TicketPriority, string> = {
  low: 'bg-slate-100 text-slate-500',
  medium: 'bg-slate-100 text-slate-700',
  high: 'bg-amber-100 text-amber-700',
  urgent: 'bg-red-100 text-red-700',
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  commercial: 'Comercial',
  support: 'Suporte',
  financial: 'Financeiro',
  cancellation: 'Cancelamento',
  refund: 'Reembolso',
  access: 'Acesso',
  registration: 'Cadastro',
  other: 'Outro',
}

// ---------------------------------------------------------------------------
// TicketCard
// ---------------------------------------------------------------------------

interface TicketCardProps {
  ticket: TicketCardRow
}

export function TicketCard({ ticket }: TicketCardProps) {
  const initials = ticket.assignedUserId
    ? ticket.assignedUserId.slice(0, 2).toUpperCase()
    : null

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50 transition-colors">
      {/* Left: number + title + badges */}
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 shrink-0">#{ticket.number}</span>
          <Link
            href={`/tickets/${ticket.id}` as Route}
            className="truncate text-sm font-medium text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
          >
            {ticket.title}
          </Link>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[ticket.status]}`}
          >
            {STATUS_LABELS[ticket.status]}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_BADGE[ticket.priority]}`}
          >
            {PRIORITY_LABELS[ticket.priority]}
          </span>
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {CATEGORY_LABELS[ticket.category]}
          </span>
        </div>
      </div>

      {/* Right: assignee initials + date */}
      <div className="ml-4 flex shrink-0 flex-col items-end gap-1">
        {initials ? (
          <span
            aria-label={`Atribuido a usuario ${ticket.assignedUserId}`}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-xs font-semibold text-white"
          >
            {initials}
          </span>
        ) : (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-300 text-xs text-slate-400">
            —
          </span>
        )}
        <time
          dateTime={ticket.createdAt.toISOString()}
          className="text-xs text-slate-400"
        >
          {new Date(ticket.createdAt).toLocaleDateString('pt-BR')}
        </time>
      </div>
    </div>
  )
}
