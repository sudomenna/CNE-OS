/**
 * TabTimeline — Server Component
 * T-12-31: Tab Timeline na tela de detalhe de transação.
 *
 * Lista timeline_event WHERE subject_kind='transaction' AND subject_id=transactionId,
 * ou WHERE contact_id do contact associado à transação e kinds relacionados a vendas.
 *
 * Verifica as colunas reais do schema (subject_kind / subject_id).
 *
 * Ownership: components/transaction/tab-timeline.tsx
 * Spec: docs/70-ux/07-screen-transaction-detail.md §8
 * Schema: lib/db/schema/timeline.ts
 */

import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { timelineEvent } from '@/lib/db/schema/timeline'
import { userAccount } from '@/lib/db/schema/organization'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabTimelineProps {
  transactionId: string
}

type TimelineRow = {
  id: string
  kind: string
  source: string
  actorUserName: string | null
  actorUserEmail: string | null
  actorSystem: string | null
  subjectKind: string | null
  subjectId: string | null
  payload: Record<string, unknown>
  occurredAt: Date
}

// ---------------------------------------------------------------------------
// Kind → label pt-BR
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<string, string> = {
  sale_approved: 'Venda aprovada',
  sale_refused: 'Venda recusada',
  sale_refunded: 'Reembolso processado',
  sale_chargeback: 'Chargeback registrado',
  entitlement_granted: 'Direito concedido',
  entitlement_revoked: 'Direito revogado',
  entitlement_expired: 'Direito expirado',
  subscription_created: 'Assinatura criada',
  subscription_cancelled: 'Assinatura cancelada',
  subscription_renewed: 'Assinatura renovada',
  installment_paid: 'Parcela paga',
  installment_overdue: 'Parcela em atraso',
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, ' ')
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

function actorDisplay(row: TimelineRow): string {
  if (row.actorUserName) return row.actorUserName
  if (row.actorUserEmail) return row.actorUserEmail
  if (row.actorSystem) return row.actorSystem
  return 'Sistema'
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16"
      role="status"
      aria-label="Nenhum evento de timeline encontrado"
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
        className="text-muted-foreground/40"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <p className="text-sm text-muted-foreground">Nenhum evento de timeline encontrado</p>
    </div>
  )
}

function PayloadSummary({ payload }: { payload: Record<string, unknown> }) {
  if (Object.keys(payload).length === 0) return null
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
        Ver payload
      </summary>
      <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </details>
  )
}

function TimelineItem({ row, isLast }: { row: TimelineRow; isLast: boolean }) {
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
        <span className="block h-2 w-2 rounded-full bg-primary/50" />
      </span>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{kindLabel(row.kind)}</span>
          <span className="text-xs text-muted-foreground">por {actorDisplay(row)}</span>
        </div>
        <time
          dateTime={row.occurredAt.toISOString()}
          className="text-xs text-muted-foreground/60"
        >
          {formatDateTime(row.occurredAt)}
        </time>
        <PayloadSummary payload={row.payload} />
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function TabTimeline({ transactionId }: TabTimelineProps) {
  // Busca eventos cujo subject_kind='transaction' e subject_id=transactionId.
  // O schema timeline_event usa subject_kind / subject_id (campos nullable).
  const rows = await db
    .select({
      id: timelineEvent.id,
      kind: timelineEvent.kind,
      source: timelineEvent.source,
      actorUserName: userAccount.fullName,
      actorUserEmail: userAccount.email,
      actorSystem: timelineEvent.actorSystem,
      subjectKind: timelineEvent.subjectKind,
      subjectId: timelineEvent.subjectId,
      payload: timelineEvent.payload,
      occurredAt: timelineEvent.occurredAt,
    })
    .from(timelineEvent)
    .leftJoin(userAccount, eq(timelineEvent.actorUserId, userAccount.id))
    .where(
      and(
        eq(timelineEvent.subjectKind, 'transaction'),
        eq(timelineEvent.subjectId, transactionId),
      ),
    )
    .orderBy(desc(timelineEvent.occurredAt))
    .limit(200)

  if (rows.length === 0) {
    return <EmptyState />
  }

  return (
    <section aria-label="Timeline de eventos da transacao">
      <ol className="list-none" aria-label="Timeline de eventos">
        {rows.map((row, index) => (
          <TimelineItem
            key={row.id}
            row={row as TimelineRow}
            isLast={index === rows.length - 1}
          />
        ))}
      </ol>
    </section>
  )
}
