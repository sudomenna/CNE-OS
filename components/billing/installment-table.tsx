'use client'

/**
 * InstallmentTable — tabela de parcelas de uma assinatura com botão de retry.
 * Client Component (botão de retry dispara Server Action).
 * T-9-14: docs/20-domain/13-subscription-billing.md §3.2, §6.2
 * T-16-10: customizador de colunas adicionado (billing:installments).
 */

import { useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { retryInstallmentAction } from '@/app/(app)/billing/actions'
import type { InstallmentItem } from '@/app/(app)/billing/subscriptions/queries'
import {
  BILLING_INSTALLMENTS_TABLE_ID,
  INSTALLMENT_COLUMNS,
} from './installment-columns'

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
  userId: string
}

export function InstallmentTable({ installments, canRetry = false, userId }: InstallmentTableProps) {
  // Colunas efetivas: se canRetry=false, a coluna 'actions' não deve aparecer
  const effectiveColumns = canRetry
    ? INSTALLMENT_COLUMNS
    : INSTALLMENT_COLUMNS.filter((col) => col.id !== 'actions')

  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: BILLING_INSTALLMENTS_TABLE_ID,
    userId,
    columns: effectiveColumns,
  })

  if (installments.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhuma parcela registrada.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={BILLING_INSTALLMENTS_TABLE_ID}
          userId={userId}
          columns={effectiveColumns}
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
            aria-label="Parcelas da assinatura"
          >
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {/* sequence — alwaysVisible */}
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  #
                </th>
                {isVisible('dueAt') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Vencimento
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
                {isVisible('paidAt') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Pago em
                  </th>
                )}
                {isVisible('retryCount') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Retries
                  </th>
                )}
                {isVisible('boletoUrl') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Boleto
                  </th>
                )}
                {isVisible('externalId') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    ID externo
                  </th>
                )}
                {canRetry && isVisible('actions') && (
                  <th
                    scope="col"
                    className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                  >
                    Acao
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {installments.map((inst) => (
                <tr key={inst.id} className="hover:bg-muted/50 transition-colors">
                  {/* sequence — alwaysVisible */}
                  <td className="px-4 py-3 tabular-nums text-muted-foreground font-medium">
                    {inst.sequence}
                  </td>
                  {isVisible('dueAt') && (
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDate(inst.dueAt)}
                    </td>
                  )}
                  {isVisible('amount') && (
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-foreground whitespace-nowrap">
                      {formatCurrency(inst.amount)}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[inst.status]}>
                        {STATUS_LABEL[inst.status]}
                      </Badge>
                    </td>
                  )}
                  {isVisible('paidAt') && (
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-muted-foreground">
                      {formatDate(inst.paidAt)}
                    </td>
                  )}
                  {isVisible('retryCount') && (
                    <td className="px-4 py-3 text-center tabular-nums text-muted-foreground">
                      {inst.retryCount > 0 ? (
                        <span title={`Ultimo: ${formatDate(inst.lastRetryAt)}`}>
                          {inst.retryCount}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                  )}
                  {isVisible('boletoUrl') && (
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {inst.boletoUrl ? (
                        <a
                          href={inst.boletoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          Abrir
                        </a>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('externalId') && (
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">
                      {inst.externalId ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                  )}
                  {canRetry && isVisible('actions') && (
                    <td className="px-4 py-3 text-right">
                      {inst.status === 'overdue' ? (
                        <RetryButton installmentId={inst.id} />
                      ) : (
                        <span className="text-xs text-muted-foreground/60">—</span>
                      )}
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
