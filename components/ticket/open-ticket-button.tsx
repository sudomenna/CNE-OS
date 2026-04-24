'use client'

/**
 * OpenTicketButton — Client Component para abrir ticket a partir de conversa (ou standalone).
 *
 * Uso: <OpenTicketButton conversationId={id} contactId={id} brandId={id} />
 *
 * Abre um Dialog (shadcn) com formulario minimo e chama openTicketAction.
 * docs/20-domain/06-ticket.md §9 FLOW-TICKET-FROM-CONVERSATION
 */

import { useState, useTransition } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { openTicketAction } from '@/app/(app)/tickets/actions'

const CATEGORY_OPTIONS = [
  { value: 'commercial', label: 'Comercial' },
  { value: 'support', label: 'Suporte' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'cancellation', label: 'Cancelamento' },
  { value: 'refund', label: 'Reembolso' },
  { value: 'access', label: 'Acesso' },
  { value: 'registration', label: 'Cadastro' },
  { value: 'other', label: 'Outro' },
] as const

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
] as const

interface OpenTicketButtonProps {
  contactId: string
  brandId: string
  conversationId?: string
  /** Label customizada para o botao trigger. Padrao: "Abrir ticket" */
  label?: string
}

export function OpenTicketButton({
  contactId,
  brandId,
  conversationId,
  label = 'Abrir ticket',
}: OpenTicketButtonProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const title = (data.get('title') as string | null)?.trim() ?? ''
    const category = data.get('category') as string
    const priority = data.get('priority') as string
    const description = (data.get('description') as string | null)?.trim() || undefined

    if (!title || !category || !priority) return

    setError(null)

    startTransition(async () => {
      const result = await openTicketAction({
        contactId,
        brandId,
        category,
        priority,
        title,
        description,
        ...(conversationId ? { originConversationId: conversationId } : {}),
      })

      if (result.ok) {
        setOpen(false)
      } else {
        setError(result.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900"
        >
          {label}
        </button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Abrir ticket</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Title */}
          <div>
            <label htmlFor="ot-title" className="block text-sm font-medium text-slate-700 mb-1">
              Titulo <span aria-hidden="true">*</span>
            </label>
            <input
              id="ot-title"
              name="title"
              type="text"
              required
              maxLength={255}
              placeholder="Descreva o problema..."
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
              disabled={isPending}
            />
          </div>

          {/* Category */}
          <div>
            <label htmlFor="ot-category" className="block text-sm font-medium text-slate-700 mb-1">
              Categoria <span aria-hidden="true">*</span>
            </label>
            <select
              id="ot-category"
              name="category"
              required
              defaultValue=""
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
              disabled={isPending}
            >
              <option value="" disabled>
                Selecione...
              </option>
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label htmlFor="ot-priority" className="block text-sm font-medium text-slate-700 mb-1">
              Prioridade <span aria-hidden="true">*</span>
            </label>
            <select
              id="ot-priority"
              name="priority"
              required
              defaultValue="medium"
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
              disabled={isPending}
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Description (optional) */}
          <div>
            <label htmlFor="ot-description" className="block text-sm font-medium text-slate-700 mb-1">
              Descricao (opcional)
            </label>
            <textarea
              id="ot-description"
              name="description"
              rows={2}
              placeholder="Detalhes adicionais..."
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
              disabled={isPending}
            />
          </div>

          {/* Error message */}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
            >
              {isPending ? 'Abrindo...' : 'Abrir ticket'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
