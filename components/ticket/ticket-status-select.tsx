'use client'

/**
 * TicketStatusSelect — Client Component dropdown de status do ticket.
 *
 * Chama changeTicketStatusAction ao selecionar novo status.
 * Inacessivel para status terminal (sem transicoes disponiveis).
 */

import { useTransition } from 'react'
import { changeTicketStatusAction } from '@/app/(app)/tickets/actions'

type TicketStatus = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'cancelled'

const STATUS_LABELS: Record<TicketStatus, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_reply: 'Aguardando',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
}

// Transitions matrix from UI perspective (mirrors domain rules)
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ['in_progress', 'waiting_reply', 'resolved', 'cancelled'],
  in_progress: ['open', 'waiting_reply', 'resolved', 'cancelled'],
  waiting_reply: ['open', 'in_progress', 'resolved', 'cancelled'],
  resolved: ['open', 'in_progress'],
  cancelled: ['open'],
}

interface TicketStatusSelectProps {
  ticketId: string
  currentStatus: TicketStatus
}

export function TicketStatusSelect({ ticketId, currentStatus }: TicketStatusSelectProps) {
  const [isPending, startTransition] = useTransition()

  const options = TRANSITIONS[currentStatus]

  if (options.length === 0) {
    return (
      <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-500">
        {STATUS_LABELS[currentStatus]}
      </span>
    )
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const toStatus = e.target.value as TicketStatus
    if (!toStatus) return
    startTransition(async () => {
      await changeTicketStatusAction({ ticketId, toStatus })
    })
  }

  return (
    <div className="relative">
      <select
        aria-label="Alterar status do ticket"
        defaultValue=""
        onChange={handleChange}
        disabled={isPending}
        className="appearance-none rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
      >
        <option value="" disabled>
          {STATUS_LABELS[currentStatus]}
        </option>
        {options.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {isPending && (
        <span
          aria-label="Salvando"
          className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700"
        />
      )}
    </div>
  )
}
