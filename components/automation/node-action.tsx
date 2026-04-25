'use client'

/**
 * NodeAction — Custom react-flow node para kind='action'.
 * Exibe ícone de engrenagem + kind da action.
 * Handle de entrada (cima) e saída (embaixo).
 * T-11-11 — spec: docs/20-domain/15-automation.md §7 actions
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

// ---------------------------------------------------------------------------
// Labels legíveis para cada action kind
// ---------------------------------------------------------------------------

const ACTION_LABELS: Record<string, string> = {
  apply_tag: 'Aplicar Tag',
  move_stage: 'Mover Estágio',
  open_ticket: 'Abrir Ticket',
  notify_user: 'Notificar Usuário',
  emit_timeline_event: 'Emitir Evento',
  send_external: 'Enviar Externamente',
}

// ---------------------------------------------------------------------------
// NodeData
// ---------------------------------------------------------------------------

export interface ActionNodeData {
  label?: string | null
  actionKind?: string | null
  selected?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NodeAction = memo(function NodeAction({ data, selected }: NodeProps<ActionNodeData>) {
  const kindLabel = data.actionKind ? (ACTION_LABELS[data.actionKind] ?? data.actionKind) : 'Selecionar ação'

  return (
    <div
      className={[
        'rounded-lg border-2 bg-card shadow-sm min-w-[160px] max-w-[220px]',
        selected ? 'border-primary' : 'border-sky-400',
      ].join(' ')}
      role="group"
      aria-label={`Nó ação: ${kindLabel}`}
    >
      {/* Input handle — top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!h-3 !w-3 !border-2 !border-sky-400 !bg-background"
        aria-label="Entrada"
      />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-md bg-sky-50 px-3 py-2">
        {/* Gear icon */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-sky-600"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wide text-sky-700">
          Ação
        </span>
      </div>
      {/* Body */}
      <div className="px-3 py-2">
        {data.label ? (
          <p className="text-sm font-medium text-foreground truncate">{data.label}</p>
        ) : null}
        <p className="text-xs text-muted-foreground truncate">{kindLabel}</p>
      </div>

      {/* Output handle — bottom center */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="out"
        className="!h-3 !w-3 !border-2 !border-sky-400 !bg-background"
        aria-label="Saída"
      />
    </div>
  )
})
