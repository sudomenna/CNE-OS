/**
 * /automations/[id]/executions/[execId] — Detalhe de execução com log por nó.
 * Server Component.
 * T-11-12: docs/20-domain/15-automation.md §11
 *
 * - Header com flow name, status, subject, timestamps
 * - Card de erro + botão "Reenfileirar" se status='failed'
 * - ExecutionTimeline com log de cada nó
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { getExecution } from '@/app/(app)/automations/actions'
import { db } from '@/lib/db/client'
import { automationFlow } from '@/lib/db/schema/automation'
import { and, eq, isNull } from 'drizzle-orm'
import { ExecutionTimeline } from '@/components/automation/execution-timeline'
import { ReprocessButton } from '@/components/automation/reprocess-button'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ExecStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'

const STATUS_LABEL: Record<ExecStatus, string> = {
  pending: 'Pendente',
  running: 'Executando',
  succeeded: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
}

function statusBadgeClass(status: ExecStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-muted text-muted-foreground'
    case 'running':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse'
    case 'succeeded':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    case 'cancelled':
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(date))
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; execId: string }>
}) {
  const { execId } = await params
  return { title: `Execução ${execId.slice(0, 8)}... — CNE-OS` }
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default async function ExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string; execId: string }>
}) {
  const { id: flowId, execId } = await params

  // Carregar fluxo pai
  const [flow] = await db
    .select({ id: automationFlow.id, name: automationFlow.name })
    .from(automationFlow)
    .where(and(eq(automationFlow.id, flowId), isNull(automationFlow.deletedAt)))
    .limit(1)

  if (!flow) notFound()

  // Carregar execução com logs
  const result = await getExecution({ executionId: execId })

  if (!result.ok) {
    if (result.error.code === 'NOT_FOUND') notFound()
    throw new Error(result.error.message)
  }

  const execution = result.data

  const isFailed = execution.status === 'failed'

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex items-center gap-2 flex-wrap">
          <li>
            <Link
              href={'/automations' as Route}
              className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Automações
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40">/</li>
          <li>
            <Link
              href={`/automations/${flowId}` as Route}
              className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded truncate max-w-[140px] inline-block"
            >
              {flow.name}
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40">/</li>
          <li>
            <Link
              href={`/automations/${flowId}/executions` as Route}
              className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Execuções
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40">/</li>
          <li className="font-medium text-foreground font-mono" aria-current="page">
            {execId.slice(0, 8)}...
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-foreground">Execução</h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(execution.status as ExecStatus)}`}
              aria-label={`Status: ${STATUS_LABEL[execution.status as ExecStatus] ?? execution.status}`}
            >
              {STATUS_LABEL[execution.status as ExecStatus] ?? execution.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{execution.id}</p>
        </div>

        {isFailed && (
          <ReprocessButton executionId={execution.id} flowId={flowId} />
        )}
      </div>

      {/* Dados principais */}
      <section
        aria-labelledby="exec-info-heading"
        className="rounded-lg border border-border bg-card"
      >
        <h2
          id="exec-info-heading"
          className="px-6 py-4 text-sm font-semibold text-muted-foreground border-b border-border"
        >
          Dados da Execução
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 px-6 py-5">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Fluxo</dt>
            <dd className="mt-1 text-sm text-foreground">
              <Link
                href={`/automations/${flowId}` as Route}
                className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {flow.name}
              </Link>
            </dd>
          </div>
          {execution.subjectKind && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Subject</dt>
              <dd className="mt-1 text-sm text-foreground">
                <span className="font-medium">{execution.subjectKind}</span>
                {execution.subjectId && (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">
                    {execution.subjectId}
                  </span>
                )}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Disparado em</dt>
            <dd className="mt-1 text-sm text-foreground tabular-nums">
              {formatDate(execution.triggeredAt)}
            </dd>
          </div>
          {execution.startedAt && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Iniciado em</dt>
              <dd className="mt-1 text-sm text-foreground tabular-nums">
                {formatDate(execution.startedAt)}
              </dd>
            </div>
          )}
          {execution.finishedAt && (
            <div>
              <dt className="text-xs font-medium text-muted-foreground">Finalizado em</dt>
              <dd className="mt-1 text-sm text-foreground tabular-nums">
                {formatDate(execution.finishedAt)}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Tentativas</dt>
            <dd className="mt-1 text-sm text-foreground tabular-nums">
              {execution.retryCount}
            </dd>
          </div>
        </dl>
      </section>

      {/* Card de erro */}
      {isFailed && execution.error && (
        <section
          aria-labelledby="exec-error-heading"
          className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10"
        >
          <h2
            id="exec-error-heading"
            className="px-6 py-4 text-sm font-semibold text-red-700 dark:text-red-400 border-b border-red-200 dark:border-red-900/50 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Erro na Execução
          </h2>
          <div className="px-6 py-5 space-y-4">
            <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap break-words font-mono bg-red-100/50 dark:bg-red-900/20 rounded-md p-4">
              {execution.error}
            </pre>
            <ReprocessButton executionId={execution.id} flowId={flowId} />
          </div>
        </section>
      )}

      {/* Timeline de logs */}
      <section aria-labelledby="exec-timeline-heading">
        <h2
          id="exec-timeline-heading"
          className="text-lg font-semibold text-foreground mb-4"
        >
          Log de Execução ({execution.logs.length} {execution.logs.length === 1 ? 'nó' : 'nós'})
        </h2>
        {execution.logs.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhum log de nó registrado.</p>
          </div>
        ) : (
          <ExecutionTimeline logs={execution.logs} />
        )}
      </section>
    </div>
  )
}
