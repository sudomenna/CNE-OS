'use client'

/**
 * AssignToMeButton — botao para atribuir a conversa ao usuario atual.
 * Client Component pequeno que chama a Server Action assign.
 */

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { assign } from '@/app/(app)/inbox/actions'

interface AssignToMeButtonProps {
  conversationId: string
  currentUserId: string
}

export function AssignToMeButton({ conversationId, currentUserId }: AssignToMeButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await assign(conversationId, currentUserId)
      if (!result.ok) {
        setError(result.error.message)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        className="w-full"
      >
        {isPending ? 'Atribuindo…' : 'Atribuir a mim'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
