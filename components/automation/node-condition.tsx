'use client'

/**
 * NodeCondition — Custom react-flow node para kind='condition'.
 * Exibe ícone de diamante + label.
 * Dois handles de saída: "Sim" (verde, direita) e "Não" (vermelho, esquerda).
 * T-11-11 — spec: docs/20-domain/15-automation.md §7 condition DSL
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'

// ---------------------------------------------------------------------------
// NodeData
// ---------------------------------------------------------------------------

export interface ConditionNodeData {
  label?: string | null
  selected?: boolean
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const NodeCondition = memo(function NodeCondition({
  data,
  selected,
}: NodeProps<ConditionNodeData>) {
  return (
    <div
      className={[
        'rounded-lg border-2 bg-card shadow-sm min-w-[160px] max-w-[220px]',
        selected ? 'border-primary' : 'border-violet-400',
      ].join(' ')}
      role="group"
      aria-label={`Nó condição: ${data.label ?? 'Condição'}`}
    >
      {/* Input handle — top center */}
      <Handle
        type="target"
        position={Position.Top}
        id="in"
        className="!h-3 !w-3 !border-2 !border-violet-400 !bg-background"
        aria-label="Entrada"
      />

      {/* Header */}
      <div className="flex items-center gap-2 rounded-t-md bg-violet-50 px-3 py-2">
        {/* Diamond icon */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-violet-600"
        >
          <polygon points="12 2 22 12 12 22 2 12" />
        </svg>
        <span className="text-xs font-semibold uppercase tracking-wide text-violet-700">
          Condição
        </span>
      </div>
      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-sm font-medium text-foreground truncate">
          {data.label ?? 'Definir condição'}
        </p>
      </div>

      {/* True handle — right (Sim) */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-background"
        aria-label="Saída verdadeira (Sim)"
      />
      {/* Label Sim */}
      <span
        className="absolute right-[-26px] top-1/2 -translate-y-1/2 text-[10px] font-semibold text-emerald-600"
        aria-hidden="true"
      >
        Sim
      </span>

      {/* False handle — left (Não) */}
      <Handle
        type="source"
        position={Position.Left}
        id="false"
        className="!h-3 !w-3 !border-2 !border-red-500 !bg-background"
        aria-label="Saída falsa (Não)"
      />
      {/* Label Não */}
      <span
        className="absolute left-[-26px] top-1/2 -translate-y-1/2 text-[10px] font-semibold text-red-600"
        aria-hidden="true"
      >
        Não
      </span>
    </div>
  )
})
