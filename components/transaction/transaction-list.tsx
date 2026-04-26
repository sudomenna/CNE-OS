'use client'

/**
 * TransactionList — tabela de transações com badge de status e customizador de colunas.
 * Client Component — necessário para useColumnVisibility (localStorage, ADR-19).
 * T-8-16: docs/20-domain/11-transaction-snapshot.md
 * T-16-06: Customizador de colunas (ColumnsCustomizer + useColumnVisibility)
 */

import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import {
  TRANSACTION_COLUMNS,
  TRANSACTIONS_LIST_TABLE_ID,
} from './transaction-columns'
import type { TransactionListItem } from '@/app/(app)/transactions/actions'

// ---------------------------------------------------------------------------
// Helpers de status
// ---------------------------------------------------------------------------

type TxStatus = TransactionListItem['status']

const STATUS_LABEL: Record<TxStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  refused: 'Recusada',
  refunded: 'Reembolsada',
  chargeback: 'Chargeback',
  cancelled: 'Cancelada',
}

const STATUS_VARIANT: Record<TxStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  approved: 'default',
  refused: 'destructive',
  refunded: 'outline',
  chargeback: 'destructive',
  cancelled: 'outline',
}

function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(Number(amount))
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface TransactionListProps {
  transactions: TransactionListItem[]
  userId: string
}

export function TransactionList({ transactions, userId }: TransactionListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: TRANSACTIONS_LIST_TABLE_ID,
    userId,
    columns: TRANSACTION_COLUMNS,
  })

  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma transação encontrada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end mb-2">
        <ColumnsCustomizer
          tableId={TRANSACTIONS_LIST_TABLE_ID}
          userId={userId}
          columns={TRANSACTION_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" role="table" aria-label="Lista de transacoes">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {isVisible('date') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Data
                  </th>
                )}
                {isVisible('contact') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Contato
                  </th>
                )}
                {isVisible('offer') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Oferta
                  </th>
                )}
                {isVisible('amount') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Valor
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  {isVisible('date') && (
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <Link
                        href={`/transactions/${tx.id}` as Route}
                        className="font-medium text-foreground hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {formatDate(tx.createdAt)}
                      </Link>
                    </td>
                  )}
                  {isVisible('contact') && (
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground truncate max-w-[200px]">
                        {tx.contactName}
                      </div>
                      {tx.contactEmail && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {tx.contactEmail}
                        </div>
                      )}
                    </td>
                  )}
                  {isVisible('offer') && (
                    <td className="px-4 py-3">
                      <span className="text-muted-foreground truncate max-w-[200px] block">
                        {tx.offerName}
                      </span>
                    </td>
                  )}
                  {isVisible('amount') && (
                    <td className="px-4 py-3 text-right font-medium text-foreground whitespace-nowrap tabular-nums">
                      {formatCurrency(tx.amount, tx.currency)}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[tx.status]}>
                        {STATUS_LABEL[tx.status]}
                      </Badge>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
