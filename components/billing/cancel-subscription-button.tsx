'use client'

/**
 * CancelSubscriptionButton — botão de cancelamento de assinatura.
 * Client Component (usa Server Action cancelSubscriptionAction + transition).
 * T-9-14: docs/20-domain/13-subscription-billing.md §6.1
 *
 * Visível apenas para admin/financial (RBAC verificado no Server Action).
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cancelSubscriptionAction } from '@/app/(app)/billing/actions'

interface CancelSubscriptionButtonProps {
  subscriptionId: string
}

export function CancelSubscriptionButton({ subscriptionId }: CancelSubscriptionButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleConfirm() {
    if (!reason.trim()) {
      setError('Informe o motivo do cancelamento.')
      return
    }
    setError(null)

    startTransition(async () => {
      const result = await cancelSubscriptionAction({ subscriptionId, reason: reason.trim() })
      if (result.ok) {
        setShowConfirm(false)
        router.refresh()
      } else {
        setError(`Erro ao cancelar: ${result.error.message}`)
      }
    })
  }

  if (!showConfirm) {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setShowConfirm(true)}
        aria-label="Cancelar assinatura"
      >
        Cancelar assinatura
      </Button>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-dialog-title"
      className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3"
    >
      <h3
        id="cancel-dialog-title"
        className="text-sm font-semibold text-red-800"
      >
        Confirmar cancelamento
      </h3>
      <div className="space-y-1">
        <label
          htmlFor="cancel-reason"
          className="text-xs font-medium text-red-700"
        >
          Motivo <span aria-hidden="true">*</span>
        </label>
        <textarea
          id="cancel-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Informe o motivo do cancelamento..."
          className="w-full rounded-md border border-red-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-required="true"
          aria-describedby={error ? 'cancel-error' : undefined}
        />
        {error && (
          <p id="cancel-error" role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          onClick={handleConfirm}
          disabled={isPending}
          aria-label="Confirmar cancelamento"
        >
          {isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setShowConfirm(false)
            setError(null)
            setReason('')
          }}
          disabled={isPending}
          aria-label="Voltar sem cancelar"
        >
          Voltar
        </Button>
      </div>
    </div>
  )
}
