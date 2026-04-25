/**
 * DelinquencyTable — tabela do dashboard de inadimplência.
 *
 * Server Component: renderiza lista de assinaturas inadimplentes com dados
 * agregados de parcelas vencidas.
 *
 * T-9-15: docs/20-domain/13-subscription-billing.md §5
 */

import Link from 'next/link'
import type { Route } from 'next'

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

export function DelinquencyTable({ rows }: DelinquencyTableProps) {
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
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full divide-y divide-slate-200" aria-label="Lista de inadimplencia">
        <thead className="bg-muted/50">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Contato
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Oferta
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Marca
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Total vencido
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              1ª parcela vencida
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Atraso
            </th>
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
              {/* Contato */}
              <td className="px-4 py-3">
                <Link
                  href={`/contacts/${row.contactId}` as Route}
                  className="text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                >
                  {row.contactName}
                </Link>
              </td>

              {/* Oferta */}
              <td className="px-4 py-3 text-sm text-muted-foreground">{row.offerName}</td>

              {/* Marca */}
              <td className="px-4 py-3 text-sm text-muted-foreground">{row.brandName}</td>

              {/* Total vencido */}
              <td className="px-4 py-3 text-right text-sm font-medium text-foreground">
                {formatCurrency(row.totalOverdue)}
              </td>

              {/* Primeira parcela vencida */}
              <td className="px-4 py-3 text-sm text-muted-foreground">
                <time dateTime={row.oldestDueAt.toISOString()}>{formatDate(row.oldestDueAt)}</time>
              </td>

              {/* Bucket de atraso */}
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BUCKET_BADGE[row.bucket]}`}
                  aria-label={`Atraso de ${BUCKET_LABEL[row.bucket]}`}
                >
                  {BUCKET_LABEL[row.bucket]}
                </span>
              </td>

              {/* Ações */}
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
  )
}
