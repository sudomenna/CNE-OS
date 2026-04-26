'use client'

/**
 * ReclassifyAllButton — botão de bulk reclassify na listagem de contatos.
 * Chama reclassifyAllContactsAction (BR-CONTACT-CLASSIFICATION) com confirmação.
 * Guard server-side: contact.bulk_edit (admin/financial/support/commercial).
 */

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { reclassifyAllContactsAction } from '@/app/(app)/contacts/actions'

export function ReclassifyAllButton() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      const result = await reclassifyAllContactsAction()
      if (!result.ok) {
        toast.error(result.error.message ?? 'Falha ao reclassificar contatos.')
        return
      }
      const { total, changed } = result.data
      if (changed === 0) {
        toast.success(`Todas as ${total} classificações já estavam corretas.`)
      } else {
        toast.success(
          `${changed} de ${total} contato(s) reclassificado(s).`,
        )
      }
      setOpen(false)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="default"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="gap-2"
      >
        <RefreshCw
          className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`}
          aria-hidden="true"
        />
        Atualizar Classificações
      </Button>

      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="Atualizar classificações de todos os contatos?"
        description="Recalcula a classificação (lead/customer/student/mentorado) de todos os contatos com base nas transações vigentes. Mudanças são registradas em contact_status_history. Operação idempotente."
        requiredText="ATUALIZAR"
        confirmLabel="Atualizar"
        variant="default"
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </>
  )
}
