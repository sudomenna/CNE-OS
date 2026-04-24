import { TicketStatusSelect } from './ticket-status-select'
import { AddNoteForm } from './add-note-form'
import { AssignToMeButton } from './assign-to-me-button'

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

export interface TicketDetailData {
  id: string
  number: number
  title: string
  description: string | null
  status: TicketStatus
  priority: TicketPriority
  category: TicketCategory
  assignedUserId: string | null
  openedByUserId: string
  createdAt: Date
  resolvedAt: Date | null
  notes: {
    id: string
    authorUserId: string
    body: string
    isInternal: boolean
    createdAt: Date
  }[]
  statusHistory: {
    id: string
    fromStatus: TicketStatus | null
    toStatus: TicketStatus
    changedByUserId: string | null
    reason: string | null
    createdAt: Date
  }[]
}

// ---------------------------------------------------------------------------
// Label maps
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
// TicketDetail — Server Component
// ---------------------------------------------------------------------------

interface TicketDetailProps {
  ticket: TicketDetailData
}

export function TicketDetail({ ticket }: TicketDetailProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono text-slate-400">#{ticket.number}</span>
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
            <h1 className="text-xl font-bold text-slate-900">{ticket.title}</h1>
            {ticket.description && (
              <p className="mt-2 text-sm text-slate-600">{ticket.description}</p>
            )}
          </div>

          {/* Status control */}
          <div className="shrink-0">
            <TicketStatusSelect ticketId={ticket.id} currentStatus={ticket.status} />
          </div>
        </div>

        {/* Meta */}
        <dl className="mt-4 flex flex-wrap gap-4 text-sm text-slate-600 border-t border-slate-100 pt-4">
          <div>
            <dt className="font-medium text-slate-500">Responsavel</dt>
            <dd className="mt-0.5">
              {ticket.assignedUserId ? (
                <span className="font-mono text-xs">{ticket.assignedUserId.slice(0, 8)}…</span>
              ) : (
                <span className="text-slate-400">Nao atribuido</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Aberto por</dt>
            <dd className="mt-0.5 font-mono text-xs">{ticket.openedByUserId.slice(0, 8)}…</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Criado em</dt>
            <dd className="mt-0.5">
              <time dateTime={ticket.createdAt.toISOString()}>
                {new Date(ticket.createdAt).toLocaleString('pt-BR')}
              </time>
            </dd>
          </div>
          {ticket.resolvedAt && (
            <div>
              <dt className="font-medium text-slate-500">Resolvido em</dt>
              <dd className="mt-0.5">
                <time dateTime={ticket.resolvedAt.toISOString()}>
                  {new Date(ticket.resolvedAt).toLocaleString('pt-BR')}
                </time>
              </dd>
            </div>
          )}
        </dl>

        {/* Assign to me */}
        <div className="mt-4">
          <AssignToMeButton ticketId={ticket.id} />
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Notas ({ticket.notes.length})
        </h2>

        {ticket.notes.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhuma nota registrada.</p>
        ) : (
          <ul className="space-y-3" aria-label="Notas do ticket">
            {ticket.notes.map((note) => (
              <li
                key={note.id}
                className={`rounded-md px-4 py-3 text-sm ${
                  note.isInternal
                    ? 'border border-amber-200 bg-amber-50'
                    : 'border border-slate-100 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between mb-1 gap-2">
                  <span className="font-mono text-xs text-slate-500">
                    {note.authorUserId.slice(0, 8)}…
                  </span>
                  <div className="flex items-center gap-2">
                    {note.isInternal && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                        Interna
                      </span>
                    )}
                    <time
                      dateTime={note.createdAt.toISOString()}
                      className="text-xs text-slate-400"
                    >
                      {new Date(note.createdAt).toLocaleString('pt-BR')}
                    </time>
                  </div>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap">{note.body}</p>
              </li>
            ))}
          </ul>
        )}

        {/* Add note form */}
        <div className="mt-4">
          <AddNoteForm ticketId={ticket.id} />
        </div>
      </div>

      {/* Status history */}
      {ticket.statusHistory.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">
            Historico de status
          </h2>
          <ol className="relative border-l border-slate-200 space-y-4 ml-3" aria-label="Historico de status">
            {ticket.statusHistory.map((entry) => (
              <li key={entry.id} className="ml-4">
                <span
                  aria-hidden="true"
                  className="absolute -left-1.5 h-3 w-3 rounded-full border-2 border-white bg-slate-400"
                />
                <p className="text-sm text-slate-700">
                  {entry.fromStatus ? (
                    <>
                      <span className="font-medium">{STATUS_LABELS[entry.fromStatus]}</span>
                      {' → '}
                      <span className="font-medium">{STATUS_LABELS[entry.toStatus]}</span>
                    </>
                  ) : (
                    <>
                      Ticket aberto como{' '}
                      <span className="font-medium">{STATUS_LABELS[entry.toStatus]}</span>
                    </>
                  )}
                  {entry.reason && (
                    <span className="ml-1 text-slate-500">— {entry.reason}</span>
                  )}
                </p>
                <time
                  dateTime={entry.createdAt.toISOString()}
                  className="text-xs text-slate-400"
                >
                  {new Date(entry.createdAt).toLocaleString('pt-BR')}
                </time>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}
