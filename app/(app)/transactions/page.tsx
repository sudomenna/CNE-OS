/**
 * /transactions — Lista paginada de transacoes.
 * Server Component — lê via Server Action.
 * T-8-16: docs/20-domain/11-transaction-snapshot.md
 * Read-only: nenhuma acao de mutacao nesta pagina.
 */

import Link from 'next/link'
import type { Route } from 'next'
import { TransactionList } from '@/components/transaction/transaction-list'
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

export default async function TransactionsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const statusParam = typeof params['status'] === 'string' ? params['status'] : ''
  const dateFrom = typeof params['date_from'] === 'string' ? params['date_from'] : ''
  const dateTo = typeof params['date_to'] === 'string' ? params['date_to'] : ''
  const page = Math.max(1, Number(params['page'] ?? '1'))

  const selectedStatus = VALID_STATUSES.includes(statusParam as TransactionStatus)
    ? (statusParam as TransactionStatus)
    : undefined

  const result = await getTransactions({
    status: selectedStatus,
    dateFrom: dateFrom ? `${dateFrom}T00:00:00.000Z` : undefined,
    dateTo: dateTo ? `${dateTo}T23:59:59.999Z` : undefined,
    page,
    pageSize: PAGE_SIZE,
  })

  const { items, total, totalPages } = result.ok
    ? result.data
    : { items: [], total: 0, totalPages: 1 }

  // Build pagination URLs preserving filters
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
          <h1 className="text-2xl font-bold text-slate-900">Transacoes</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} {total === 1 ? 'transacao encontrada' : 'transacoes encontradas'}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" action="/transactions" className="flex flex-wrap items-end gap-3">
        {/* Status */}
        <div className="flex flex-col gap-1">
          <label htmlFor="status-filter" className="text-xs font-medium text-slate-600">
            Status
          </label>
          <select
            id="status-filter"
            name="status"
            defaultValue={selectedStatus ?? ''}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
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
          <label htmlFor="date-from" className="text-xs font-medium text-slate-600">
            De
          </label>
          <input
            id="date-from"
            type="date"
            name="date_from"
            defaultValue={dateFrom}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        {/* Data de fim */}
        <div className="flex flex-col gap-1">
          <label htmlFor="date-to" className="text-xs font-medium text-slate-600">
            Ate
          </label>
          <input
            id="date-to"
            type="date"
            name="date_to"
            defaultValue={dateTo}
            className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>

        <button
          type="submit"
          className="h-9 inline-flex items-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          Filtrar
        </button>

        {(selectedStatus || dateFrom || dateTo) && (
          <Link
            href={'/transactions' as Route}
            className="h-9 inline-flex items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
          >
            Limpar
          </Link>
        )}
      </form>

      {/* Lista */}
      {!result.ok ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Erro ao carregar transacoes: {result.error.message}
        </div>
      ) : (
        <TransactionList transactions={items} />
      )}

      {/* Paginacao */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacao de transacoes"
          className="flex items-center justify-between border-t border-slate-200 pt-4"
        >
          <div>
            {page > 1 ? (
              <Link
                href={buildPageUrl(page - 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                Anterior
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400 cursor-not-allowed">
                Anterior
              </span>
            )}
          </div>

          <p className="text-sm text-slate-600">
            Pagina <strong>{page}</strong> de <strong>{totalPages}</strong>
          </p>

          <div>
            {page < totalPages ? (
              <Link
                href={buildPageUrl(page + 1) as Route}
                className="inline-flex h-9 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
              >
                Proxima
              </Link>
            ) : (
              <span className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-400 cursor-not-allowed">
                Proxima
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
