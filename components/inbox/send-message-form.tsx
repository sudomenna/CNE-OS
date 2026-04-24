'use client'

/**
 * SendMessageForm — formulário de envio de mensagem outbound.
 *
 * Client Component com Textarea + botão. Chama sendMessage Server Action.
 * docs/20-domain/05-conversation-inbox.md §FLOW-INBOX-REPLY
 */

import { useRef, useState, useTransition } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { sendMessage } from '@/app/(app)/inbox/actions'

interface SendMessageFormProps {
  conversationId: string
}

export function SendMessageForm({ conversationId }: SendMessageFormProps) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = body.trim()
    if (!trimmed) return

    setError(null)

    startTransition(async () => {
      const result = await sendMessage(conversationId, trimmed)
      if (!result.ok) {
        setError(result.error.message)
      } else {
        setBody('')
        textareaRef.current?.focus()
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter ou Cmd+Enter envia
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      void handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-slate-200 bg-white p-3 flex flex-col gap-2"
      aria-label="Enviar mensagem"
    >
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <Textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Digite sua mensagem… (Ctrl+Enter para enviar)"
        aria-label="Corpo da mensagem"
        rows={3}
        disabled={isPending}
        className="resize-none text-sm"
      />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={isPending || body.trim().length === 0}
          aria-busy={isPending}
        >
          {isPending ? 'Enviando…' : 'Enviar'}
        </Button>
      </div>
    </form>
  )
}
