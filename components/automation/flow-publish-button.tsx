'use client'

/**
 * FlowPublishButton — Botão Publicar/Despublicar para um fluxo de automação.
 * Client Component — chama publishFlow / unpublishFlow via Server Actions.
 * T-11-11 — spec: docs/20-domain/15-automation.md §11
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { publishFlow, unpublishFlow } from '@/app/(app)/automations/actions'

interface FlowPublishButtonProps {
  flowId: string
  isActive: boolean
}

export function FlowPublishButton({ flowId, isActive }: FlowPublishButtonProps) {
  const router = useRouter()
  const [isPending, setIsPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleToggle() {
    setIsPending(true)
    setError(null)
    const action = isActive ? unpublishFlow : publishFlow
    const result = await action({ flowId })
    if (!result.ok) {
      setError(result.error.message)
    } else {
      router.refresh()
    }
    setIsPending(false)
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={isActive ? 'outline' : 'default'}
        size="sm"
        onClick={handleToggle}
        disabled={isPending}
        aria-label={isActive ? 'Despublicar fluxo' : 'Publicar fluxo'}
      >
        {isPending ? 'Aguarde...' : isActive ? 'Despublicar' : 'Publicar'}
      </Button>
      {error && (
        <p role="alert" className="text-xs text-destructive max-w-[200px] text-right">
          {error}
        </p>
      )}
    </div>
  )
}
