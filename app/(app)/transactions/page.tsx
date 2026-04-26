/**
 * /transactions — Lista paginada de transacoes.
 * Server Component — lê via Server Action.
 * T-8-16: docs/20-domain/11-transaction-snapshot.md
 * Read-only: nenhuma acao de mutacao nesta pagina.
 */

import { Suspense } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { TransactionList } from '@/components/transaction/transaction-list'
import {
  TransactionListSkeleton,
  TransactionListEmptyState,
} from '@/components/transaction/transaction-list-skeleton'
import { getTransactions } from './actions'

export const metadata = {
  title: 'Transacoes — CNE-OS',
}

const PAGE_SIZE = 50

type TransactionStatus = 'pending' | 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled'

const VALID_STATUSES: TransactionStatus[] = [
  'pending',
  'approved',
  'refused',
  'refunded',
  'chargeback',
  'cancelled',
]

const STATUS_LABEL: Record<TransactionStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  refused: 'Recusada',
  refunded: 'Reembolsada',
  chargeback: 'Chargeback',
  cancelled: 'Cancelada',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// ---------------------------------------------------------------------------
// Async sub-component — isolado para Suspense streaming
// ---------------------------------------------------------------------------

interface TransactionListDataProps {
  selectedStatus?: TransactionStatus | undefined
  dateFrom?: string | undefined
  dateTo?: string | undefined
  page: number
}

async function TransactionListData({ selectedStatus, dateFrom, dateTo, page }: TransactionListDataProps) {
  const result = await getTransactions({
    status: selectedStatus,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  if (!result.ok) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Erro ao carregar transacoes: {result.error.message}
      </div>
    )
  }

  const { items } = result.data

  if (items.length === 0) {
    return <TransactionListEmptyState />
  }

  return <TransactionList transactions={items} />
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const statusParam = typeof params['status'] === 'string' ? params['status'] : ''
  const dateFrom = typeof params['date_from'] === 'string' ? params['date_from'] : ''
  const dateTo = typeof params['date_to'] === 'string' ? params['date_to'] : ''
  const page = Math.max(1, Number(params['page'] ?? '1'))

  const selectedStatus = VALID_STATUSES.includes(statusParam as TransactionStatus)
    ? (statusParam as TransactionStatus)
    : undefined

  // Run count separately so the header shows immediately
  const countResult = await getTransactions({
    status: selectedStatus,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
    page: 1,
    pageSize: 1,
  })

  const { total, totalPages } = countResult.ok
    ? countResult.data
    : { total: 0, totalPages: 1 }

  const buildPageUrl = (p: number) => {
    const qs = new URLSearchParams()
    if (selectedStatus) qs.set('status', selectedStatus)
    if (dateFrom) qs.set('date_from', dateFrom)
    if (dateTo) qs.set('date_to', dateTo)
    qs.set('page', String(p))
    return `/transactions?${qs.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transacoes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} {total === 1 ? 'transacao encontrada' : 'transacoes encontradas'}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" action="/transactions" className="flex flex-wrap items-end gap-3">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter" className="text-xs font-medium text-muted-foreground">
            Status
          </label>
          <select
            id="status-filter"
            name="status"
            defaultValue={selectedStatus ?? ''}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Todos</option>
            {VALID_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Data de inicio */}
        <div className="flex flex-col gap-1">
          <label htmlFor="date-from" className="text-xs font-medium text-muted-foreground">
            De
          </label>
          <input
            id="date-from"
            type="date"
            name="date_from"
            defaultValue={dateFrom}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Data de fim */}
        <div className="flex flex-col gap-1">
          <label htmlFor="date-to" className="text-xs font-medium text-muted-foreground">
            Ate
          </label>
          <input
            id="date-to"
            type="date"
            name="date_to"
            defaultValue={dateTo}
            className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <button
          type="submit"
          className="h-9 inline-flex items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Filtrar
        </button>

        {(selectedStatus || dateFrom || dateTo) && (
          <Link
            href={'/transactions' as Route}
            className="h-9 inline-flex items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Limpar
          </Link>
        )}
      </form>

      {/* Lista com Suspense streaming */}
      <Suspense fallback={<TransactionListSkeleton rows={8} />}>
        <TransactionListData
          selectedStatus={selectedStatus}
          dateFrom={dateFrom || undefined}
          dateTo={dateTo || undefined}
          page={page}
        />
      </Suspense>

      {/* Paginacao */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacao de transacoes"
          className="flex items-center justify-between border-t border-border pt-4"
        >
          <div>
            {page > 1 ? (
              <Link
                href={buildPageUrl(page - 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-border bg-muted/50 px-4 text-sm font-medium text-muted-foreground/60 cursor-not-allowed">
                Anterior
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">
            Pagina <strong>{page}</strong> de <strong>{totalPages}</strong>
          </p>

          <div>
            {page < totalPages ? (
              <Link
                href={buildPageUrl(page + 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Proxima
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-border bg-muted/50 px-4 text-sm font-medium text-muted-foreground/60 cursor-not-allowed">
                Proxima
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
