/**
 * TabEntitlements — Server Component
 * Exibe os direitos (customer_entitlement) de um contato divididos em
 * "Ativos" e "Histórico".
 *
 * Ownership: components/contact/ (T-12-13)
 * Spec: docs/20-domain/02-contact-identity.md §T-1-15
 * Schema: lib/db/schema/entitlement.ts
 */

import Link from 'next/link'
import type { Route } from 'next'
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

/** Badge classes por entitlement_kind */
const KIND_BADGE: Record<EntitlementKind, { label: string; classes: string }> = {
  product_access: {
    label: 'Acesso',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700',
  },
  benefit: {
    label: 'Benefício',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700',
  },
  other: {
    label: 'Outro',
    classes:
      'inline-flex items-center rounded-full border border-transparent bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground',
  },
}

/** Badge classes por entitlement_status */
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

/** Referência humana: refKind + 8 chars do refId */
function refLabel(refKind: string, refId: string): string {
  const kindMap: Record<string, string> = {
    product: 'Produto',
    benefit: 'Benefício',
  }
  const kindName = kindMap[refKind] ?? refKind
  return `${kindName} #${refId.slice(0, 8)}`
}

/**
 * Data de expiração relativa em pt-BR usando Intl.RelativeTimeFormat.
 * Sem dependência externa.
 */
function relativeExpiry(endsAt: Date | null): string {
  if (!endsAt) return 'Sem expiração'

  const now = Date.now()
  const target = new Date(endsAt).getTime()
  const diffMs = target - now
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'always' })

  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60))
    if (Math.abs(diffHours) < 1) {
      const diffMinutes = Math.round(diffMs / (1000 * 60))
      return rtf.format(diffMinutes, 'minute')
    }
    return rtf.format(diffHours, 'hour')
  }

  if (Math.abs(diffDays) < 30) {
    return rtf.format(diffDays, 'day')
  }

  const diffMonths = Math.round(diffDays / 30)
  if (Math.abs(diffMonths) < 12) {
    return rtf.format(diffMonths, 'month')
  }

  const diffYears = Math.round(diffDays / 365)
  return rtf.format(diffYears, 'year')
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

interface EntitlementRowProps {
  row: CustomerEntitlement
}

function EntitlementRow({ row }: EntitlementRowProps) {
  const kind = KIND_BADGE[row.kind] ?? KIND_BADGE.other
  const status = STATUS_BADGE[row.status] ?? STATUS_BADGE.expired

  return (
    <li className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-x-4 rounded-lg border border-border bg-card px-4 py-3">
      {/* Kind badge */}
      <span className={kind.classes} aria-label={`Tipo: ${kind.label}`}>
        {kind.label}
      </span>

      {/* Nome de referência */}
      <span className="min-w-0 truncate text-sm text-foreground">
        {refLabel(row.refKind, row.refId)}
      </span>

      {/* Expiração relativa */}
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {relativeExpiry(row.endsAt)}
      </span>

      {/* Status badge */}
      <span className={status.classes} aria-label={`Status: ${status.label}`}>
        {status.label}
      </span>

      {/* Origem (transação) */}
      <span className="text-xs text-muted-foreground">
        {row.originTransactionId ? (
          <Link
            href={`/transactions/${row.originTransactionId}` as Route}
            className="font-mono hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label={`Ver transação ${row.originTransactionId.slice(0, 8)}`}
          >
            #{row.originTransactionId.slice(0, 8)}
          </Link>
        ) : (
          <span aria-label="Sem transação de origem">—</span>
        )}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Section heading
// ---------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center"
      role="status"
      aria-label="Nenhum direito encontrado"
    >
      {/* Shield icon — inline SVG para zero dependência extra */}
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
      <p className="text-sm text-muted-foreground">Nenhum direito encontrado</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export — Server Component
// ---------------------------------------------------------------------------

interface TabEntitlementsProps {
  contactId: string
}

export async function TabEntitlements({ contactId }: TabEntitlementsProps) {
  // -------------------------------------------------------------------------
  // Fetch: customer_entitlement WHERE contact_id = contactId ORDER BY created_at DESC LIMIT 100
  // -------------------------------------------------------------------------
  const now = new Date()

  const rows = await db
    .select()
    .from(customerEntitlement)
    .where(eq(customerEntitlement.contactId, contactId))
    .orderBy(desc(customerEntitlement.createdAt))
    .limit(100)

  // -------------------------------------------------------------------------
  // Partition: Ativos vs Histórico
  //
  // "Ativo" = status IN ('active', 'suspended')
  //           AND (ends_at IS NULL OR ends_at > now())
  //
  // O campo status='active' cobre o happy path; incluímos 'suspended' porque
  // o acesso ainda não foi revogado definitivamente.
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (rows.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-6">
      {/* Seção: Ativos */}
      <section aria-label="Direitos ativos">
        <SectionHeading>Ativos ({ativos.length})</SectionHeading>
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

      {/* Seção: Histórico — colapsável */}
      {historico.length > 0 && (
        <section aria-label="Histórico de direitos">
          <details className="group">
            <summary
              className="flex cursor-pointer list-none items-center gap-2 select-none"
              aria-expanded="false"
            >
              <SectionHeading>
                <span className="flex items-center gap-1">
                  {/* chevron */}
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
                  Histórico ({historico.length})
                </span>
              </SectionHeading>
            </summary>

            <ul className="mt-2 space-y-2" aria-label="Lista de histórico de direitos">
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
