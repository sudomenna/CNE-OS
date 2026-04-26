'use client'

/**
 * CancelSubscriptionButton — botão de cancelamento de assinatura.
 * Client Component (usa Server Action cancelSubscriptionAction + transition).
 * T-9-14: docs/20-domain/13-subscription-billing.md §6.1
 *
 * Visível apenas para admin/financial (RBAC verificado no Server Action).
 * T-12-32: migrado para ConfirmActionDialog com confirmação textual.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { cancelSubscriptionAction } from '@/app/(app)/billing/actions'

interface CancelSubscriptionButtonProps {
  subscriptionId: string
}

export function CancelSubscriptionButton({ subscriptionId }: CancelSubscriptionButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      // BR-BILLING: cancelamento de assinatura é irreversível via UI; requer confirmação explícita
      const result = await cancelSubscriptionAction({ subscriptionId, reason: 'Cancelado pelo administrador via UI' })
      if (result.ok) {
        setDialogOpen(false)
        router.refresh()
      } else {
        setError(`Erro ao cancelar: ${result.error.message}`)
      }
    })
  }

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setDialogOpen(true)}
        aria-label="Cancelar assinatura"
      >
        Cancelar assinatura
      </Button>

      {error && (
        <p role="alert" className="text-xs text-red-700 mt-1">
          {error}
        </p>
      )}

      {/* Confirmação textual — cancelamento é irreversível */}
      <ConfirmActionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Cancelar assinatura?"
        description="Esta ação cancelará a assinatura imediatamente. Cobranças futuras serão interrompidas. O acesso ao produto pode ser revogado de acordo com a política vigente. Esta operação não pode ser desfeita via sistema."
        requiredText="CONFIRMAR"
        confirmLabel="Cancelar assinatura"
        onConfirm={handleConfirm}
        isPending={isPending}
        variant="destructive"
      />
    </>
  )
}
