'use client'

/**
 * ExecutionTimeline — Timeline de logs por nó de uma execução de automação.
 * Client Component (accordion/collapser interativo).
 * T-11-12: docs/20-domain/15-automation.md §11
 *
 * Para cada log em automation_execution_log:
 *   - Ícone por node_kind
 *   - Badge de status (ok → verde, skipped → cinza, error → vermelho)
 *   - executed_at formatado
 *   - Seção colapsável Input / Output JSON
 *   - Se status='error': mensagem em vermelho
 */

import { useState } from 'react'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface ExecutionLogItem {
  id: string
  nodeId: string
  nodeKind: string
  status: string
  input: unknown
  output: unknown
  error: string | null
  executedAt: Date | string
}

interface Props {
  logs: ExecutionLogItem[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(date))
}

function nodeKindLabel(kind: string): string {
  switch (kind) {
    case 'trigger':
      return 'Gatilho'
    case 'condition':
      return 'Condição'
    case 'action':
      return 'Ação'
    default:
      return kind
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'ok':
      return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
    case 'skipped':
      return 'bg-muted text-muted-foreground'
    case 'error':
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ok':
      return 'ok'
    case 'skipped':
      return 'ignorado'
    case 'error':
      return 'erro'
    default:
      return status
  }
}

// ---------------------------------------------------------------------------
// Ícones SVG por node_kind
// ---------------------------------------------------------------------------

function TriggerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Raio / lightning bolt */}
      <path
        fillRule="evenodd"
        d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ConditionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Diamante */}
      <path
        fillRule="evenodd"
        d="M10 2l8 8-8 8-8-8 8-8zm0 2.828L4.828 10 10 15.172 15.172 10 10 4.828z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function ActionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Engrenagem */}
      <path
        fillRule="evenodd"
        d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
        clipRule="evenodd"
      />
    </svg>
  )
}

function NodeIcon({ kind }: { kind: string }) {
  switch (kind) {
    case 'trigger':
      return <TriggerIcon />
    case 'condition':
      return <ConditionIcon />
    case 'action':
      return <ActionIcon />
    default:
      return <ActionIcon />
  }
}

function nodeIconBg(kind: string): string {
  switch (kind) {
    case 'trigger':
      return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
    case 'condition':
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
    case 'action':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// LogEntry — item individual da timeline
// ---------------------------------------------------------------------------

function LogEntry({ log, isLast }: { log: ExecutionLogItem; isLast: boolean }) {
  const [open, setOpen] = useState(false)

  const hasPayload =
    (log.input !== null && log.input !== undefined) ||
    (log.output !== null && log.output !== undefined)

  return (
    <li className="relative flex gap-4">
      {/* Linha conectora vertical */}
      {!isLast && (
        <div
          className="absolute left-5 top-10 bottom-0 w-px bg-border"
          aria-hidden="true"
        />
      )}

      {/* Ícone do nó */}
      <div
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${nodeIconBg(log.nodeKind)}`}
        aria-label={nodeKindLabel(log.nodeKind)}
      >
        <NodeIcon kind={log.nodeKind} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0 pb-8">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {nodeKindLabel(log.nodeKind)}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(log.status)}`}
          >
            {statusLabel(log.status)}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums ml-auto">
            {formatDate(log.executedAt)}
          </span>
        </div>

        <p className="mt-0.5 text-xs text-muted-foreground font-mono">
          {log.nodeId.slice(0, 8)}...
        </p>

        {/* Mensagem de erro */}
        {log.status === 'error' && log.error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400 font-mono bg-red-50 dark:bg-red-900/10 rounded-md px-3 py-2">
            {log.error}
          </p>
        )}

        {/* Toggle Input / Output */}
        {hasPayload && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors"
              aria-expanded={open}
              aria-controls={`log-payload-${log.id}`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              {open ? 'Ocultar' : 'Ver'} Input / Output
            </button>

            {open && (
              <div
                id={`log-payload-${log.id}`}
                className="mt-3 space-y-3"
                role="region"
                aria-label="Payload do nó"
              >
                {log.input !== null && log.input !== undefined && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Input</p>
                    <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-auto max-h-64 border border-border text-foreground">
                      {JSON.stringify(log.input, null, 2)}
                    </pre>
                  </div>
                )}
                {log.output !== null && log.output !== undefined && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Output</p>
                    <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-auto max-h-64 border border-border text-foreground">
                      {JSON.stringify(log.output, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// ExecutionTimeline
// ---------------------------------------------------------------------------

export function ExecutionTimeline({ logs }: Props) {
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhum log registrado.</p>
      </div>
    )
  }

  return (
    <ol
      className="ml-1"
      aria-label="Timeline de execução dos nós"
    >
      {logs.map((log, i) => (
        <LogEntry key={log.id} log={log} isLast={i === logs.length - 1} />
      ))}
    </ol>
  )
}
