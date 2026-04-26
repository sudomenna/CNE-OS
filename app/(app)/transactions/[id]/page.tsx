/**
 * /transactions/[id] — Detalhe de transação com 6 tabs.
 * Server Component.
 * T-8-16: docs/20-domain/11-transaction-snapshot.md
 * T-12-31: docs/70-ux/07-screen-transaction-detail.md — tabs + ações NF-e
 *
 * Tabs: Itens | Snapshot | Parcelas/Assinatura | Direitos | Auditoria | Timeline
 * Header: status badge, campos principais, botão Reembolsar, menu NF-e ▾
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { SnapshotViewer } from '@/components/transaction/snapshot-viewer'
import { TransactionTabs } from '@/components/transaction/transaction-tabs'
import { TransactionActionsMenu } from '@/components/transaction/transaction-actions-menu'
import {
  TabInstallments,
  type InstallmentRowData,
  type SubscriptionData,
} from '@/components/transaction/tab-installments'
import { TabEntitlements } from '@/components/transaction/tab-entitlements'
import { TabAuditLog } from '@/components/transaction/tab-audit-log'
import { TabTimeline } from '@/components/transaction/tab-timeline'
import { getTransaction, hasActiveRefund } from '@/app/(app)/transactions/actions'
import { requireSession } from '@/lib/auth/session'
import { db } from '@/lib/db/client'
import { installment, subscription } from '@/lib/db/schema/billing'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TxStatus = 'pending' | 'approved' | 'refused' | 'refunded' | 'chargeback' | 'cancelled'

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

function formatDate(date: Date | string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

const ITEM_KIND_LABEL: Record<string, string> = {
  main: 'Principal',
  bonus: 'Bonus',
  upsell: 'Upsell',
  order_bump: 'Order Bump',
  complement: 'Complemento',
  commercial_benefit: 'Beneficio Comercial',
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `Transacao ${id.slice(0, 8)}... — CNE-OS` }
}

// ---------------------------------------------------------------------------
// Tab: Itens
// ---------------------------------------------------------------------------

interface ItemsTabProps {
  items: Array<{
    id: string
    itemKind: string
    productId: string | null
    commercialBenefitId: string | null
    quantity: number
    resolvedRules: Record<string, unknown>
    deliveryStatus: string
    responsibleUserId: string | null
    createdAt: Date
  }>
}

function ItemsTabContent({ items }: ItemsTabProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhum item registrado.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <table className="w-full text-sm" role="table" aria-label="Itens da transacao">
        <caption className="sr-only">Itens desta transacao</caption>
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Tipo
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Produto / Beneficio
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Qtd
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
            >
              Entrega
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {items.map((item) => (
            <tr key={item.id}>
              <td className="px-4 py-3">
                <Badge variant="secondary">
                  {ITEM_KIND_LABEL[item.itemKind] ?? item.itemKind}
                </Badge>
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                {item.productId ?? item.commercialBenefitId ?? '—'}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {item.quantity}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{item.deliveryStatus}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab: Snapshot
// ---------------------------------------------------------------------------

interface SnapshotTabProps {
  snapshot: {
    id: string
    flag: 'normal' | 'refunded' | 'disputed'
    payload: import('@/app/(app)/transactions/actions').SnapshotPayload
    createdAt: Date
  } | null
}

function SnapshotTabContent({ snapshot }: SnapshotTabProps) {
  if (!snapshot) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Snapshot ainda nao disponivel.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {snapshot.flag !== 'normal' && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          Flag do snapshot: <strong>{snapshot.flag}</strong>
        </div>
      )}
      <SnapshotViewer
        payload={snapshot.payload}
        capturedAt={snapshot.createdAt.toISOString()}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [session, trxResult, refundResult] = await Promise.all([
    requireSession(),
    getTransaction({ id }),
    hasActiveRefund({ transactionId: id }),
  ])

  if (!trxResult.ok) {
    if (trxResult.error.code === 'NOT_FOUND') notFound()
    throw new Error(trxResult.error.message)
  }

  const trx = trxResult.data
  const hasRefundActive = refundResult.ok ? refundResult.data.hasActive : false
  const currentUserId = session.user.id

  // Buscar subscription + parcelas para o tab Parcelas/Assinatura
  const subscriptionRows = await db
    .select()
    .from(subscription)
    .where(eq(subscription.originTransactionId, id))
    .limit(1)

  const sub = subscriptionRows[0] ?? null

  const installmentRows = sub
    ? await db
        .select()
        .from(installment)
        .where(eq(installment.subscriptionId, sub.id))
        .orderBy(installment.sequence)
    : await db
        .select()
        .from(installment)
        .where(eq(installment.transactionId, id))
        .orderBy(installment.sequence)

  // BR-REFUND: botao de reembolso visivel apenas se approved e sem refund ativo
  const canRefund = trx.status === 'approved' && !hasRefundActive

  // OQ-TD-03: botao de reprocessar webhook só aparece se há externalId
  const hasWebhook = Boolean(trx.externalId)

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
          <li>
            <Link
              href={'/transactions' as Route}
              className="hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Transacoes
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Transacao</h1>
            <Badge variant={STATUS_VARIANT[trx.status as TxStatus]}>
              {STATUS_LABEL[trx.status as TxStatus] ?? trx.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{trx.id}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">
              {formatCurrency(trx.amount, trx.currency)}
            </span>
            {trx.approvedAt && <span>Aprovada {formatDate(trx.approvedAt)}</span>}
            {trx.refusedAt && <span>Recusada {formatDate(trx.refusedAt)}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm">
            <Link
              href={`/contacts/${trx.contactId}` as Route}
              className="text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {trx.contactName}
            </Link>
            <Link
              href={`/offers/${trx.offerId}` as Route}
              className="text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              {trx.offerName}
            </Link>
          </div>
          {trx.externalProvider && (
            <p className="text-xs text-muted-foreground mt-1">
              Provedor: <span className="font-medium">{trx.externalProvider}</span>
              {trx.externalId && (
                <span className="ml-2 font-mono">ref: {trx.externalId}</span>
              )}
            </p>
          )}
        </div>

        {/* Ações */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* BR-REFUND: botao visivel apenas se approved sem refund ativo */}
          {canRefund && (
            <Link
              href={`/transactions/${trx.id}/refund` as Route}
              className="inline-flex h-9 items-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 whitespace-nowrap"
            >
              Reembolsar
            </Link>
          )}

          {/* Menu dropdown NF-e / webhook */}
          <TransactionActionsMenu
            transactionId={trx.id}
            hasWebhook={hasWebhook}
          />
        </div>
      </div>

      {/* Dados principais */}
      <section
        aria-labelledby="info-heading"
        className="rounded-lg border border-border bg-card"
      >
        <h2
          id="info-heading"
          className="px-6 py-4 text-sm font-semibold text-muted-foreground border-b border-border"
        >
          Dados Principais
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 px-6 py-5">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Valor</dt>
            <dd className="mt-1 text-sm font-semibold text-foreground tabular-nums">
              {formatCurrency(trx.amount, trx.currency)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Moeda</dt>
            <dd className="mt-1 text-sm text-foreground">{trx.currency}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Contato</dt>
            <dd className="mt-1 text-sm text-foreground">
              <Link
                href={`/contacts/${trx.contactId}` as Route}
                className="text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {trx.contactName}
              </Link>
              {trx.contactEmail && (
                <span className="block text-xs text-muted-foreground">
                  {trx.contactEmail}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Oferta</dt>
            <dd className="mt-1 text-sm text-foreground">
              <Link
                href={`/offers/${trx.offerId}` as Route}
                className="text-muted-foreground hover:text-foreground underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {trx.offerName}
              </Link>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Criada em</dt>
            <dd className="mt-1 text-sm text-foreground">{formatDate(trx.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Aprovada em</dt>
            <dd className="mt-1 text-sm text-foreground">{formatDate(trx.approvedAt)}</dd>
          </div>
          {trx.refusedAt && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Recusada em</dt>
              <dd className="mt-1 text-sm text-foreground">
                {formatDate(trx.refusedAt)}
              </dd>
            </div>
          )}
          {trx.externalProvider && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Provedor</dt>
              <dd className="mt-1 text-sm text-foreground">{trx.externalProvider}</dd>
            </div>
          )}
          {trx.externalId && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">ID Externo</dt>
              <dd className="mt-1 text-sm text-foreground font-mono">{trx.externalId}</dd>
            </div>
          )}
          {trx.externalFee && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Taxa externa</dt>
              <dd className="mt-1 text-sm text-foreground tabular-nums">
                {formatCurrency(trx.externalFee, trx.currency)}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* 6 tabs */}
      <TransactionTabs
        defaultTab="itens"
        itensContent={<ItemsTabContent items={trx.items} />}
        snapshotContent={<SnapshotTabContent snapshot={trx.snapshot} />}
        parcelasContent={
          <TabInstallments
            transactionId={trx.id}
            userId={currentUserId}
            subscription={sub as SubscriptionData | null}
            installments={installmentRows as unknown as InstallmentRowData[]}
          />
        }
        direitosContent={<TabEntitlements transactionId={trx.id} />}
        auditoriaContent={<TabAuditLog transactionId={trx.id} />}
        timelineContent={<TabTimeline transactionId={trx.id} />}
      />
    </div>
  )
}
