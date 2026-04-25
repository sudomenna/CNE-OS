'use client'

/**
 * MOD-INTEGRATIONS / T-8-17 — Botão "Reprocessar" para webhook DLQ
 *
 * Client Component (interatividade: loading state, confirmação, toast).
 * Visível APENAS para status 'failed'|'dead_letter' com papel admin|financial.
 *
 * FLOW-12 §5
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { reprocessWebhook } from '@/app/(app)/settings/webhooks/actions'

type ReprocessButtonProps = {
  webhookLogId: string
  status: string
  canReprocess: boolean
}

export function ReprocessButton({ webhookLogId, status, canReprocess }: ReprocessButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // FLOW-12: botão só disponível para status failed ou dead_letter + RBAC OK
  const isReprocessable = status === 'failed' || status === 'dead_letter'
  if (!isReprocessable || !canReprocess) return null

  async function handleReprocess() {
    const confirmed = window.confirm(
      'Confirmar reprocessamento deste webhook? O evento será re-enfileirado no Inngest.',
    )
    if (!confirmed) return

    setLoading(true)
    setError(null)
    setSuccess(false)

    const result = await reprocessWebhook({ id: webhookLogId })

    if (!result.ok) {
      // Mapear códigos de erro para mensagem amigável
      if (result.error.code === 'UNAUTHORIZED') {
        setError('Sem permissão para reprocessar. Verifique seu papel e 2FA.')
      } else if (result.error.code === 'CONFLICT') {
        setError('Este webhook não pode ser reprocessado no estado atual.')
      } else {
        setError('Erro ao reprocessar. Tente novamente.')
      }
      setLoading(false)
      return
    }

    setSuccess(true)
    // Redireciona para lista com feedback visual após breve pausa
    setTimeout(() => {
      router.push('/settings/webhooks')
    }, 1000)
  }

  return (
    <div className="space-y-2">
      <Button
        onClick={handleReprocess}
        disabled={loading || success}
        variant="destructive"
        size="sm"
        aria-busy={loading}
        aria-label="Reprocessar este webhook"
      >
        {loading ? 'Reprocessando...' : success ? 'Reprocessado!' : 'Reprocessar'}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {success && (
        <p role="status" className="text-sm text-green-600">
          Webhook re-enfileirado com sucesso. Redirecionando...
        </p>
      )}
    </div>
  )
}
