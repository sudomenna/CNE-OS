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
      className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-card px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {isPending ? 'Atribuindo...' : 'Atribuir a mim'}
    </button>
  )
}
