'use client'

/**
 * FunnelBoardClient — Client Component wrapper do board de funil
 *
 * Gerencia todo estado interativo da página /funnels/[id]:
 *   - toggle Board/Lista (cookie cne_pref_funnel_view)
 *   - selectedEntryId → abre EntrySheet
 *   - wonEntry / lostEntry → abre WonModal / LostModal
 *   - filtros: assignee, dateFrom, dateTo (passados via searchParams → props)
 *
 * Recebe dados carregados pelo Server Component via props.
 *
 * Spec: docs/70-ux/05-screen-funnel-board.md §3, §6, §7
 * T-12-20
 */

import { useCallback, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import type { Route } from 'next'
import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KanbanBoard } from './kanban'
import type { KanbanFunnel, EntryDroppedPayload } from './kanban'
import { FunnelListView } from './funnel-list-view'
import { EntrySheet } from './entry-sheet'
import { WonModal } from './won-lost-modals'
import { LostModal } from './won-lost-modals'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type FunnelBoardClientProps = {
  kanbanData: KanbanFunnel
  /** Vista inicial — vem do cookie cne_pref_funnel_view lido no Server Component */
  initialView: 'board' | 'list'
  /** Filtros ativos — vem dos searchParams */
  assignee?: string | null
  dateFrom?: string | null
  dateTo?: string | null
  /** userId para namespace do localStorage de preferência de colunas (ADR-19, T-16-08) */
  userId: string
}

// ---------------------------------------------------------------------------
// Cookie helper — salva preferência de vista no browser
// ---------------------------------------------------------------------------

const PREF_COOKIE = 'cne_pref_funnel_view'

function savePrefCookie(value: 'board' | 'list') {
  // Persist por 365 dias, mesmo path, sem Secure (funciona em dev http)
  const maxAge = 60 * 60 * 24 * 365
  document.cookie = `${PREF_COOKIE}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FunnelBoardClient({
  kanbanData,
  initialView,
  assignee: initialAssignee,
  dateFrom: initialDateFrom,
  dateTo: initialDateTo,
  userId,
}: FunnelBoardClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ---- View toggle ----
  const [view, setView] = useState<'board' | 'list'>(initialView)

  function handleToggleView(next: 'board' | 'list') {
    setView(next)
    savePrefCookie(next)
  }

  // ---- Filtros ----
  const [assignee, setAssignee] = useState(initialAssignee ?? '')
  const [dateFrom, setDateFrom] = useState(initialDateFrom ?? '')
  const [dateTo, setDateTo] = useState(initialDateTo ?? '')

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString())
    if (assignee) params.set('assignee', assignee)
    else params.delete('assignee')
    if (dateFrom) params.set('dateFrom', dateFrom)
    else params.delete('dateFrom')
    if (dateTo) params.set('dateTo', dateTo)
    else params.delete('dateTo')
    router.push(`${pathname}?${params.toString()}` as Route)
  }

  function clearFilters() {
    setAssignee('')
    setDateFrom('')
    setDateTo('')
    router.push(pathname as Route)
  }

  const hasFilters = Boolean(assignee || dateFrom || dateTo)

  // ---- EntrySheet state ----
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)

  const handleCardClick = useCallback((entryId: string) => {
    setSelectedEntryId(entryId)
  }, [])

  const handleSheetClose = useCallback(() => {
    setSelectedEntryId(null)
  }, [])

  // ---- Won/Lost modal state ----
  const [wonEntryId, setWonEntryId] = useState<string | null>(null)
  const [lostEntryId, setLostEntryId] = useState<string | null>(null)

  const handleEntryDropped = useCallback((payload: EntryDroppedPayload) => {
    if (payload.stageKind === 'won') {
      setWonEntryId(payload.entryId)
    } else {
      setLostEntryId(payload.entryId)
    }
  }, [])

  const handleWonConfirm = useCallback(() => {
    setWonEntryId(null)
    // Board revalida via revalidatePath no markWonAction
  }, [])

  const handleWonCancel = useCallback(() => {
    setWonEntryId(null)
  }, [])

  const handleLostConfirm = useCallback(() => {
    setLostEntryId(null)
  }, [])

  const handleLostCancel = useCallback(() => {
    setLostEntryId(null)
  }, [])

  // ---- Derived ----
  const funnelId = kanbanData.funnel.id
  const stages = kanbanData.stages.map((s) => ({ id: s.id, name: s.name }))

  return (
    <>
      {/* Barra de filtros + toggle */}
      <div className="flex flex-wrap items-end gap-3 px-6 py-3 border-b border-border bg-card">
        {/* Responsável (UUID ou nome — Fase 1: UUID direto) */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <Label htmlFor="filter-assignee" className="text-xs text-muted-foreground">
            Responsável (UUID)
          </Label>
          <Input
            id="filter-assignee"
            placeholder="UUID do responsável"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        {/* Período de entrada */}
        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-date-from" className="text-xs text-muted-foreground">
            De
          </Label>
          <Input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="filter-date-to" className="text-xs text-muted-foreground">
            Até
          </Label>
          <Input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 text-sm w-36"
          />
        </div>

        {/* Ações de filtro */}
        <Button size="sm" onClick={applyFilters} className="h-8">
          Filtrar
        </Button>
        {hasFilters && (
          <Button size="sm" variant="outline" onClick={clearFilters} className="h-8">
            Limpar
          </Button>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Toggle Board/Lista */}
        <div
          className="flex items-center rounded-md border border-border overflow-hidden"
          role="group"
          aria-label="Alternar visualização"
        >
          <button
            type="button"
            aria-label="Visualização em board"
            aria-pressed={view === 'board'}
            onClick={() => handleToggleView('board')}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
              view === 'board'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            ].join(' ')}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Board</span>
          </button>
          <button
            type="button"
            aria-label="Visualização em lista"
            aria-pressed={view === 'list'}
            onClick={() => handleToggleView('list')}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors border-l border-border',
              view === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            ].join(' ')}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Lista</span>
          </button>
        </div>
      </div>

      {/* Conteúdo principal */}
      {view === 'board' ? (
        <div className="flex-1 overflow-x-auto p-6">
          <KanbanBoard
            data={kanbanData}
            onCardClick={handleCardClick}
            onEntryDropped={handleEntryDropped}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <FunnelListView
            funnelId={funnelId}
            stages={stages}
            assignee={assignee || null}
            dateFrom={dateFrom || null}
            dateTo={dateTo || null}
            userId={userId}
          />
        </div>
      )}

      {/* EntrySheet — abre ao clicar card */}
      <EntrySheet entryId={selectedEntryId} onClose={handleSheetClose} />

      {/* WonModal — abre ao arrastar para estágio terminal won */}
      {wonEntryId && (
        <WonModal
          open={Boolean(wonEntryId)}
          entryId={wonEntryId}
          onConfirm={handleWonConfirm}
          onCancel={handleWonCancel}
        />
      )}

      {/* LostModal — abre ao arrastar para estágio terminal lost */}
      {lostEntryId && (
        <LostModal
          open={Boolean(lostEntryId)}
          entryId={lostEntryId}
          onConfirm={handleLostConfirm}
          onCancel={handleLostCancel}
        />
      )}
    </>
  )
}
