'use client'

/**
 * ArchiveOfferButton — botão cliente que chama archiveOfferAction.
 * T-6-18
 */

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { archiveOfferAction } from '@/app/(app)/offers/actions'

interface ArchiveOfferButtonProps {
  offerId: string
}

export function ArchiveOfferButton({ offerId }: ArchiveOfferButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handleArchive() {
    if (!confirm('Tem certeza que deseja arquivar esta oferta?')) return
    startTransition(async () => {
      const result = await archiveOfferAction({ offerId })
      if (!result.ok) {
        alert(result.error?.message ?? 'Erro ao arquivar oferta.')
      }
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleArchive}
      disabled={isPending}
      aria-label="Arquivar oferta"
    >
      {isPending ? 'Arquivando…' : 'Arquivar'}
    </Button>
  )
}
