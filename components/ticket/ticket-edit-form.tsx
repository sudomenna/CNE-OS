'use client'

/**
 * TicketEditForm — edição inline de campos do ticket.
 * Cada campo salva individualmente ao perder o foco (blur) via updateTicketAction.
 *
 * MOD-TICKET — Client Component
 * docs/20-domain/06-ticket.md
 */

import { useState, useTransition } from 'react'
import { updateTicketAction, assignTicketAction } from '@/app/(app)/tickets/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TicketCategory =
  | 'commercial'
  | 'support'
  | 'financial'
  | 'cancellation'
  | 'refund'
  | 'access'
  | 'registration'
  | 'other'

type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'
type TicketStatus = 'open' | 'in_progress' | 'waiting_reply' | 'resolved' | 'cancelled'

export interface TicketEditFormProps {
  ticket: {
    id: string
    title: string
    category: TicketCategory
    priority: TicketPriority
    status: TicketStatus
    assignedUserId: string | null
  }
  users: { id: string; name: string }[]
}

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const CATEGORY_OPTIONS: { value: TicketCategory; label: string }[] = [
  { value: 'commercial', label: 'Comercial' },
  { value: 'support', label: 'Suporte' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'cancellation', label: 'Cancelamento' },
  { value: 'refund', label: 'Reembolso' },
  { value: 'access', label: 'Acesso' },
  { value: 'registration', label: 'Cadastro' },
  { value: 'other', label: 'Outro' },
]

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: 'urgent', label: 'Urgente' },
  { value: 'high', label: 'Alta' },
  { value: 'medium', label: 'Media' },
  { value: 'low', label: 'Baixa' },
]

// ---------------------------------------------------------------------------
// FieldWrapper — shows spinner while saving
// ---------------------------------------------------------------------------

function FieldWrapper({
  label,
  htmlFor,
  isPending,
  error,
  children,
}: {
  label: string
  htmlFor: string
  isPending: boolean
  error: string | null
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
        {isPending && (
          <span
            aria-live="polite"
            aria-label="Salvando"
            className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent"
          />
        )}
      </div>
      {children}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TicketEditForm
// ---------------------------------------------------------------------------

export function TicketEditForm({ ticket, users }: TicketEditFormProps) {
  const [title, setTitle] = useState(ticket.title)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [isPendingTitle, startTitleTransition] = useTransition()

  const [category, setCategory] = useState<TicketCategory>(ticket.category)
  const [categoryError, setCategoryError] = useState<string | null>(null)
  const [isPendingCategory, startCategoryTransition] = useTransition()

  const [priority, setPriority] = useState<TicketPriority>(ticket.priority)
  const [priorityError, setPriorityError] = useState<string | null>(null)
  const [isPendingPriority, startPriorityTransition] = useTransition()

  const [assignedUserId, setAssignedUserId] = useState<string>(ticket.assignedUserId ?? '')
  const [assignError, setAssignError] = useState<string | null>(null)
  const [isPendingAssign, startAssignTransition] = useTransition()

  // -------------------------------------------------------------------------
  // Save handlers
  // -------------------------------------------------------------------------

  function saveTitleOnBlur() {
    const trimmed = title.trim()
    if (trimmed === ticket.title) return
    if (!trimmed) {
      setTitleError('Titulo nao pode ser vazio')
      setTitle(ticket.title)
      return
    }
    setTitleError(null)
    startTitleTransition(async () => {
      const result = await updateTicketAction({ id: ticket.id, field: 'title', value: trimmed })
      if (!result.ok) {
        setTitleError(result.error.message)
        setTitle(ticket.title)
      }
    })
  }

  function saveCategoryOnChange(value: TicketCategory) {
    if (value === category) return
    setCategory(value)
    setCategoryError(null)
    startCategoryTransition(async () => {
      const result = await updateTicketAction({ id: ticket.id, field: 'category', value })
      if (!result.ok) {
        setCategoryError(result.error.message)
        setCategory(category)
      }
    })
  }

  function savePriorityOnChange(value: TicketPriority) {
    if (value === priority) return
    setPriority(value)
    setPriorityError(null)
    startPriorityTransition(async () => {
      const result = await updateTicketAction({ id: ticket.id, field: 'priority', value })
      if (!result.ok) {
        setPriorityError(result.error.message)
        setPriority(priority)
      }
    })
  }

  function saveAssignOnChange(value: string) {
    if (value === assignedUserId) return
    setAssignedUserId(value)
    setAssignError(null)
    if (!value) return // unassign not handled here — use dedicated unassign
    startAssignTransition(async () => {
      const result = await assignTicketAction({ ticketId: ticket.id, toUserId: value })
      if (!result.ok) {
        setAssignError(result.error.message)
        setAssignedUserId(assignedUserId)
      }
    })
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Editar ticket</h2>

      {/* Title */}
      <FieldWrapper
        label="Titulo"
        htmlFor={`ticket-title-${ticket.id}`}
        isPending={isPendingTitle}
        error={titleError}
      >
        <input
          id={`ticket-title-${ticket.id}`}
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitleOnBlur}
          disabled={isPendingTitle}
          className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          aria-label="Titulo do ticket"
          aria-busy={isPendingTitle}
        />
      </FieldWrapper>

      {/* Category */}
      <FieldWrapper
        label="Categoria"
        htmlFor={`ticket-category-${ticket.id}`}
        isPending={isPendingCategory}
        error={categoryError}
      >
        <select
          id={`ticket-category-${ticket.id}`}
          value={category}
          onChange={(e) => saveCategoryOnChange(e.target.value as TicketCategory)}
          disabled={isPendingCategory}
          className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          aria-label="Categoria do ticket"
          aria-busy={isPendingCategory}
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FieldWrapper>

      {/* Priority */}
      <FieldWrapper
        label="Prioridade"
        htmlFor={`ticket-priority-${ticket.id}`}
        isPending={isPendingPriority}
        error={priorityError}
      >
        <select
          id={`ticket-priority-${ticket.id}`}
          value={priority}
          onChange={(e) => savePriorityOnChange(e.target.value as TicketPriority)}
          disabled={isPendingPriority}
          className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          aria-label="Prioridade do ticket"
          aria-busy={isPendingPriority}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FieldWrapper>

      {/* Assigned user */}
      <FieldWrapper
        label="Responsavel"
        htmlFor={`ticket-assigned-${ticket.id}`}
        isPending={isPendingAssign}
        error={assignError}
      >
        <select
          id={`ticket-assigned-${ticket.id}`}
          value={assignedUserId}
          onChange={(e) => saveAssignOnChange(e.target.value)}
          disabled={isPendingAssign}
          className="block w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          aria-label="Responsavel pelo ticket"
          aria-busy={isPendingAssign}
        >
          <option value="">Nao atribuido</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </FieldWrapper>
    </div>
  )
}
