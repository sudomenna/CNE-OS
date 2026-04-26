/**
 * TabInstallments — Server Component
 * T-12-31: Tab Parcelas/Assinatura na tela de detalhe de transação.
 *
 * Detecta billing_kind da transação via installment e subscription:
 * - Se há subscription vinculada: exibe dados da assinatura + parcelas.
 * - Se há installments vinculados à transação: exibe tabela de parcelas.
 * - Caso contrário: mensagem de pagamento único.
 *
 * Ownership: components/transaction/tab-installments.tsx
 * Spec: docs/70-ux/07-screen-transaction-detail.md §5
 * Schema: lib/db/schema/billing.ts
 */

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { installment, subscription } from '@/lib/db/schema/billing'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InstallmentStatus = 'scheduled' | 'paid' | 'overdue' | 'refunded' | 'cancelled'
type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  scheduled: 'Agendada',
  paid: 'Paga',
  overdue: 'Em atraso',
  refunded: 'Reembolsada',
  cancelled: 'Cancelada',
}

const INSTALLMENT_STATUS_CLASSES: Record<InstallmentStatus, string> = {
  scheduled:
    'inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700',
  paid: 'inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700',
  overdue:
    'inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700',
  refunded:
    'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
  cancelled:
    'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
}

const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Ativa',
  past_due: 'Em atraso',
  paused: 'Pausada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

function formatCurrency(amount: string): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(amount))
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function formatDateTime(date: Date | string | null): string {
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
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center"
      role="status"
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export — Server Component
// ---------------------------------------------------------------------------

interface TabInstallmentsProps {
  transactionId: string
}

export async function TabInstallments({ transactionId }: TabInstallmentsProps) {
  // Buscar subscription vinculada à transação de origem
  const subscriptionRows = await db
    .select()
    .from(subscription)
    .where(eq(subscription.originTransactionId, transactionId))
    .limit(1)

  const sub = subscriptionRows[0] ?? null

  // Buscar parcelas vinculadas à transação OU à subscription encontrada
  const installmentRows = sub
    ? await db
        .select()
        .from(installment)
        .where(eq(installment.subscriptionId, sub.id))
        .orderBy(installment.sequence)
    : await db
        .select()
        .from(installment)
        .where(eq(installment.transactionId, transactionId))
        .orderBy(installment.sequence)

  // Cenário: assinatura
  if (sub) {
    const statusLabel =
      SUBSCRIPTION_STATUS_LABEL[sub.status as SubscriptionStatus] ?? sub.status

    return (
      <div className="space-y-6">
        {/* Header da assinatura */}
        <section aria-labelledby="sub-heading" className="rounded-lg border border-border bg-card">
          <h3
            id="sub-heading"
            className="px-6 py-4 text-sm font-semibold text-muted-foreground border-b border-border"
          >
            Assinatura
          </h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 px-6 py-5">
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground">
                  {statusLabel}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Período atual</dt>
              <dd className="mt-1 text-sm text-foreground">
                {formatDate(sub.currentPeriodStart)} — {formatDate(sub.currentPeriodEnd)}
              </dd>
            </div>
            {sub.nextBillingAt && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Próxima cobrança</dt>
                <dd className="mt-1 text-sm text-foreground">{formatDate(sub.nextBillingAt)}</dd>
              </div>
            )}
            {sub.trialEndsAt && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Trial até</dt>
                <dd className="mt-1 text-sm text-foreground">{formatDate(sub.trialEndsAt)}</dd>
              </div>
            )}
            {sub.cancelledAt && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Cancelada em</dt>
                <dd className="mt-1 text-sm text-foreground">{formatDate(sub.cancelledAt)}</dd>
              </div>
            )}
            {sub.cancelReason && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Motivo do cancelamento</dt>
                <dd className="mt-1 text-sm text-foreground">{sub.cancelReason}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Parcelas da assinatura */}
        <section aria-labelledby="installments-heading">
          <h3
            id="installments-heading"
            className="text-sm font-semibold text-muted-foreground mb-3"
          >
            Cobranças ({installmentRows.length})
          </h3>
          {installmentRows.length === 0 ? (
            <EmptyState message="Nenhuma cobrança registrada." />
          ) : (
            <InstallmentsTable rows={installmentRows} />
          )}
        </section>
      </div>
    )
  }

  // Cenário: parcelas de transação (cartão parcelado)
  if (installmentRows.length > 0) {
    return (
      <section aria-labelledby="installments-heading">
        <h3
          id="installments-heading"
          className="text-sm font-semibold text-muted-foreground mb-3"
        >
          Parcelas ({installmentRows.length})
        </h3>
        <InstallmentsTable rows={installmentRows} />
      </section>
    )
  }

  // Cenário: pagamento único
  return <EmptyState message="Pagamento unico — sem parcelas ou assinatura vinculada." />
}

// ---------------------------------------------------------------------------
// Tabela de parcelas
// ---------------------------------------------------------------------------

type InstallmentRow = {
  id: string
  sequence: number
  due_at: Date
  amount: string
  status: string
  paidAt: Date | null
  externalId: string | null
  retryCount: number
}

function InstallmentsTable({ rows }: { rows: InstallmentRow[] }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm" role="table" aria-label="Parcelas">
        <caption className="sr-only">Lista de parcelas da transacao</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              N°
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Vencimento
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Valor
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
              Pago em
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell"
            >
              Ref. externa
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => {
            const statusKey = row.status as InstallmentStatus
            const label = INSTALLMENT_STATUS_LABEL[statusKey] ?? row.status
            const badgeClass =
              INSTALLMENT_STATUS_CLASSES[statusKey] ??
              'inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'

            return (
              <tr key={row.id}>
                <td className="px-4 py-3 tabular-nums text-foreground font-medium">
                  {row.sequence}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDate(row.due_at)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-foreground">
                  {formatCurrency(row.amount)}
                </td>
                <td className="px-4 py-3">
                  <span className={badgeClass} aria-label={`Status: ${label}`}>
                    {label}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatDateTime(row.paidAt)}
                </td>
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                  {row.externalId ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
