'use client'

/**
 * TabNotes — Client Component
 *
 * Tab de notas do contato: listar, criar, editar e excluir notas.
 * T-12-14 — Contact: Tab Notas (CRUD)
 *
 * Spec: docs/20-domain/02-contact-identity.md §3.7
 */

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { FileText, Pencil, Trash2, X, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import {
  createNoteAction,
  deleteNoteAction,
  listNotesAction,
  updateNoteAction,
  type NoteRow,
} from '@/app/(app)/contacts/[id]/notes/actions'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TabNotesProps {
  contactId: string
  currentUserId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeDate(date: Date | string): string {
  const target = new Date(date)
  const diffMs = Date.now() - target.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'agora'
  if (diffMin < 60) return `ha ${diffMin} min`
  if (diffHour < 24) return `ha ${diffHour}h`
  if (diffDay < 7) return `ha ${diffDay}d`

  return target.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// NoteItem — exibe e permite editar/excluir uma nota individual
// ---------------------------------------------------------------------------

interface NoteItemProps {
  note: NoteRow
  currentUserId: string
  onUpdate: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => void
}

function NoteItem({ note, currentUserId, onUpdate, onDelete }: NoteItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState(note.body)
  const [isSaving, startSave] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isOwner = note.authorUserId === currentUserId

  function handleEditStart() {
    setEditBody(note.body)
    setIsEditing(true)
    // Focus the textarea after render
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  function handleCancel() {
    setEditBody(note.body)
    setIsEditing(false)
  }

  function handleSave() {
    if (!editBody.trim()) return
    startSave(async () => {
      await onUpdate(note.id, editBody.trim())
      setIsEditing(false)
    })
  }

  return (
    <article
      className="rounded-lg border border-border bg-card px-4 py-3 space-y-2"
      aria-label={`Nota de ${note.authorName}`}
    >
      {/* Meta: autor + data */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            {note.authorName}
          </span>
          <span className="text-xs text-muted-foreground/60 truncate" aria-hidden="true">
            &middot;
          </span>
          <time
            dateTime={new Date(note.createdAt).toISOString()}
            className="text-xs text-muted-foreground/60 whitespace-nowrap"
          >
            {formatRelativeDate(note.createdAt)}
          </time>
        </div>

        {/* Ações — só para o autor */}
        {isOwner && !isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleEditStart}
              aria-label="Editar nota"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  aria-label="Excluir nota"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir nota?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acao nao pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => onDelete(note.id)}
                  >
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {/* Ações de edição inline */}
        {isOwner && isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleCancel}
              disabled={isSaving}
              aria-label="Cancelar edicao"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleSave}
              disabled={isSaving || !editBody.trim()}
              aria-label="Salvar edicao"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      {/* Corpo da nota */}
      {isEditing ? (
        <Textarea
          ref={textareaRef}
          value={editBody}
          onChange={(e) => setEditBody(e.target.value)}
          className="min-h-[80px] resize-y text-sm"
          disabled={isSaving}
          aria-label="Editar texto da nota"
          onKeyDown={(e) => {
            if (e.key === 'Escape') handleCancel()
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSave()
          }}
        />
      ) : (
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {note.body}
        </p>
      )}
    </article>
  )
}

// ---------------------------------------------------------------------------
// CreateNoteForm — textarea no topo com submit
// ---------------------------------------------------------------------------

interface CreateNoteFormProps {
  onAdd: (body: string) => Promise<void>
  isPending: boolean
}

function CreateNoteForm({ onAdd, isPending }: CreateNoteFormProps) {
  const [body, setBody] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return
    await onAdd(trimmed)
    setBody('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2" aria-label="Adicionar nota">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Escreva uma nota..."
        className="min-h-[80px] resize-y text-sm"
        disabled={isPending}
        aria-label="Texto da nota"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            void handleSubmit(e as unknown as React.FormEvent)
          }
        }}
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !body.trim()}
          aria-label="Adicionar nota"
        >
          {isPending ? 'Salvando...' : 'Adicionar nota'}
        </Button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// TabNotes — componente principal
// ---------------------------------------------------------------------------

export function TabNotes({ contactId, currentUserId }: TabNotesProps) {
  const [notes, setNotes] = useState<NoteRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, startCreate] = useTransition()

  // Optimistic update: adiciona nota à lista antes da resposta
  const [optimisticNotes, addOptimisticNote] = useOptimistic(
    notes,
    (state: NoteRow[], newNote: NoteRow) => [newNote, ...state],
  )

  // -------------------------------------------------------------------------
  // Carregar notas no mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      setError(null)
      const result = await listNotesAction({ contactId })
      if (cancelled) return
      if (result.ok) {
        setNotes(result.data)
      } else {
        setError('Falha ao carregar notas.')
      }
      setIsLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [contactId])

  // -------------------------------------------------------------------------
  // Criar nota com optimistic update
  // -------------------------------------------------------------------------
  async function handleCreate(body: string) {
    // Nota temporária para optimistic update
    const tempNote: NoteRow = {
      id: `temp-${Date.now()}`,
      contactId,
      authorUserId: currentUserId,
      authorEmail: '',
      authorName: 'Voce',
      body,
      pinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    startCreate(async () => {
      addOptimisticNote(tempNote)
      const result = await createNoteAction({ contactId, body })
      if (result.ok) {
        // Substituir nota temporária pela real
        setNotes((prev) => {
          // Remove a temporária e adiciona a real no topo
          const withoutTemp = prev.filter((n) => n.id !== tempNote.id)
          return [result.data as unknown as NoteRow, ...withoutTemp]
        })
      } else {
        // Em caso de erro, recarregar do servidor
        const refreshed = await listNotesAction({ contactId })
        if (refreshed.ok) setNotes(refreshed.data)
      }
    })
  }

  // -------------------------------------------------------------------------
  // Atualizar nota
  // -------------------------------------------------------------------------
  async function handleUpdate(id: string, newBody: string) {
    const result = await updateNoteAction({ id, body: newBody })
    if (result.ok) {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, body: newBody, updatedAt: new Date() } : n,
        ),
      )
    }
  }

  // -------------------------------------------------------------------------
  // Excluir nota
  // -------------------------------------------------------------------------
  function handleDelete(id: string) {
    // Optimistic: remove da lista imediatamente
    setNotes((prev) => prev.filter((n) => n.id !== id))

    deleteNoteAction({ id }).then((result) => {
      if (!result.ok) {
        // Em caso de erro, recarregar do servidor
        listNotesAction({ contactId }).then((refreshed) => {
          if (refreshed.ok) setNotes(refreshed.data)
        })
      }
    })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <section aria-label="Notas do contato" className="space-y-4">
      {/* Formulário de criação — sempre visível */}
      <CreateNoteForm onAdd={handleCreate} isPending={isCreating} />

      {/* Estado de carregamento */}
      {isLoading && (
        <div
          className="py-6 text-center text-sm text-muted-foreground"
          aria-live="polite"
          aria-label="Carregando notas"
        >
          Carregando notas...
        </div>
      )}

      {/* Erro */}
      {error && !isLoading && (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && optimisticNotes.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 gap-3 text-center">
          <FileText
            className="h-8 w-8 text-muted-foreground/40"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Nenhuma nota ainda</p>
        </div>
      )}

      {/* Lista de notas */}
      {!isLoading && optimisticNotes.length > 0 && (
        <ol className="space-y-3" aria-label="Lista de notas">
          {optimisticNotes.map((note) => (
            <li key={note.id}>
              <NoteItem
                note={note}
                currentUserId={currentUserId}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
