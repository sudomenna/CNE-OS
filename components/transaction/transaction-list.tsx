/**
 * TransactionList — tabela de transações com badge de status.
 * Server Component (sem interatividade — filtros ficam na página).
 * T-8-16: docs/20-domain/11-transaction-snapshot.md
 */

import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
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
}

export function TransactionList({ transactions }: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-12 text-center">
        <p className="text-sm text-slate-500">Nenhuma transação encontrada.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-sm" role="table" aria-label="Lista de transacoes">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Data
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Contato
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Oferta
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Valor
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {transactions.map((tx) => (
              <tr
                key={tx.id}
                className="hover:bg-slate-50 transition-colors"
              >
                <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                  <Link
                    href={`/transactions/${tx.id}` as Route}
                    className="font-medium text-slate-900 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
                  >
                    {formatDate(tx.createdAt)}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900 truncate max-w-[200px]">
                    {tx.contactName}
                  </div>
                  {tx.contactEmail && (
                    <div className="text-xs text-slate-500 truncate max-w-[200px]">
                      {tx.contactEmail}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-700 truncate max-w-[200px] block">
                    {tx.offerName}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900 whitespace-nowrap tabular-nums">
                  {formatCurrency(tx.amount, tx.currency)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[tx.status]}>
                    {STATUS_LABEL[tx.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
