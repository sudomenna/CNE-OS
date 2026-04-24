'use client'

/**
 * KanbanBoard — Client Component com drag-drop entre colunas
 *
 * Usa @dnd-kit/core (DndContext) + @dnd-kit/sortable para mover cards
 * entre colunas de estágio. Ao soltar em outro estágio, chama moveStageAction
 * com otimismo: atualiza UI antes da resposta e reverte em caso de erro.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §6 + INV-FUNNEL-03
 * Roadmap: T-5-13
 */

import { useState, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import type { DragStartEvent, DragOverEvent, DragEndEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { StageColumn } from './stage-column'
import type { StageColumnData } from './stage-column'
import { OpportunityCard } from './opportunity-card'
import type { OpportunityCardData } from './opportunity-card'
import { moveStageAction } from '@/app/(app)/funnels/actions'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type KanbanEntry = {
  id: string
  contactId: string
  currentStageId: string
  label: string
  score: string
  entryDate: string
  contactName: string
}

export type KanbanStage = {
  id: string
  name: string
  position: number
  isTerminal: boolean
}

export type KanbanFunnel = {
  funnel: { id: string; name: string; slug: string }
  stages: KanbanStage[]
  entries: KanbanEntry[]
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function toCardData(entry: KanbanEntry): OpportunityCardData {
  return {
    id: entry.id,
    contactName: entry.contactName,
    label: entry.label,
    score: entry.score,
  }
}

function groupEntriesByStage(
  entries: KanbanEntry[],
  stages: KanbanStage[],
): Record<string, KanbanEntry[]> {
  const map: Record<string, KanbanEntry[]> = {}
  for (const stage of stages) {
    map[stage.id] = []
  }
  for (const entry of entries) {
    const bucket = map[entry.currentStageId]
    if (bucket) {
      bucket.push(entry)
    }
  }
  return map
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

interface KanbanBoardProps {
  data: KanbanFunnel
}

export function KanbanBoard({ data }: KanbanBoardProps) {
  // Estado local das entradas — iniciado dos props do server
  const [entries, setEntries] = useState<KanbanEntry[]>(data.entries)
  // ID do card em drag (para DragOverlay)
  const [activeId, setActiveId] = useState<string | null>(null)
  // Stagecolumn target durante "over" (para highlight)
  const [overStageId, setOverStageId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // Snap-back helper: restaura estado anterior em caso de erro
  const revertEntries = useCallback((snapshot: KanbanEntry[]) => {
    setEntries(snapshot)
  }, [])

  // ---------------------------------------------------------------------------
  // Handlers dnd-kit
  // ---------------------------------------------------------------------------

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id)
    setActiveId(id)
  }

  function handleDragOver(event: DragOverEvent) {
    const overId = event.over?.id
    if (!overId) {
      setOverStageId(null)
      return
    }
    // Droppable dos estágios têm id do formato "stage-<uuid>"
    const stageId = String(overId).startsWith('stage-')
      ? String(overId).replace('stage-', '')
      : null
    setOverStageId(stageId)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    setActiveId(null)
    setOverStageId(null)

    if (!over) return

    const draggedEntryId = String(active.id)
    const overId = String(over.id)

    // Determina o estágio alvo
    // Pode ser: "stage-<stageId>" (dropped na coluna) ou o ID de outro card
    let targetStageId: string | null = null
    if (overId.startsWith('stage-')) {
      targetStageId = overId.replace('stage-', '')
    } else {
      // Dropped sobre outro card — usa o stageId do card alvo
      const targetEntry = entries.find((e) => e.id === overId)
      if (targetEntry) targetStageId = targetEntry.currentStageId
    }

    if (!targetStageId) return

    const draggedEntry = entries.find((e) => e.id === draggedEntryId)
    if (!draggedEntry) return

    // Não faz nada se o estágio não mudou
    if (draggedEntry.currentStageId === targetStageId) {
      // Pode ter mudado a ordem dentro do mesmo estágio (reorder)
      return
    }

    // ---- Atualização otimista ----
    const snapshot = entries.slice() // cópia imutável para rollback
    setEntries((prev) =>
      prev.map((e) =>
        e.id === draggedEntryId ? { ...e, currentStageId: targetStageId! } : e,
      ),
    )

    // ---- Server Action ----
    const result = await moveStageAction({
      entryId: draggedEntryId,
      toStageId: targetStageId,
    })

    if (!result.ok) {
      // Reverte estado otimista
      revertEntries(snapshot)
      toast.error('Erro ao mover oportunidade', {
        description: result.error.message,
      })
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const stages: StageColumnData[] = data.stages.map((s) => ({
    id: s.id,
    name: s.name,
    position: s.position,
    isTerminal: s.isTerminal,
  }))

  const grouped = groupEntriesByStage(entries, data.stages)
  const activeEntry = activeId ? entries.find((e) => e.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        className="flex gap-4 pb-4 min-h-full"
        role="region"
        aria-label={`Kanban: ${data.funnel.name}`}
      >
        {stages.map((stage) => (
          <StageColumn
            key={stage.id}
            stage={stage}
            entries={(grouped[stage.id] ?? []).map(toCardData)}
            isDropTarget={overStageId === stage.id}
          />
        ))}

        {stages.length === 0 && (
          <div className="flex items-center justify-center w-full h-40 text-slate-400 text-sm">
            Nenhum estágio configurado neste funil.
          </div>
        )}
      </div>

      {/* Overlay exibido enquanto arrasta */}
      <DragOverlay dropAnimation={null}>
        {activeEntry ? (
          <OpportunityCard entry={toCardData(activeEntry)} isDragOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
