'use client'

/**
 * AssignToMeButton — atribui ticket ao usuario da sessao atual.
 */

import { useTransition } from 'react'
import { assignTicketToMeAction } from '@/app/(app)/tickets/actions'

interface AssignToMeButtonProps {
  ticketId: string
}

export function AssignToMeButton({ ticketId }: AssignToMeButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await assignTicketToMeAction(ticketId)
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 disabled:opacity-50"
    >
      {isPending ? 'Atribuindo...' : 'Atribuir a mim'}
    </button>
  )
}
