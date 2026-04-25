/**
 * /billing/subscriptions — Lista de assinaturas.
 * Server Component.
 * T-9-14: docs/20-domain/13-subscription-billing.md §3.1, §6.1
 *
 * Filtros: status
 * Paginação: page/pageSize
 * Link para detalhe: /billing/subscriptions/[id]
 */

import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { SubscriptionCard } from '@/components/billing/subscription-card'
import { listSubscriptionsAction } from './queries'

export const metadata = {
  title: 'Assinaturas — CNE-OS',
}

const PAGE_SIZE = 50

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'

const VALID_STATUSES: SubscriptionStatus[] = [
  'trial',
  'active',
  'past_due',
  'paused',
  'cancelled',
  'expired',
]

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Ativa',
  past_due: 'Inadimplente',
  paused: 'Pausada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SubscriptionsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const statusParam = typeof params['status'] === 'string' ? params['status'] : ''
  const page = Math.max(1, Number(params['page'] ?? '1'))

  const selectedStatus = VALID_STATUSES.includes(statusParam as SubscriptionStatus)
    ? (statusParam as SubscriptionStatus)
    : undefined

  const result = await listSubscriptionsAction({
    status: selectedStatus,
    page,
    pageSize: PAGE_SIZE,
  })

  const { items, total, totalPages } = result.ok
    ? result.data
    : { items: [], total: 0, totalPages: 1 }

  // Constrói URLs de paginação preservando filtros
  const buildPageUrl = (p: number) => {
    const qs = new URLSearchParams()
    if (selectedStatus) qs.set('status', selectedStatus)
    qs.set('page', String(p))
    return `/billing/subscriptions?${qs.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Assinaturas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total} {total === 1 ? 'assinatura encontrada' : 'assinaturas encontradas'}
          </p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" action="/billing/subscriptions" className="flex flex-wrap items-end gap-3">
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

        <button
          type="submit"
          className="h-9 inline-flex items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Filtrar
        </button>

        {selectedStatus && (
          <Link
            href={'/billing/subscriptions' as Route}
            className="h-9 inline-flex items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Limpar
          </Link>
        )}
      </form>

      {/* Lista */}
      {!result.ok ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Erro ao carregar assinaturas: {result.error.message}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma assinatura encontrada.</p>
          {selectedStatus && (
            <p className="mt-2 text-xs text-muted-foreground/60">
              Filtro ativo: <Badge variant="secondary">{STATUS_LABEL[selectedStatus]}</Badge>
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table
              className="w-full text-sm"
              role="table"
              aria-label="Lista de assinaturas"
            >
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Contato
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Oferta
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Periodo Atual
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Proximo Billing
                  </th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Acoes</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((sub) => (
                  <SubscriptionCard key={sub.id} subscription={sub} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Paginacao */}
      {totalPages > 1 && (
        <nav
          aria-label="Paginacao de assinaturas"
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
