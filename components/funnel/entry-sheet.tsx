'use client'

/**
 * EntrySheet — Sheet lateral de detalhe de uma oportunidade do funil.
 *
 * Abre ao clicar um card no KanbanBoard (wiring via T-12-20).
 * Largura 480px, âncora à direita, 4 tabs internas.
 *
 * Spec: docs/70-ux/05-screen-funnel-board.md §7
 * T-12-18
 */

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Activity,
  FileText,
  User,
  Settings,
  Phone,
  Mail,
  Tag,
  Calendar,
  Megaphone,
  Paintbrush,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

import {
  getEntryDetailsAction,
  getEntryTimelineAction,
  updateEntryAction,
} from '@/app/(app)/funnels/actions'
import type { EntryDetails, EntryTimelineEvent } from '@/app/(app)/funnels/actions'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EntrySheetProps {
  entryId: string | null
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LABEL_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  open: { label: 'Aberta', variant: 'secondary' },
  negotiating: { label: 'Negociando', variant: 'default' },
  concluded: { label: 'Concluida', variant: 'default' },
  won: { label: 'Ganha', variant: 'default' },
  lost: { label: 'Perdida', variant: 'destructive' },
  reopened: { label: 'Reaberta', variant: 'outline' },
}

const CLASSIFICATION_MAP: Record<string, string> = {
  lead: 'Lead',
  customer: 'Cliente',
  student: 'Aluno',
  mentorado: 'Mentorado',
}

