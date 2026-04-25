'use client'

/**
 * PublishOfferButton — botão cliente que chama publishOfferAction.
 * T-6-18
 */

import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { publishOfferAction } from '@/app/(app)/offers/actions'

interface PublishOfferButtonProps {
  offerId: string
}

export function PublishOfferButton({ offerId }: PublishOfferButtonProps) {
  const [isPending, startTransition] = useTransition()

  function handlePublish() {
    startTransition(async () => {
      const result = await publishOfferAction({ offerId })
      if (!result.ok) {
        alert(result.error?.message ?? 'Erro ao publicar oferta.')
      }
    })
  }

  return (
    <Button
      type="button"
      onClick={handlePublish}
      disabled={isPending}
      aria-label="Publicar oferta"
    >
      {isPending ? 'Publicando…' : 'Publicar'}
    </Button>
  )
}
