'use client'

/**
 * InstallmentTable — tabela de parcelas de uma assinatura com botão de retry.
 * Client Component (botão de retry dispara Server Action).
 * T-9-14: docs/20-domain/13-subscription-billing.md §3.2, §6.2
 */

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { retryInstallmentAction } from '@/app/(app)/billing/actions'
import type { InstallmentItem } from '@/app/(app)/billing/subscriptions/queries'

// ---------------------------------------------------------------------------
// Helpers de status
// ---------------------------------------------------------------------------

type InstallmentStatus = InstallmentItem['status']

const STATUS_LABEL: Record<InstallmentStatus, string> = {
  scheduled: 'Agendada',
  paid: 'Paga',
  overdue: 'Vencida',
  refunded: 'Reembolsada',
  cancelled: 'Cancelada',
}

const STATUS_VARIANT: Record<InstallmentStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  scheduled: 'secondary',
  paid: 'default',
  overdue: 'destructive',
  refunded: 'outline',
  cancelled: 'outline',
}

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatCurrency(amount: string) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(amount))
}

// ---------------------------------------------------------------------------
// Botão de retry — componente interno
// ---------------------------------------------------------------------------

interface RetryButtonProps {
  installmentId: string
  disabled?: boolean
}

function RetryButton({ installmentId, disabled }: RetryButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleRetry() {
    startTransition(async () => {
      const result = await retryInstallmentAction({ installmentId })
      if (!result.ok) {
        // Notificação de erro simples — integração com toast é feita via T-9-UX se necessário
        alert(`Erro ao registrar retry: ${result.error.message}`)
      }
    })
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleRetry}
      disabled={disabled || isPending}
      aria-label="Tentar cobrança novamente"
      className="text-xs"
    >
      {isPending ? 'Aguarde...' : 'Retry'}
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

interface InstallmentTableProps {
  installments: InstallmentItem[]
  /** Se false, oculta coluna e botão de retry (para roles sem permissão). */
  canRetry?: boolean
}

export function InstallmentTable({ installments, canRetry = false }: InstallmentTableProps) {
  if (installments.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-500">Nenhuma parcela registrada.</p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          role="table"
          aria-label="Parcelas da assinatura"
        >
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                #
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Vencimento
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
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Pago em
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wide"
              >
                Retries
              </th>
              {canRetry && (
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wide"
                >
                  Acao
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {installments.map((inst) => (
              <tr key={inst.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 tabular-nums text-slate-700 font-medium">
                  {inst.sequence}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-700">
                  {formatDate(inst.dueAt)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 whitespace-nowrap">
                  {formatCurrency(inst.amount)}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[inst.status]}>
                    {STATUS_LABEL[inst.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-500">
                  {formatDate(inst.paidAt)}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-slate-500">
                  {inst.retryCount > 0 ? (
                    <span title={`Ultimo: ${formatDate(inst.lastRetryAt)}`}>
                      {inst.retryCount}
                    </span>
                  ) : (
                    '0'
                  )}
                </td>
                {canRetry && (
                  <td className="px-4 py-3 text-right">
                    {inst.status === 'overdue' ? (
                      <RetryButton installmentId={inst.id} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
