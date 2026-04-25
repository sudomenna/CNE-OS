/**
 * /automations/[id]/executions — Histórico de execuções de um fluxo.
 * Server Component.
 * T-11-12: docs/20-domain/15-automation.md §11
 *
 * - Tabela paginada de execuções (20 por página)
 * - Badge de status colorido por estado
 * - Botão "Reenfileirar" inline para execuções `failed`
 * - Link para detalhe de cada execução
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Route } from 'next'
import { listExecutions } from '@/app/(app)/automations/actions'
import { db } from '@/lib/db/client'
import { automationFlow } from '@/lib/db/schema/automation'
import { and, eq, isNull } from 'drizzle-orm'
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
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return { title: `Execuções do Fluxo ${id.slice(0, 8)}... — CNE-OS` }
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default async function AutomationExecutionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const { id: flowId } = await params
  const { page: pageStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr ?? '1', 10) || 1)

  // Carregar dados do fluxo para o breadcrumb
  const [flow] = await db
    .select({ id: automationFlow.id, name: automationFlow.name })
    .from(automationFlow)
    .where(and(eq(automationFlow.id, flowId), isNull(automationFlow.deletedAt)))
    .limit(1)

  if (!flow) notFound()

  const result = await listExecutions({ flowId, page, pageSize: 20 })

  if (!result.ok) {
    throw new Error(result.error.message)
  }

  const executions = result.data

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
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
              className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded truncate max-w-[160px] inline-block"
            >
              {flow.name}
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40">/</li>
          <li className="font-medium text-foreground" aria-current="page">
            Execuções
          </li>
        </ol>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground">
          Execuções — {flow.name}
        </h1>
      </div>

      {/* Tabela */}
      {executions.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/50 p-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhuma execução registrada para este fluxo.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table
            className="w-full text-sm"
            role="table"
            aria-label="Histórico de execuções"
          >
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  ID
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Subject
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
                  Disparado em
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Finalizado em
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Tentativas
                </th>
                <th scope="col" className="px-4 py-3 w-10">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {executions.map((exec) => (
                <tr key={exec.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/automations/${flowId}/executions/${exec.id}` as Route}
                      className="font-mono text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {exec.id.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {exec.subjectKind ? (
                      <span>
                        <span className="font-medium text-foreground">{exec.subjectKind}</span>
                        {exec.subjectId && (
                          <span className="ml-1 font-mono">/ {exec.subjectId.slice(0, 8)}...</span>
                        )}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(exec.status as ExecStatus)}`}
                    >
                      {STATUS_LABEL[exec.status as ExecStatus] ?? exec.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                    {formatDate(exec.triggeredAt)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                    {formatDate(exec.finishedAt)}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                    {exec.retryCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {exec.status === 'failed' && (
                      <ReprocessButton executionId={exec.id} flowId={flowId} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Página {page}
        </p>
        <div className="flex items-center gap-2">
          {page > 1 && (
            <Link
              href={`/automations/${flowId}/executions?page=${page - 1}` as Route}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Anterior
            </Link>
          )}
          {executions.length === 20 && (
            <Link
              href={`/automations/${flowId}/executions?page=${page + 1}` as Route}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Próxima
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
