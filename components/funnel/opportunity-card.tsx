'use client'

/**
 * OpportunityCard — card draggable no kanban
 *
 * Exibe: nome do contato, label (badge colorido), score.
 * Usa @dnd-kit/sortable para drag-drop entre colunas.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §6
 * Roadmap: T-5-13
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type OpportunityCardData = {
  id: string
  contactName: string
  label: string
  score: string
}

const LABEL_FALLBACK: { className: string; text: string } = {
  className: 'bg-slate-100 text-slate-700',
  text: 'Aberto',
}

const LABEL_STYLES: Record<string, { className: string; text: string }> = {
  open: { className: 'bg-slate-100 text-slate-700', text: 'Aberto' },
  negotiating: { className: 'bg-blue-100 text-blue-700', text: 'Negociando' },
  concluded: { className: 'bg-green-100 text-green-700', text: 'Concluído' },
  won: { className: 'bg-emerald-100 text-emerald-700', text: 'Ganho' },
  lost: { className: 'bg-red-100 text-red-700', text: 'Perdido' },
  reopened: { className: 'bg-amber-100 text-amber-700', text: 'Reaberto' },
}

interface OpportunityCardProps {
  entry: OpportunityCardData
  /** Quando true, o card está sendo arrastado (overlay visual) */
  isDragOverlay?: boolean
}

export function OpportunityCard({ entry, isDragOverlay = false }: OpportunityCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    data: { type: 'entry', entry },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const labelStyle = LABEL_STYLES[entry.label] ?? LABEL_FALLBACK

  // Formata score como inteiro se não tiver casas decimais significativas
  const scoreDisplay = parseFloat(entry.score) % 1 === 0
    ? String(Math.round(parseFloat(entry.score)))
    : parseFloat(entry.score).toFixed(1)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      aria-label={`Oportunidade: ${entry.contactName}`}
      aria-roledescription="item arrastável"
      className={cn(
        'rounded-md border border-slate-200 bg-white p-3 shadow-sm',
        'cursor-grab active:cursor-grabbing',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
        'transition-shadow hover:shadow-md',
        isDragging && !isDragOverlay && 'opacity-40',
        isDragOverlay && 'rotate-1 shadow-lg opacity-95',
      )}
    >
      {/* Nome do contato */}
      <p className="text-sm font-medium text-slate-900 truncate leading-snug">
        {entry.contactName}
      </p>

      {/* Label + Score */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge
          className={cn('text-xs px-2 py-0.5 font-normal', labelStyle.className)}
          aria-label={`Etiqueta: ${labelStyle.text}`}
        >
          {labelStyle.text}
        </Badge>

        {parseFloat(entry.score) !== 0 && (
          <span
            className="text-xs text-slate-500 tabular-nums"
            aria-label={`Score: ${scoreDisplay}`}
          >
            ⭐ {scoreDisplay}
          </span>
        )}
      </div>
    </div>
  )
}
