/**
 * TabEntitlements — Server Component
 * T-12-31: Tab Direitos na tela de detalhe de transação.
 *
 * Lista customer_entitlement WHERE origin_transaction_id = transactionId.
 * Reutiliza estilo visual de components/contact/tab-entitlements.tsx.
 *
 * Ownership: components/transaction/tab-entitlements.tsx
 * Spec: docs/70-ux/07-screen-transaction-detail.md §6
 * Schema: lib/db/schema/entitlement.ts
 */

import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { customerEntitlement } from '@/lib/db/schema/entitlement'
import type { CustomerEntitlement } from '@/lib/db/schema/entitlement'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EntitlementKind = CustomerEntitlement['kind']
type EntitlementStatus = CustomerEntitlement['status']

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

const KIND_BADGE: Record<EntitlementKind, { label: string; classes: string }> = {
  product_access: {
    label: 'Acesso',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700',
  },
  benefit: {
    label: 'Beneficio',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700',
  },
  other: {
    label: 'Outro',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
  },
}

const STATUS_BADGE: Record<EntitlementStatus, { label: string; classes: string }> = {
  active: {
    label: 'Ativo',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700',
  },
  suspended: {
    label: 'Suspenso',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700',
  },
  expired: {
    label: 'Expirado',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
  },
  revoked: {
    label: 'Revogado',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700',
  },
}

function refLabel(refKind: string, refId: string): string {
  const kindMap: Record<string, string> = {
    product: 'Produto',
    benefit: 'Beneficio',
  }
  return `${kindMap[refKind] ?? refKind} #${refId.slice(0, 8)}`
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

function relativeExpiry(endsAt: Date | null): string {
  if (!endsAt) return 'Sem expiracao'
  const now = Date.now()
  const target = new Date(endsAt).getTime()
  const diffMs = target - now
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' })

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))
    if (Math.abs(diffHours) < 1) {
      return rtf.format(Math.round(diffMs / (1000 * 60)), 'minute')
    }
    return rtf.format(diffHours, 'hour')
  }
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, 'day')
  const diffMonths = Math.round(diffDays / 30)
  if (Math.abs(diffMonths) < 12) return rtf.format(diffMonths, 'month')
  return rtf.format(Math.round(diffDays / 365), 'year')
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center"
      role="status"
      aria-label="Nenhum direito encontrado"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mb-3 text-muted-foreground/40"
        aria-hidden="true"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      <p className="text-sm text-muted-foreground">Nenhum direito originado desta transacao</p>
    </div>
  )
}

function EntitlementRow({ row }: { row: CustomerEntitlement }) {
  const kind = KIND_BADGE[row.kind] ?? KIND_BADGE.other
  const status = STATUS_BADGE[row.status] ?? STATUS_BADGE.expired

  return (
    <li className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto_auto_auto] items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-card px-4 py-3">
      {/* Kind */}
      <span className={kind.classes} aria-label={`Tipo: ${kind.label}`}>
        {kind.label}
      </span>

      {/* Nome de referência */}
      <span className="min-w-0 truncate text-sm text-foreground">
        {refLabel(row.refKind, row.refId)}
      </span>

      {/* Status */}
      <span className={status.classes} aria-label={`Status: ${status.label}`}>
        {status.label}
      </span>

      {/* Inicio */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        Início: {formatDate(row.startedAt)}
      </span>

      {/* Expiracao relativa */}
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {relativeExpiry(row.endsAt)}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface TabEntitlementsProps {
  transactionId: string
}

export async function TabEntitlements({ transactionId }: TabEntitlementsProps) {
  const rows = await db
    .select()
    .from(customerEntitlement)
    .where(eq(customerEntitlement.originTransactionId, transactionId))
    .orderBy(desc(customerEntitlement.createdAt))
    .limit(100)

  if (rows.length === 0) {
    return <EmptyState />
  }

  const now = new Date()
  const ativos: CustomerEntitlement[] = []
  const historico: CustomerEntitlement[] = []

  for (const row of rows) {
    const notRevoked = row.status !== 'revoked' && row.status !== 'expired'
    const notExpiredByDate = row.endsAt === null || new Date(row.endsAt) > now
    if (notRevoked && notExpiredByDate) {
      ativos.push(row)
    } else {
      historico.push(row)
    }
  }

  return (
    <div className="space-y-6">
      {/* Ativos */}
      <section aria-label="Direitos ativos originados desta transacao">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Ativos ({ativos.length})
        </h3>
        {ativos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum direito ativo.</p>
        ) : (
          <ul className="space-y-2" aria-label="Lista de direitos ativos">
            {ativos.map((row) => (
              <EntitlementRow key={row.id} row={row} />
            ))}
          </ul>
        )}
      </section>

      {/* Historico */}
      {historico.length > 0 && (
        <section aria-label="Historico de direitos desta transacao">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2 select-none">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-open:rotate-90"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Historico ({historico.length})
              </h3>
            </summary>
            <ul className="mt-2 space-y-2" aria-label="Historico de direitos">
              {historico.map((row) => (
                <EntitlementRow key={row.id} row={row} />
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  )
}
