'use client'

/**
 * SubscriptionList — tabela de assinaturas com customizador de colunas.
 * Client Component: necessário para useColumnVisibility + ColumnsCustomizer.
 * T-16-10: docs/80-roadmap/13-sprint-16-table-columns-customizer.md
 */

import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  BILLING_SUBSCRIPTIONS_TABLE_ID,
  SUBSCRIPTION_COLUMNS,
} from './subscription-columns'
import type { SubscriptionListItem } from '@/app/(app)/billing/subscriptions/queries'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SubscriptionStatus = SubscriptionListItem['status']

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Ativa',
  past_due: 'Inadimplente',
  paused: 'Pausada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

const STATUS_VARIANT: Record<
  SubscriptionStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  trial: 'secondary',
  active: 'default',
  past_due: 'destructive',
  paused: 'secondary',
  cancelled: 'outline',
  expired: 'outline',
}

function formatDate(date: Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatDateTime(date: Date | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface SubscriptionListProps {
  items: SubscriptionListItem[]
  userId: string
}

export function SubscriptionList({ items, userId }: SubscriptionListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: BILLING_SUBSCRIPTIONS_TABLE_ID,
    userId,
    columns: SUBSCRIPTION_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={BILLING_SUBSCRIPTIONS_TABLE_ID}
          userId={userId}
          columns={SUBSCRIPTION_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            role="table"
            aria-label="Lista de assinaturas"
          >
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {/* contact — alwaysVisible */}
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Contato
                </th>
                {isVisible('offer') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Oferta
                  </th>
                )}
                {isVisible('status') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Status
                  </th>
                )}
                {isVisible('currentPeriod') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Período Atual
                  </th>
                )}
                {isVisible('nextBilling') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Próximo Billing
                  </th>
                )}
                {isVisible('cancelledAt') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Cancelada em
                  </th>
                )}
                {isVisible('createdAt') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Criada em
                  </th>
                )}
                {/* actions — alwaysVisible */}
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleColumnIds.size}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    Nenhuma assinatura encontrada.
                  </td>
                </tr>
              ) : (
                items.map((sub) => (
                  <tr
                    key={sub.id}
                    className="hover:bg-muted/50 transition-colors"
                  >
                    {/* contact — alwaysVisible */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/contacts/${sub.contactId}` as Route}
                        className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {sub.contactName}
                      </Link>
                    </td>
                    {isVisible('offer') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {sub.offerName}
                      </td>
                    )}
                    {isVisible('status') && (
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            STATUS_VARIANT[sub.status as SubscriptionStatus]
                          }
                        >
                          {STATUS_LABEL[sub.status as SubscriptionStatus] ??
                            sub.status}
                        </Badge>
                      </td>
                    )}
                    {isVisible('currentPeriod') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                        {formatDate(sub.currentPeriodStart)} –{' '}
                        {formatDate(sub.currentPeriodEnd)}
                      </td>
                    )}
                    {isVisible('nextBilling') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                        {formatDateTime(sub.nextBillingAt)}
                      </td>
                    )}
                    {isVisible('cancelledAt') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                        {formatDateTime(sub.cancelledAt)}
                      </td>
                    )}
                    {isVisible('createdAt') && (
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                        {formatDateTime(sub.createdAt)}
                      </td>
                    )}
                    {/* actions — alwaysVisible */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/billing/subscriptions/${sub.id}` as Route}
                        className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        aria-label={`Ver assinatura de ${sub.contactName}`}
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
