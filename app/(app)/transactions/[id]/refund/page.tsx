/**
 * /transactions/[id]/refund — Wizard de solicitação de reembolso (3 passos)
 *
 * Server Component: carrega dados da transação e verifica elegibilidade.
 * Client Component filho (RefundWizard) gerencia o estado do wizard.
 *
 * T-8-19: docs/20-domain/14-refund.md §7
 *         BR-RBAC: refund.open → admin|financial + 2FA
 */

import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { RefundWizard } from '@/components/refund/wizard'
import { getTransaction, hasActiveRefund } from '@/app/(app)/transactions/actions'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `Solicitar Reembolso — ${id.slice(0, 8)}…` }
}

export default async function RefundPage({
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

  // BR-REFUND: redireciona se a transação não é elegível para reembolso
  if (trx.status !== 'approved' || hasRefundActive) {
    redirect(`/transactions/${id}` as Route)
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <ol className="flex items-center gap-2">
          <li>
            <Link
              href={'/transactions' as Route}
              className="hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
            >
              Transações
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-300">/</li>
          <li>
            <Link
              href={`/transactions/${id}` as Route}
              className="hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
            >
              {id.slice(0, 8)}…
            </Link>
          </li>
          <li aria-hidden="true" className="text-slate-300">/</li>
          <li className="font-medium text-slate-900" aria-current="page">
            Reembolso
          </li>
        </ol>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">Solicitar Reembolso</h1>
        <p className="text-sm text-slate-500 mt-1">
          Transação <span className="font-mono">{id.slice(0, 8)}…</span> —{' '}
          {trx.contactName} · {trx.offerName}
        </p>
      </div>

      <RefundWizard
        transactionId={id}
        transactionAmount={trx.amount}
        currency={trx.currency}
      />
    </div>
  )
}
