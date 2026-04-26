'use client'

/**
 * RuleNodeDisplay — Card draggable de regra atômica para uso no RuleTreeEditor.
 *
 * Versão de exibição compacta (somente leitura) de um nó folha.
 * Drag-drop via @dnd-kit/sortable.
 *
 * Para edição inline, use LeafNodeEditor dentro de rule-tree-editor.tsx.
 *
 * T-13-17 — spec: docs/70-ux/06-screen-offer-builder.md §3.3
 */

import * as React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { LeafNode, LeafKind } from './rule-tree-editor'

// ---------------------------------------------------------------------------
// Kind metadata
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<LeafKind, string> = {
  date_range: 'Intervalo de datas',
  sales_count_reached: 'Limite de vendas',
  campaign: 'Campanha',
  channel: 'Canal',
  creative: 'Criativo',
  internal_use: 'Uso interno',
}

const KIND_BADGE_CLASS: Record<LeafKind, string> = {
  date_range: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  sales_count_reached: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  campaign: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  channel: 'bg-teal-100 text-teal-700 hover:bg-teal-100',
  creative: 'bg-pink-100 text-pink-700 hover:bg-pink-100',
  internal_use: 'bg-muted text-muted-foreground hover:bg-muted',
}

// ---------------------------------------------------------------------------
// Param summary
// ---------------------------------------------------------------------------

function buildParamSummary(kind: LeafKind, params: Record<string, unknown>): string {
  switch (kind) {
    case 'date_range': {
      const start = typeof params['start_at'] === 'string' ? params['start_at'].slice(0, 10) : '?'
      const end = typeof params['end_at'] === 'string' ? params['end_at'].slice(0, 10) : '?'
      return `${start} → ${end}`
    }
    case 'sales_count_reached': {
      const max = params['max']
      return max !== undefined ? `máx. ${max} vendas` : '— sem limite'
    }
    case 'campaign': {
      const ids = params['campaign_ids']
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.length === 1 ? '1 campanha' : `${ids.length} campanhas`
      }
      return '— sem campanhas'
    }
    case 'channel': {
      const channels = params['channels']
      if (Array.isArray(channels) && channels.length > 0) {
        return (channels as string[]).join(', ')
      }
      return '— sem canais'
    }
    case 'creative': {
      const ids = params['creative_ids']
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.length === 1 ? '1 criativo' : `${ids.length} criativos`
      }
      return '— sem criativos'
    }
    case 'internal_use':
      return 'uso interno'
    default:
      return ''
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface RuleNodeDisplayProps {
  leaf: LeafNode
}

export function RuleNodeDisplay({ leaf }: RuleNodeDisplayProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: leaf.id, data: { type: 'leaf' } })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const summary = buildParamSummary(leaf.kind, leaf.params)
  const hasErrors = Object.keys(leaf.errors).length > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-sm select-none',
        hasErrors ? 'border-destructive/60' : 'border-border',
      ].join(' ')}
      aria-label={`Regra: ${KIND_LABELS[leaf.kind]}, ${summary}`}
      aria-invalid={hasErrors}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        aria-label="Arrastar regra"
        tabIndex={0}
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>

      {/* Kind badge */}
      <Badge
        variant="secondary"
        className={KIND_BADGE_CLASS[leaf.kind] ?? 'bg-muted text-muted-foreground'}
      >
        {KIND_LABELS[leaf.kind]}
      </Badge>

      {/* Summary */}
      <span className="flex-1 truncate text-muted-foreground text-xs">{summary}</span>

      {/* Error indicator */}
      {hasErrors && (
        <AlertCircle
          className="h-3.5 w-3.5 shrink-0 text-destructive"
          aria-label="Esta regra possui erros de validação"
        />
      )}
    </div>
  )
}
