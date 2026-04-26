'use client'

/**
 * TicketDetailTabs — 4 abas de detalhe do ticket.
 * Tabs: Descricao | Atividade | Notas | Historico
 *
 * MOD-TICKET — Client Component
 * docs/20-domain/06-ticket.md
 */

import { useState, useTransition, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { getTicketTimeline, updateTicketAction } from '@/app/(app)/tickets/actions'
import { AddNoteForm } from './add-note-form'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TimelineEntry = {
  id: string
  kind: string
  source: string
  actorUserId: string | null
  actorSystem: string | null
  payload: unknown
  occurredAt: Date
}

type Note = {
  id: string
  authorUserId: string
  body: string
  isInternal: boolean
  createdAt: Date
}

type StatusHistoryEntry = {
  id: string
  fromStatus: string | null
  toStatus: string
  changedByUserId: string | null
  reason: string | null
  createdAt: Date
}

export interface TicketDetailTabsProps {
  ticketId: string
  description: string | null
  currentUserId: string
  notes: Note[]
  statusHistory: StatusHistoryEntry[]
}

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_reply: 'Aguardando',
  resolved: 'Resolvido',
  cancelled: 'Cancelado',
}

const KIND_LABELS: Record<string, string> = {
  ticket_opened: 'Ticket aberto',
  ticket_status_changed: 'Status alterado',
  ticket_resolved: 'Ticket resolvido',
  ticket_reopened: 'Ticket reaberto',
  ticket_assigned: 'Responsavel atribuido',
  ticket_unassigned: 'Responsavel removido',
  ticket_updated: 'Ticket editado',
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DescriptionTab({
  ticketId: _ticketId,
  description,
}: {
  ticketId: string
  description: string | null
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(description ?? '')
  const [saved, setSaved] = useState(description ?? '')
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      const result = await updateTicketAction({
        id: _ticketId,
        field: 'description',
        value,
      })
      if (result.ok) {
        setSaved(value)
        setEditing(false)
      }
    })
  }

  function handleCancel() {
    setValue(saved)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <Textarea
          id={`desc-edit-${_ticketId}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={6}
          placeholder="Descreva o ticket..."
          disabled={isPending}
          aria-label="Descricao do ticket"
          className="w-full"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? 'Salvando...' : 'Salvar'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCancel}
            disabled={isPending}
          >
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {saved ? (
        <p className="text-sm text-foreground whitespace-pre-wrap">{saved}</p>
      ) : (
        <p className="text-sm text-muted-foreground/60">Nenhuma descricao registrada.</p>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={() => setEditing(true)}
        aria-label="Editar descricao do ticket"
      >
        Editar descricao
      </Button>
    </div>
  )
}

function ActivityTab({ ticketId }: { ticketId: string }) {
  const [events, setEvents] = useState<TimelineEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    startTransition(async () => {
      const result = await getTicketTimeline(ticketId)
      if (result.ok) {
        setEvents(result.data as TimelineEntry[])
      } else {
        setError(result.error.message)
      }
    })
  // Run only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>
  }

  if (isPending || events === null) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Carregando atividade">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    )
  }

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground/60">Nenhum evento registrado.</p>
  }

  return (
    <ol
      className="relative border-l border-border space-y-4 ml-3"
      aria-label="Atividade do ticket"
    >
      {events.map((ev) => (
        <li key={ev.id} className="ml-4">
          <span
            aria-hidden="true"
            className="absolute -left-1.5 h-3 w-3 rounded-full border-2 border-white bg-muted-foreground/40"
          />
          <p className="text-sm font-medium text-foreground">
            {KIND_LABELS[ev.kind] ?? ev.kind}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {ev.actorUserId && (
              <span className="text-xs text-muted-foreground font-mono">
                {ev.actorUserId.slice(0, 8)}…
              </span>
            )}
            {ev.actorSystem && (
              <span className="text-xs text-muted-foreground">{ev.actorSystem}</span>
            )}
            <time
              dateTime={new Date(ev.occurredAt).toISOString()}
              className="text-xs text-muted-foreground/60"
            >
              {new Date(ev.occurredAt).toLocaleString('pt-BR')}
            </time>
          </div>
        </li>
      ))}
    </ol>
  )
}

function NotesTab({ ticketId, notes }: { ticketId: string; notes: Note[] }) {
  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground/60">Nenhuma nota registrada.</p>
      ) : (
        <ul className="space-y-3" aria-label="Notas do ticket">
          {notes.map((note) => (
            <li
              key={note.id}
              className={`rounded-md px-4 py-3 text-sm ${
                note.isInternal
                  ? 'border border-amber-200 bg-amber-50'
                  : 'border border-border bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {note.authorUserId.slice(0, 8)}…
                </span>
                <div className="flex items-center gap-2">
                  {note.isInternal && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                      Interna
                    </span>
                  )}
                  <time
                    dateTime={new Date(note.createdAt).toISOString()}
                    className="text-xs text-muted-foreground/60"
                  >
                    {new Date(note.createdAt).toLocaleString('pt-BR')}
                  </time>
                </div>
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
      <AddNoteForm ticketId={ticketId} />
    </div>
  )
}

