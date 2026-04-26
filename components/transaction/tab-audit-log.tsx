/**
 * TabAuditLog — Server Component
 * T-12-31: Tab Auditoria na tela de detalhe de transação.
 *
 * Lista audit_log WHERE resource_kind='transaction' AND resource_id=transactionId.
 * Timeline simples: ator, ação humanizada, timestamp, diff expansível.
 * Padrão visual reutilizado de components/contact/tab-audit.tsx.
 *
 * Ownership: components/transaction/tab-audit-log.tsx
 * Spec: docs/70-ux/07-screen-transaction-detail.md §7
 * Schema: lib/db/schema/audit.ts
 */

import { History } from 'lucide-react'
import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { auditLog } from '@/lib/db/schema/audit'
import { userAccount } from '@/lib/db/schema/organization'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabAuditLogProps {
  transactionId: string
}

type AuditRow = {
  id: string
  actorEmail: string | null
  actorName: string | null
  actorSystem: string | null
  actionKind: string
  resourceKind: string
  resourceId: string | null
  before: Record<string, unknown>
  after: Record<string, unknown>
  createdAt: Date
}

// ---------------------------------------------------------------------------
// Action kind → label pt-BR
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  create: 'criou',
  update: 'atualizou',
  delete: 'excluiu',
  merge: 'mesclou',
  unmerge: 'desmergeou',
  refund: 'processou reembolso em',
  status_change: 'alterou status de',
  impersonate: 'acessou como',
  other: 'realizou acao em',
}

function actionLabel(kind: string): string {
  return ACTION_LABELS[kind] ?? kind.replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function actorDisplay(row: AuditRow): string {
  if (row.actorName) return row.actorName
  if (row.actorEmail) return row.actorEmail
  if (row.actorSystem) return row.actorSystem
  return 'Sistema'
}

function computeDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> | null {
  const isEmpty = (o: Record<string, unknown>) => Object.keys(o).length === 0
  if (isEmpty(before) && isEmpty(after)) return null

  if (!isEmpty(before) && !isEmpty(after)) {
    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
    const diff: Record<string, unknown> = {}
    for (const key of allKeys) {
      const bVal = before[key]
      const aVal = after[key]
      if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
        diff[key] = { de: bVal ?? null, para: aVal ?? null }
      }
    }
    return Object.keys(diff).length > 0 ? diff : { antes: before, depois: after }
  }

  if (!isEmpty(after)) return { depois: after }
  return { antes: before }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16"
      aria-label="Nenhuma alteracao registrada"
    >
      <History className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">Nenhuma alteracao registrada</p>
    </div>
  )
}

function DiffDetails({ diff }: { diff: Record<string, unknown> }) {
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
        Ver alteracoes
      </summary>
      <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">
        {JSON.stringify(diff, null, 2)}
      </pre>
    </details>
  )
}

function TimelineItem({ row, isLast }: { row: AuditRow; isLast: boolean }) {
  const diff = computeDiff(row.before, row.after)
  const actor = actorDisplay(row)
  const verb = actionLabel(row.actionKind)

  return (
    <li className="relative flex gap-4">
      {!isLast && (
        <span
          className="absolute left-[10px] top-4 h-full w-px bg-border"
          aria-hidden="true"
        />
      )}
      <span
        className="relative mt-1.5 ml-3 flex h-2 w-2 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <span className="block h-2 w-2 rounded-full bg-muted-foreground/50" />
      </span>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{actor}</span>
          <span className="text-sm text-muted-foreground">{verb}</span>
          <span className="text-sm text-muted-foreground capitalize">
            {row.resourceKind}
          </span>
          {row.resourceId && (
            <span className="font-mono text-xs text-muted-foreground/60">
              #{row.resourceId.slice(0, 8)}
            </span>
          )}
        </div>
        <time
          dateTime={row.createdAt.toISOString()}
          className="text-xs text-muted-foreground/60"
        >
          {formatDateTime(row.createdAt)}
        </time>
        {diff && <DiffDetails diff={diff} />}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function TabAuditLog({ transactionId }: TabAuditLogProps) {
  const rows = await db
    .select({
      id: auditLog.id,
      actorEmail: userAccount.email,
      actorName: userAccount.fullName,
      actorSystem: auditLog.actorSystem,
      actionKind: auditLog.actionKind,
      resourceKind: auditLog.resourceKind,
      resourceId: auditLog.resourceId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog)
    .leftJoin(userAccount, eq(auditLog.actorUserId, userAccount.id))
    .where(
      and(
        eq(auditLog.resourceKind, 'transaction'),
        eq(auditLog.resourceId, transactionId),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(200)

  if (rows.length === 0) {
    return <EmptyState />
  }

  return (
    <section aria-label="Historico de alteracoes da transacao">
      <ol className="list-none" aria-label="Timeline de alteracoes">
        {rows.map((row, index) => (
          <TimelineItem
            key={row.id}
            row={row as AuditRow}
            isLast={index === rows.length - 1}
          />
        ))}
      </ol>
    </section>
  )
}
