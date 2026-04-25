'use client'

/**
 * NodeTrigger — Custom react-flow node para kind='trigger'.
 * Exibe ícone de raio + kind do trigger.
 * Handle de saída único (embaixo).
 * T-11-11 — spec: docs/20-domain/15-automation.md §7 triggers
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

// ---------------------------------------------------------------------------
// Labels legíveis para cada trigger kind
// ---------------------------------------------------------------------------

const TRIGGER_LABELS: Record<string, string> = {
  funnel_enter: 'Entrou no Funil',
  funnel_stage_change: 'Mudou de Estágio',
  new_message: 'Nova Mensagem',
  checkout_abandoned: 'Checkout Abandonado',
  sale_approved: 'Venda Aprovada',
  ticket_opened: 'Ticket Aberto',
  brevo_event: 'Evento Brevo',
  integration_event: 'Evento de Integração',
}

// ---------------------------------------------------------------------------
// NodeData
// ---------------------------------------------------------------------------

export interface TriggerNodeData {
  label?: string | null
  triggerKind?: string | null
  selected?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NodeTrigger = memo(function NodeTrigger({ data, selected }: NodeProps<TriggerNodeData>) {
  const kindLabel = data.triggerKind ? (TRIGGER_LABELS[data.triggerKind] ?? data.triggerKind) : 'Selecionar gatilho'

  return (
    <div
      className={[
        'rounded-lg border-2 bg-card shadow-sm min-w-[160px] max-w-[220px]',
        selected ? 'border-primary' : 'border-amber-400',
      ].join(' ')}
      role="group"
      aria-label={`Nó gatilho: ${kindLabel}`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-md bg-amber-50 px-3 py-2">
        {/* Lightning icon */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-amber-600"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Gatilho
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
        className="!h-3 !w-3 !border-2 !border-amber-400 !bg-background"
        aria-label="Saída"
      />
    </div>
  )
})