function HistoryTab({ statusHistory }: { statusHistory: StatusHistoryEntry[] }) {
  if (statusHistory.length === 0) {
    return <p className="text-sm text-muted-foreground/60">Nenhuma alteracao registrada.</p>
  }

  return (
    <ol
      className="relative border-l border-border space-y-4 ml-3"
      aria-label="Historico de status"
    >
      {statusHistory.map((entry) => (
        <li key={entry.id} className="ml-4">
          <span
            aria-hidden="true"
            className="absolute -left-1.5 h-3 w-3 rounded-full border-2 border-white bg-muted-foreground/40"
          />
          <p className="text-sm text-muted-foreground">
            {entry.fromStatus ? (
              <>
                <span className="font-medium">
                  {STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus}
                </span>
                {' → '}
                <span className="font-medium">
                  {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
                </span>
              </>
            ) : (
              <>
                Ticket aberto como{' '}
                <span className="font-medium">
                  {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
                </span>
              </>
            )}
            {entry.reason && (
              <span className="ml-1 text-muted-foreground">— {entry.reason}</span>
            )}
          </p>
          {entry.changedByUserId && (
            <span className="text-xs text-muted-foreground font-mono">
              {entry.changedByUserId.slice(0, 8)}…{'  '}
            </span>
          )}
          <time
            dateTime={new Date(entry.createdAt).toISOString()}
            className="text-xs text-muted-foreground/60"
          >
            {new Date(entry.createdAt).toLocaleString('pt-BR')}
          </time>
        </li>
      ))}
    </ol>
  )
}

// ---------------------------------------------------------------------------
// TicketDetailTabs — main export
// ---------------------------------------------------------------------------

export function TicketDetailTabs({
  ticketId,
  description,
  currentUserId: _currentUserId,
  notes,
  statusHistory,
}: TicketDetailTabsProps) {
  return (
    <Tabs defaultValue="description" className="w-full">
      <TabsList className="w-full justify-start border-b rounded-none bg-transparent px-0 h-auto gap-0">
        <TabsTrigger
          value="description"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm"
        >
          Descricao
        </TabsTrigger>
        <TabsTrigger
          value="activity"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm"
        >
          Atividade
        </TabsTrigger>
        <TabsTrigger
          value="notes"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm"
        >
          Notas ({notes.length})
        </TabsTrigger>
        <TabsTrigger
          value="history"
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 text-sm"
        >
          Historico
        </TabsTrigger>
      </TabsList>

      <TabsContent value="description" className="pt-4">
        <DescriptionTab ticketId={ticketId} description={description} />
      </TabsContent>

      <TabsContent value="activity" className="pt-4">
        <ActivityTab ticketId={ticketId} />
      </TabsContent>

      <TabsContent value="notes" className="pt-4">
        <NotesTab ticketId={ticketId} notes={notes} />
      </TabsContent>

      <TabsContent value="history" className="pt-4">
        <HistoryTab statusHistory={statusHistory} />
      </TabsContent>
    </Tabs>
  )
}
