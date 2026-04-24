'use client'

/**
 * AddNoteForm — Client Component formulario de adicao de nota ao ticket.
 *
 * Chama addTicketNoteAction ao submeter.
 */

import { useRef, useTransition } from 'react'
import { addTicketNoteAction } from '@/app/(app)/tickets/actions'

interface AddNoteFormProps {
  ticketId: string
}

export function AddNoteForm({ ticketId }: AddNoteFormProps) {
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    const body = (data.get('body') as string | null)?.trim() ?? ''
    const isInternal = data.get('isInternal') === 'true'

    if (!body) return

    startTransition(async () => {
      const result = await addTicketNoteAction({ ticketId, body, isInternal })
      if (result.ok) {
        formRef.current?.reset()
      }
    })
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="space-y-3 border-t border-slate-200 pt-4"
    >
      <div>
        <label htmlFor={`note-body-${ticketId}`} className="block text-sm font-medium text-slate-700 mb-1">
          Nova nota
        </label>
        <textarea
          id={`note-body-${ticketId}`}
          name="body"
          rows={3}
          required
          placeholder="Escreva uma nota..."
          className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:opacity-50"
          disabled={isPending}
        />
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            name="isInternal"
            value="true"
            defaultChecked
            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
          />
          Nota interna (apenas agentes)
        </label>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
        >
          {isPending ? 'Salvando...' : 'Adicionar nota'}
        </button>
      </div>
    </form>
  )
}
