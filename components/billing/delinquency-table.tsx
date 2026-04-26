'use client'

/**
 * DelinquencyTable — tabela do dashboard de inadimplência.
 * Client Component: necessário para useColumnVisibility + ColumnsCustomizer (T-16-10).
 *
 * T-9-15: docs/20-domain/13-subscription-billing.md §5
 * T-16-10: docs/80-roadmap/13-sprint-16-table-columns-customizer.md
 */

import Link from 'next/link'
import type { Route } from 'next'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  BILLING_DELINQUENCY_TABLE_ID,
  DELINQUENCY_COLUMNS,
} from './delinquency-columns'

export type DelinquencyRow = {
  subscriptionId: string
  contactId: string
  contactName: string
  offerName: string
  brandName: string
  totalOverdue: number
  oldestDueAt: Date
  ageDays: number
  bucket: '0-30' | '31-60' | '61-90' | '90+'
}

interface DelinquencyTableProps {
  rows: DelinquencyRow[]
  userId: string
}

const BUCKET_BADGE: Record<DelinquencyRow['bucket'], string> = {
  '0-30': 'bg-yellow-100 text-yellow-800',
  '31-60': 'bg-orange-100 text-orange-800',
  '61-90': 'bg-red-100 text-red-800',
  '90+': 'bg-rose-100 text-rose-800',
}

const BUCKET_LABEL: Record<DelinquencyRow['bucket'], string> = {
  '0-30': '0–30 dias',
  '31-60': '31–60 dias',
  '61-90': '61–90 dias',
  '90+': 'Acima de 90 dias',
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR').format(date)
}

export function DelinquencyTable({ rows, userId }: DelinquencyTableProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: BILLING_DELINQUENCY_TABLE_ID,
    userId,
    columns: DELINQUENCY_COLUMNS,
  })

  if (rows.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-border bg-card px-6 py-12 text-center"
      >
        <p className="text-sm text-muted-foreground">Nenhuma assinatura inadimplente encontrada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={BILLING_DELINQUENCY_TABLE_ID}
          userId={userId}
          columns={DELINQUENCY_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table
          className="min-w-full divide-y divide-slate-200"
          aria-label="Lista de inadimplencia"
        >
          <thead className="bg-muted/50">
            <tr>
              {/* contact — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Contato
              </th>
              {isVisible('offer') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Oferta
                </th>
              )}
              {isVisible('brand') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Marca
                </th>
              )}
              {isVisible('totalOverdue') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Total vencido
                </th>
              )}
              {isVisible('oldestDueAt') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  1ª parcela vencida
                </th>
              )}
              {isVisible('bucket') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Atraso
                </th>
              )}
              {isVisible('ageDays') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Dias em atraso
                </th>
              )}
              {/* actions — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.map((row) => (
              <tr key={row.subscriptionId} className="hover:bg-muted/50 transition-colors">
                {/* contact — alwaysVisible */}
                <td className="px-4 py-3">
                  <Link
                    href={`/contacts/${row.contactId}` as Route}
                    className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    {row.contactName}
                  </Link>
                </td>

                {isVisible('offer') && (
                  <td className="px-4 py-3 text-sm text-muted-foreground">{row.offerName}</td>
                )}

                {isVisible('brand') && (
                  <td className="px-4 py-3 text-sm text-muted-foreground">{row.brandName}</td>
                )}

                {isVisible('totalOverdue') && (
                  <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                    {formatCurrency(row.totalOverdue)}
                  </td>
                )}

                {isVisible('oldestDueAt') && (
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    <time dateTime={row.oldestDueAt.toISOString()}>{formatDate(row.oldestDueAt)}</time>
                  </td>
                )}

                {isVisible('bucket') && (
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BUCKET_BADGE[row.bucket]}`}
                      aria-label={`Atraso de ${BUCKET_LABEL[row.bucket]}`}
                    >
                      {BUCKET_LABEL[row.bucket]}
                    </span>
                  </td>
                )}

                {isVisible('ageDays') && (
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                    {row.ageDays}
                  </td>
                )}

                {/* actions — alwaysVisible */}
                <td className="px-4 py-3">
                  <Link
                    href={`/billing/${row.subscriptionId}` as Route}
                    className="text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    aria-label={`Ver assinatura de ${row.contactName}`}
                  >
                    Ver assinatura
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
