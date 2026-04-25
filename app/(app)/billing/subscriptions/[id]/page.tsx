/**
 * /billing/subscriptions/[id] — Detalhe de assinatura.
 * Server Component.
 * T-9-14: docs/20-domain/13-subscription-billing.md §3.1, §3.2, §6.1
 *
 * - Cabeçalho com status, período e info de cancelamento
 * - Tabela de installments com botão de retry (overdue)
 * - Botão "Cancelar assinatura" visível apenas para admin/financial
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { InstallmentTable } from '@/components/billing/installment-table'
import { CancelSubscriptionButton } from '@/components/billing/cancel-subscription-button'
import { getSubscriptionAction } from '../queries'
import { requireSession } from '@/lib/auth/session'

// ---------------------------------------------------------------------------
// Helpers de status
// ---------------------------------------------------------------------------

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Ativa',
  past_due: 'Inadimplente',
  paused: 'Pausada',
  cancelled: 'Cancelada',
  expired: 'Expirada',
}

const STATUS_VARIANT: Record<SubscriptionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  trial: 'secondary',
  active: 'default',
  past_due: 'destructive',
  paused: 'secondary',
  cancelled: 'outline',
  expired: 'outline',
}

function formatDateTime(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatDate(date: Date | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

// ---------------------------------------------------------------------------
// Metadados
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `Assinatura ${id.slice(0, 8)}... — CNE-OS` }
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Busca dados + sessão em paralelo
  const [subResult, ctx] = await Promise.all([
    getSubscriptionAction({ id }),
    requireSession(),
  ])

  if (!subResult.ok) {
    if (subResult.error.code === 'NOT_FOUND') notFound()
    throw new Error(subResult.error.message)
  }

  const sub = subResult.data

  // RBAC: botão de cancelar visível apenas para admin e financial
  // O Server Action valida por conta própria — aqui apenas controlamos visibilidade UI
  const canManage = ctx.user.role === 'admin' || ctx.user.role === 'financial'

  // Assinatura pode ser cancelada apenas quando status não é já cancelled/expired
  const canCancel = canManage && sub.status !== 'cancelled' && sub.status !== 'expired'

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
          <li>
            <Link
              href={'/billing/subscriptions' as Route}
              className="hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Assinaturas
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40">
            /
          </li>
          <li
            className="font-medium text-foreground truncate max-w-[200px]"
            aria-current="page"
          >
            {id.slice(0, 8)}...
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Assinatura</h1>
            <Badge variant={STATUS_VARIANT[sub.status as SubscriptionStatus]}>
              {STATUS_LABEL[sub.status as SubscriptionStatus] ?? sub.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{sub.id}</p>
        </div>

        {canCancel && (
          <CancelSubscriptionButton subscriptionId={sub.id} />
        )}
      </div>

      {/* Informacoes da assinatura */}
      <section
        aria-labelledby="info-heading"
        className="rounded-lg border border-border bg-card"
      >
        <h2
          id="info-heading"
          className="px-6 py-4 text-sm font-semibold text-muted-foreground border-b border-border"
        >
          Informacoes da Assinatura
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 px-6 py-5">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Contato</dt>
            <dd className="mt-1 text-sm text-foreground">
              <Link
                href={`/contacts/${sub.contactId}` as Route}
                className="text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {sub.contactName}
              </Link>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Oferta</dt>
            <dd className="mt-1 text-sm text-foreground">
              <Link
                href={`/offers/${sub.offerId}` as Route}
                className="text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {sub.offerName}
              </Link>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Periodo atual</dt>
            <dd className="mt-1 text-sm text-foreground tabular-nums">
              {formatDate(sub.currentPeriodStart)} – {formatDate(sub.currentPeriodEnd)}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Proximo billing</dt>
            <dd className="mt-1 text-sm text-foreground tabular-nums">
              {formatDateTime(sub.nextBillingAt)}
            </dd>
          </div>

          {sub.trialEndsAt && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Fim do trial</dt>
              <dd className="mt-1 text-sm text-foreground tabular-nums">
                {formatDateTime(sub.trialEndsAt)}
              </dd>
            </div>
          )}

          <div>
            <dt className="text-xs font-medium text-muted-foreground">Criada em</dt>
            <dd className="mt-1 text-sm text-foreground tabular-nums">
              {formatDateTime(sub.createdAt)}
            </dd>
          </div>

          {sub.cancelledAt && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Cancelada em</dt>
              <dd className="mt-1 text-sm text-foreground tabular-nums">
                {formatDateTime(sub.cancelledAt)}
              </dd>
            </div>
          )}

          {sub.cancelReason && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">Motivo do cancelamento</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{sub.cancelReason}</dd>
            </div>
          )}

          {sub.externalProvider && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Provedor externo</dt>
              <dd className="mt-1 text-sm text-foreground">{sub.externalProvider}</dd>
            </div>
          )}

          {sub.externalId && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">ID externo</dt>
              <dd className="mt-1 text-sm text-foreground font-mono">{sub.externalId}</dd>
            </div>
          )}
        </dl>
      </section>

      {/* Parcelas */}
      <section aria-labelledby="installments-heading">
        <h2
          id="installments-heading"
          className="text-lg font-semibold text-foreground mb-3"
        >
          Parcelas ({sub.installments.length})
        </h2>
        <InstallmentTable
          installments={sub.installments}
          canRetry={canManage}
        />
      </section>
    </div>
  )
}
