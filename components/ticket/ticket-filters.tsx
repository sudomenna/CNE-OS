'use client'

/**
 * TicketFilters — filtros avancados para a lista de tickets.
 * Submit via router.push com searchParams.
 *
 * MOD-TICKET — Client Component
 * docs/20-domain/06-ticket.md
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TicketFiltersProps {
  users: { id: string; name: string }[]
}

// ---------------------------------------------------------------------------
// Option sets
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: '', label: 'Todas as categorias' },
  { value: 'commercial', label: 'Comercial' },
  { value: 'support', label: 'Suporte' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'cancellation', label: 'Cancelamento' },
  { value: 'refund', label: 'Reembolso' },
  { value: 'access', label: 'Acesso' },
  { value: 'registration', label: 'Cadastro' },
  { value: 'other', label: 'Outro' },
]

const PRIORITY_OPTIONS = [
  { value: '', label: 'Todas as prioridades' },
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baixa' },
]

// ---------------------------------------------------------------------------
// TicketFilters
// ---------------------------------------------------------------------------

export function TicketFilters({ users }: TicketFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentCategory = searchParams.get('category') ?? ''
  const currentPriority = searchParams.get('priority') ?? ''
  const currentAssignee = searchParams.get('assignee') ?? ''
  const currentDateFrom = searchParams.get('date_from') ?? ''
  const currentDateTo = searchParams.get('date_to') ?? ''

  function buildHref(overrides: Record<string, string>) {
    const params = new URLSearchParams()

    // Preserve status from existing params
    const status = searchParams.get('status')
    if (status) params.set('status', status)

    const category = overrides['category'] ?? currentCategory
    const priority = overrides['priority'] ?? currentPriority
    const assignee = overrides['assignee'] ?? currentAssignee
    const dateFrom = overrides['date_from'] ?? currentDateFrom
    const dateTo = overrides['date_to'] ?? currentDateTo

    if (category) params.set('category', category)
    if (priority) params.set('priority', priority)
    if (assignee) params.set('assignee', assignee)
    if (dateFrom) params.set('date_from', dateFrom)
    if (dateTo) params.set('date_to', dateTo)

    const qs = params.toString()
    return qs ? `/tickets?${qs}` : '/tickets'
  }

  function handleChange(field: string, value: string) {
    const href = buildHref({ [field]: value })
    startTransition(() => {
      router.push(href as Route)
    })
  }

  function handleClear() {
    // Preserve only the status filter
    const status = searchParams.get('status')
    const href = status ? `/tickets?status=${status}` : '/tickets'
    startTransition(() => {
      router.push(href as Route)
    })
  }

  const hasFilters =
    currentCategory || currentPriority || currentAssignee || currentDateFrom || currentDateTo

  return (
    <div
      className="rounded-lg border border-border bg-card p-4"
      role="search"
      aria-label="Filtros de tickets"
    >
      <div className="flex flex-wrap gap-3 items-end">
        {/* Category */}
        <div className="min-w-[160px] flex-1">
          <label
            htmlFor="filter-category"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Categoria
          </label>
          <select
            id="filter-category"
            value={currentCategory}
            onChange={(e) => handleChange('category', e.target.value)}
            disabled={isPending}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label="Filtrar por categoria"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Priority */}
        <div className="min-w-[160px] flex-1">
          <label
            htmlFor="filter-priority"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Prioridade
          </label>
          <select
            id="filter-priority"
            value={currentPriority}
            onChange={(e) => handleChange('priority', e.target.value)}
            disabled={isPending}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label="Filtrar por prioridade"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Assignee */}
        <div className="min-w-[180px] flex-1">
          <label
            htmlFor="filter-assignee"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Responsavel
          </label>
          <select
            id="filter-assignee"
            value={currentAssignee}
            onChange={(e) => handleChange('assignee', e.target.value)}
            disabled={isPending}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label="Filtrar por responsavel"
          >
            <option value="">Todos os responsaveis</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="min-w-[150px] flex-1">
          <label
            htmlFor="filter-date-from"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Data inicial
          </label>
          <input
            id="filter-date-from"
            type="date"
            value={currentDateFrom}
            onChange={(e) => handleChange('date_from', e.target.value)}
            disabled={isPending}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label="Filtrar por data inicial"
          />
        </div>

        {/* Date to */}
        <div className="min-w-[150px] flex-1">
          <label
            htmlFor="filter-date-to"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            Data final
          </label>
          <input
            id="filter-date-to"
            type="date"
            value={currentDateTo}
            onChange={(e) => handleChange('date_to', e.target.value)}
            disabled={isPending}
            className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            aria-label="Filtrar por data final"
          />
        </div>

        {/* Clear */}
        {hasFilters && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleClear}
              disabled={isPending}
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              aria-label="Limpar filtros"
            >
              Limpar filtros
            </button>
          </div>
        )}
      </div>

      {isPending && (
        <p className="mt-2 text-xs text-muted-foreground/60" aria-live="polite">
          Filtrando...
        </p>
      )}
    </div>
  )
}
