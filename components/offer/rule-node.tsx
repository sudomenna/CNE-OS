'use client'

/**
 * RuleNode — Card draggable representando uma regra atômica (offer_condition_rule).
 *
 * Mostra `kind` como badge e resumo dos params.
 * Usa @dnd-kit/sortable para ser arrastável dentro/entre grupos.
 *
 * T-6-19 — spec: docs/20-domain/10-offer-engine.md §3.4, §3.4.1
 */

import * as React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { OfferRuleKind } from '@/lib/domain/offer/rule-params-schema'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleNodeData {
  id: string
  kind: OfferRuleKind
  params: Record<string, unknown>
  createdAt?: string
}

interface RuleNodeProps {
  rule: RuleNodeData
}

// ---------------------------------------------------------------------------
// Kind labels
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<OfferRuleKind, string> = {
  date_range: 'Intervalo de datas',
  sales_count_reached: 'Limite de vendas',
  campaign: 'Campanha',
  channel: 'Canal',
  creative: 'Criativo',
  internal_use: 'Uso interno',
}

const KIND_BADGE_CLASS: Record<OfferRuleKind, string> = {
  date_range: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  sales_count_reached: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  campaign: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  channel: 'bg-teal-100 text-teal-700 hover:bg-teal-100',
  creative: 'bg-pink-100 text-pink-700 hover:bg-pink-100',
  internal_use: 'bg-muted text-muted-foreground hover:bg-muted',
}

// ---------------------------------------------------------------------------
// Param summary helpers
// ---------------------------------------------------------------------------

function buildParamSummary(kind: OfferRuleKind, params: Record<string, unknown>): string {
  switch (kind) {
    case 'date_range': {
      const start = typeof params['start_at'] === 'string' ? params['start_at'].slice(0, 10) : '?'
      const end = typeof params['end_at'] === 'string' ? params['end_at'].slice(0, 10) : '?'
      return `${start} → ${end}`
    }
    case 'sales_count_reached': {
      const max = params['max']
      return `máx. ${max ?? '?'} vendas`
    }
    case 'campaign': {
      const ids = params['campaign_ids']
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.length === 1 ? `1 campanha` : `${ids.length} campanhas`
      }
      return '— sem campanhas'
    }
    case 'channel': {
      const channels = params['channels']
      if (Array.isArray(channels) && channels.length > 0) {
        return channels.join(', ')
      }
      return '— sem canais'
    }
    case 'creative': {
      const ids = params['creative_ids']
      if (Array.isArray(ids) && ids.length > 0) {
        return ids.length === 1 ? `1 criativo` : `${ids.length} criativos`
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

export function RuleNode({ rule }: RuleNodeProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rule.id, data: { type: 'rule', rule } })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const summary = buildParamSummary(rule.kind, rule.params)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm select-none"
      aria-label={`Regra: ${KIND_LABELS[rule.kind]}, ${summary}`}
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
        className={KIND_BADGE_CLASS[rule.kind] ?? 'bg-muted text-muted-foreground'}
      >
        {KIND_LABELS[rule.kind]}
      </Badge>

      {/* Summary */}
      <span className="flex-1 truncate text-muted-foreground text-xs">{summary}</span>
    </div>
  )
}
