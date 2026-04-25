/**
 * /transactions/[id] — Detalhe de transacao com snapshot viewer.
 * Server Component.
 * T-8-16: docs/20-domain/11-transaction-snapshot.md
 *
 * - Header com campos principais (id externo, valor, status, datas)
 * - SnapshotViewer com payload em arvore colapsavel
 * - Secao de itens da transacao (transaction_item)
 * - Secao de historico de status (transaction_status_history)
 * - Botao "Reembolsar" visivel APENAS se status='approved' E sem refund ativo
 *   (leva para /transactions/[id]/refund — T-8-19)
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { SnapshotViewer } from '@/components/transaction/snapshot-viewer'
import { getTransaction, hasActiveRefund } from '@/app/(app)/transactions/actions'

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
// Metadados da pagina
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `Transacao ${id.slice(0, 8)}... — CNE-OS` }
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

  const [trxResult, refundResult] = await Promise.all([
    getTransaction({ id }),
    hasActiveRefund({ transactionId: id }),
  ])

  if (!trxResult.ok) {
    if (trxResult.error.code === 'NOT_FOUND') notFound()
    throw new Error(trxResult.error.message)
  }

  const trx = trxResult.data
  const hasRefundActive = refundResult.ok ? refundResult.data.hasActive : false

  // BR-REFUND: botao de reembolso visivel apenas se approved e sem refund ativo
  const canRefund = trx.status === 'approved' && !hasRefundActive

  return (
    <div className="space-y-8 max-w-4xl">
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
          <li className="font-medium text-foreground truncate max-w-[200px]" aria-current="page">
            {id.slice(0, 8)}...
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Transacao</h1>
            <Badge variant={STATUS_VARIANT[trx.status as TxStatus]}>
              {STATUS_LABEL[trx.status as TxStatus] ?? trx.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{trx.id}</p>
        </div>
        {/* BR-REFUND: botao visivel apenas se approved sem refund ativo */}
        {canRefund && (
          <Link
            href={`/transactions/${trx.id}/refund` as Route}
            className="inline-flex h-9 items-center rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 whitespace-nowrap"
          >
            Reembolsar
          </Link>
        )}
      </div>

      {/* Dados principais */}
      <section aria-labelledby="info-heading" className="rounded-lg border border-border bg-card">
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
                <span className="block text-xs text-muted-foreground">{trx.contactEmail}</span>
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
              <dd className="mt-1 text-sm text-foreground">{formatDate(trx.refusedAt)}</dd>
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

      {/* Snapshot Viewer */}
      {trx.snapshot ? (
        <section aria-labelledby="snapshot-heading">
          <h2
            id="snapshot-heading"
            className="text-lg font-semibold text-foreground mb-3"
          >
            Snapshot da Venda
          </h2>
          <SnapshotViewer
            payload={trx.snapshot.payload}
            capturedAt={trx.snapshot.createdAt.toISOString()}
          />
        </section>
      ) : (
        <section aria-labelledby="snapshot-heading">
          <h2
            id="snapshot-heading"
            className="text-lg font-semibold text-foreground mb-3"
          >
            Snapshot da Venda
          </h2>
          <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Snapshot ainda nao disponivel (transacao {trx.status}).
            </p>
          </div>
        </section>
      )}

      {/* Itens da transacao */}
      <section aria-labelledby="items-heading">
        <h2
          id="items-heading"
          className="text-lg font-semibold text-foreground mb-3"
        >
          Itens ({trx.items.length})
        </h2>
        {trx.items.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhum item registrado.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <table className="w-full text-sm" role="table" aria-label="Itens da transacao">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Tipo
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Produto / Beneficio
                  </th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Qtd
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Entrega
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trx.items.map((item) => (
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.deliveryStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Historico de status */}
      <section aria-labelledby="history-heading">
        <h2
          id="history-heading"
          className="text-lg font-semibold text-foreground mb-3"
        >
          Historico de Status
        </h2>
        {trx.statusHistory.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">Sem historico de status.</p>
          </div>
        ) : (
          <ol className="relative border-l-2 border-border ml-3 space-y-4">
            {trx.statusHistory.map((entry) => (
              <li key={entry.id} className="ml-4">
                <div className="absolute -left-[9px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-muted-foreground/40" />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</span>
                  {entry.fromStatus && (
                    <>
                      <Badge variant="outline" className="text-xs">
                        {STATUS_LABEL[entry.fromStatus as TxStatus] ?? entry.fromStatus}
                      </Badge>
                      <span className="text-muted-foreground/60" aria-hidden="true">
                        →
                      </span>
                    </>
                  )}
                  <Badge variant={STATUS_VARIANT[entry.toStatus as TxStatus] ?? 'secondary'}>
                    {STATUS_LABEL[entry.toStatus as TxStatus] ?? entry.toStatus}
                  </Badge>
                </div>
                {(entry.actorSystem || entry.reason) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.actorSystem && <span className="font-medium">{entry.actorSystem}</span>}
                    {entry.actorSystem && entry.reason && ' — '}
                    {entry.reason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