function formatDateTime(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

// ---------------------------------------------------------------------------
// Tab Atividade
// ---------------------------------------------------------------------------

interface TabActivityProps {
  entryId: string
}

function TimelineItem({
  event,
  isLast,
}: {
  event: EntryTimelineEvent
  isLast: boolean
}) {
  const actor = event.actorName ?? event.actorSystem ?? 'Sistema'
  const kindLabel = event.kind.replace(/_/g, ' ')

  return (
    <li className="relative flex gap-4">
      {!isLast && (
        <span
          className="absolute left-[10px] top-4 h-full w-px bg-border"
          aria-hidden="true"
        />
      )}
      <span
        className="relative mt-1.5 ml-3 flex h-2 w-2 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <span className="block h-2 w-2 rounded-full bg-muted-foreground/50" />
      </span>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
          <span className="text-sm font-medium text-foreground">{actor}</span>
          <span className="text-sm text-muted-foreground capitalize">{kindLabel}</span>
        </div>
        <time
          dateTime={new Date(event.occurredAt).toISOString()}
          className="text-xs text-muted-foreground/60"
        >
          {formatDateTime(event.occurredAt)}
        </time>
      </div>
    </li>
  )
}

function TabActivity({ entryId }: TabActivityProps) {
  const [events, setEvents] = useState<EntryTimelineEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    getEntryTimelineAction({ entryId }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setEvents(result.data)
      } else {
        setError('Falha ao carregar atividade.')
      }
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [entryId])

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div role="alert" className="text-sm text-destructive">
        {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12">
        <Activity className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada</p>
      </div>
    )
  }

  return (
    <section aria-label="Atividade da oportunidade">
      <ol className="list-none" aria-label="Timeline de atividade">
        {events.map((event, index) => (
          <TimelineItem
            key={event.id}
            event={event}
            isLast={index === events.length - 1}
          />
        ))}
      </ol>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tab Notas — inline (reutiliza padrão TabNotes mas sem importar o componente
// para evitar dependência cruzada; usa mesmas actions de notas do contato)
// ---------------------------------------------------------------------------

interface TabNotesInlineProps {
  contactId: string
}

function TabNotesInline({ contactId }: TabNotesInlineProps) {
  // Notas são vinculadas ao contactId (contact_note.contact_id)
  // Delegamos ao padrão exibindo link para o perfil completo onde TabNotes já existe
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-12 text-center">
      <FileText className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">
        Notas estao disponiveis no perfil completo do contato.
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/contacts/${contactId}`}>Ver perfil completo</Link>
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tab Contato
// ---------------------------------------------------------------------------

interface TabContactProps {
  details: EntryDetails
}

function TabContact({ details }: TabContactProps) {
  const { contact } = details

  return (
    <section aria-label="Informacoes do contato" className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <User className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-foreground truncate">{contact.fullName}</p>
          <Badge variant="secondary" className="mt-1 text-xs">
            {CLASSIFICATION_MAP[contact.classification] ?? contact.classification}
          </Badge>
        </div>
      </div>

      <dl className="space-y-3 text-sm">
        {contact.primaryEmail && (
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <dt className="sr-only">Email</dt>
            <dd className="truncate text-foreground">{contact.primaryEmail}</dd>
          </div>
        )}

        {contact.primaryPhone && (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <dt className="sr-only">Telefone</dt>
            <dd className="text-foreground">{contact.primaryPhone}</dd>
          </div>
        )}

        {!contact.primaryEmail && !contact.primaryPhone && (
          <p className="text-muted-foreground">Nenhum dado de contato disponivel.</p>
        )}
      </dl>

      <Button variant="outline" size="sm" asChild className="w-full">
        <Link href={`/contacts/${contact.id}`}>Ver perfil completo</Link>
      </Button>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Tab Detalhes
// ---------------------------------------------------------------------------

interface TabDetailsProps {
  details: EntryDetails
  onUpdate: (ownerUserId: string | null) => Promise<void>
  isSaving: boolean
}

function TabDetails({ details, onUpdate, isSaving }: TabDetailsProps) {
  const { entry, owner, campaignName, creativeName } = details
  const labelMeta = LABEL_MAP[entry.label] ?? { label: entry.label, variant: 'outline' as const }

  return (
    <section aria-label="Detalhes da oportunidade" className="space-y-4">
      <dl className="grid grid-cols-1 gap-3 text-sm">
        {/* Status / Label */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Status
          </dt>
          <dd>
            <Badge variant={labelMeta.variant}>{labelMeta.label}</Badge>
          </dd>
        </div>

        {/* Score */}
        <div>
          <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Score
          </dt>
          <dd className="font-medium">{entry.score}</dd>
        </div>

        {/* Responsavel */}
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide mb-1">
            <UserCheck className="h-3 w-3" aria-hidden="true" />
            Responsavel
          </dt>
          <dd className="text-foreground">
            {owner ? (
              <span>
                {owner.fullName}{' '}
                <span className="text-muted-foreground text-xs">({owner.email})</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Sem responsavel</span>
            )}
          </dd>
        </div>

        {/* Data de entrada */}
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide mb-1">
            <Calendar className="h-3 w-3" aria-hidden="true" />
            Data de entrada
          </dt>
          <dd className="text-foreground">{formatDate(entry.entryDate)}</dd>
        </div>

        {/* Campanha */}
        {campaignName && (
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide mb-1">
              <Megaphone className="h-3 w-3" aria-hidden="true" />
              Campanha
            </dt>
            <dd className="text-foreground">{campaignName}</dd>
          </div>
        )}

        {/* Criativo */}
        {creativeName && (
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide mb-1">
              <Paintbrush className="h-3 w-3" aria-hidden="true" />
              Criativo
            </dt>
            <dd className="text-foreground">{creativeName}</dd>
          </div>
        )}

        {/* Origem */}
        {entry.entryOrigin && (
          <div>
            <dt className="flex items-center gap-1 text-xs text-muted-foreground uppercase tracking-wide mb-1">
              <Tag className="h-3 w-3" aria-hidden="true" />
              Origem
            </dt>
            <dd className="text-foreground">{entry.entryOrigin}</dd>
          </div>
        )}

        {/* Motivo da perda */}
        {entry.lostReason && (
          <div>
            <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
              Motivo da perda
            </dt>
            <dd className="text-foreground">{entry.lostReason}</dd>
          </div>
        )}
      </dl>

      {/* Remover responsavel — acao simples disponivel */}
      {owner && (
        <Button
          variant="outline"
          size="sm"
          disabled={isSaving}
          onClick={() => void onUpdate(null)}
          aria-label="Remover responsavel da oportunidade"
        >
          {isSaving ? 'Salvando...' : 'Remover responsavel'}
        </Button>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// EntrySheet — componente principal
// ---------------------------------------------------------------------------

export function EntrySheet({ entryId, onClose }: EntrySheetProps) {
  const [details, setDetails] = useState<EntryDetails | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()

  // Carrega detalhes quando entryId muda de null para um valor
  useEffect(() => {
    if (!entryId) {
      setDetails(null)
      setLoadError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setLoadError(null)

    getEntryDetailsAction({ entryId }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setDetails(result.data)
      } else {
        setLoadError('Falha ao carregar detalhes da oportunidade.')
      }
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [entryId])

  async function handleUpdate(ownerUserId: string | null) {
    if (!entryId) return
    startSave(async () => {
      const result = await updateEntryAction({ id: entryId, ownerUserId })
      if (result.ok) {
        // Recarrega detalhes
        const refreshed = await getEntryDetailsAction({ entryId })
        if (refreshed.ok) setDetails(refreshed.data)
        toast.success('Oportunidade atualizada')
      } else {
        toast.error('Erro ao atualizar oportunidade', {
          description: result.error.message,
        })
      }
    })
  }

  const isOpen = entryId !== null
  const contactName = details?.contact.fullName ?? 'Oportunidade'

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="w-[480px] sm:max-w-[480px] flex flex-col gap-0 p-0"
        aria-label="Detalhes da oportunidade"
      >
        {/* Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle className="text-lg font-semibold truncate">{contactName}</SheetTitle>
          <SheetDescription className="sr-only">
            Detalhes, atividade, notas e contato da oportunidade
          </SheetDescription>
        </SheetHeader>

        {/* Conteudo */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="p-6 space-y-4" aria-busy="true" aria-label="Carregando">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {loadError && !isLoading && (
            <div
              role="alert"
              className="m-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {loadError}
            </div>
          )}

          {details && !isLoading && (
            <Tabs defaultValue="activity" className="flex flex-col h-full">
              <TabsList className="mx-6 mt-4 mb-0 grid w-auto grid-cols-4 shrink-0">
                <TabsTrigger value="activity" aria-label="Atividade">
                  <Activity className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-1.5 sm:text-xs">Atividade</span>
                </TabsTrigger>
                <TabsTrigger value="notes" aria-label="Notas">
                  <FileText className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-1.5 sm:text-xs">Notas</span>
                </TabsTrigger>
                <TabsTrigger value="contact" aria-label="Contato">
                  <User className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-1.5 sm:text-xs">Contato</span>
                </TabsTrigger>
                <TabsTrigger value="details" aria-label="Detalhes">
                  <Settings className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only sm:ml-1.5 sm:text-xs">Detalhes</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="activity" className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                <TabActivity entryId={details.entry.id} />
              </TabsContent>

              <TabsContent value="notes" className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                <TabNotesInline contactId={details.contact.id} />
              </TabsContent>

              <TabsContent value="contact" className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                <TabContact details={details} />
              </TabsContent>

              <TabsContent value="details" className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
                <TabDetails
                  details={details}
                  onUpdate={handleUpdate}
                  isSaving={isSaving}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
