'use client'

/**
 * StageColumn — coluna droppable do kanban
 *
 * Recebe os entries do estágio e os renderiza como lista sortable.
 * Usa useDroppable + SortableContext para aceitar cards arrastados.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §6
 * Roadmap: T-5-13
 */

import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { OpportunityCard } from './opportunity-card'
import type { OpportunityCardData } from './opportunity-card'

export type StageColumnData = {
  id: string
  name: string
  position: number
  isTerminal: boolean
}

interface StageColumnProps {
  stage: StageColumnData
  entries: OpportunityCardData[]
  /** Quando true, coluna está sendo alvo de drop ativo */
  isDropTarget?: boolean
}

export function StageColumn({ stage, entries, isDropTarget = false }: StageColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `stage-${stage.id}`,
    data: { type: 'stage', stageId: stage.id },
  })

  const entryIds = entries.map((e) => e.id)

  return (
    <div
      aria-label={`Coluna: ${stage.name}`}
      className="flex flex-col w-72 min-w-72 flex-shrink-0"
    >
      {/* Cabeçalho da coluna */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/50 rounded-t-lg border border-b-0 border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{stage.name}</span>
          {stage.isTerminal && (
            <span
              className="text-xs bg-muted text-muted-foreground rounded px-1.5 py-0.5"
              aria-label="Estágio terminal"
            >
              Terminal
            </span>
          )}
        </div>
        <span
          className="text-xs font-tabular text-muted-foreground tabular-nums"
          aria-label={`${entries.length} oportunidades`}
        >
          {entries.length}
        </span>
      </div>

      {/* Área droppable */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 rounded-b-lg border border-border p-2 min-h-40',
          'bg-white transition-colors duration-150',
          (isOver || isDropTarget) && 'bg-blue-50 border-blue-300',
        )}
      >
        <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <OpportunityCard key={entry.id} entry={entry} />
            ))}

            {entries.length === 0 && (
              <div
                className={cn(
                  'flex items-center justify-center h-32 rounded-md',
                  'border-2 border-dashed border-border text-muted-foreground/60 text-sm',
                  (isOver || isDropTarget) && 'border-blue-300 text-blue-400',
                )}
                aria-live="polite"
              >
                {isOver || isDropTarget ? 'Soltar aqui' : 'Sem oportunidades'}
              </div>
            )}
          </div>
        </SortableContext>
      </div>
    </div>
  )
}
