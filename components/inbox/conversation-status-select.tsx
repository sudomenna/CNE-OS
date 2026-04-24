'use client'

/**
 * ConversationStatusSelect — dropdown de status da conversa.
 *
 * Client Component. Chama changeConversationStatus Server Action.
 * docs/20-domain/05-conversation-inbox.md §6 (transições válidas)
 */

import { useState, useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { changeConversationStatus } from '@/app/(app)/inbox/actions'

// Mapeamento público (UI) → domínio está no actions.ts
// Aqui exibimos os rótulos amigáveis.
const STATUS_OPTIONS: {
  value: 'open' | 'waiting_reply' | 'closed'
  label: string
}[] = [
  { value: 'open', label: 'Aberta' },
  { value: 'waiting_reply', label: 'Aguardando resposta' },
  { value: 'closed', label: 'Encerrada' },
]

interface ConversationStatusSelectProps {
  conversationId: string
  currentStatus: 'open' | 'waiting_customer' | 'waiting_team' | 'closed'
}

// Mapeia status do domínio → valor público da UI
function toUiStatus(
  domainStatus: ConversationStatusSelectProps['currentStatus'],
): 'open' | 'waiting_reply' | 'closed' {
  if (domainStatus === 'closed') return 'closed'
  if (domainStatus === 'waiting_customer' || domainStatus === 'waiting_team')
    return 'waiting_reply'
  return 'open'
}

export function ConversationStatusSelect({
  conversationId,
  currentStatus,
}: ConversationStatusSelectProps) {
  const [value, setValue] = useState<'open' | 'waiting_reply' | 'closed'>(
    toUiStatus(currentStatus),
  )
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleChange(next: string) {
    const nextStatus = next as 'open' | 'waiting_reply' | 'closed'
    if (nextStatus === value) return

    setValue(nextStatus)
    setError(null)

    startTransition(async () => {
      const result = await changeConversationStatus(conversationId, nextStatus)
      if (!result.ok) {
        // Reverter valor em caso de erro
        setValue(value)
        setError(result.error.message)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <Select value={value} onValueChange={handleChange} disabled={isPending}>
        <SelectTrigger
          className="w-full text-sm"
          aria-label="Status da conversa"
          aria-busy={isPending}
        >
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  )
}
