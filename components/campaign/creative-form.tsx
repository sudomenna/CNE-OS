'use client'

/**
 * CreativeForm — Dialog para criar criativo dentro de uma campanha.
 * Chama Server Action `createCreative` (T-5-04).
 * Spec: docs/20-domain/07-campaign-creative.md §3
 * INV-CAMPAIGN-02: criativo pertence a exatamente 1 campanha.
 * INV-CAMPAIGN-04: novo criativo = novo registro (sem versionamento em Fase 1).
 */

import * as React from 'react'
import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCreative } from '@/app/(app)/campaigns/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { Creative } from '@/lib/db/schema/campaign'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreativeFormProps {
  campaignId: string
  children?: React.ReactNode
}

type FormState = ActionResult<Creative> | null

// ---------------------------------------------------------------------------
// Canais de criativo sugeridos (texto livre — sem enum canônico)
// docs/20-domain/07-campaign-creative.md §3
// ---------------------------------------------------------------------------

const CHANNEL_SUGGESTIONS = [
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'organic_ig', label: 'Instagram Orgânico' },
  { value: 'organic_fb', label: 'Facebook Orgânico' },
  { value: 'email', label: 'E-mail' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'push', label: 'Push Notification' },
]

// ---------------------------------------------------------------------------
// Action wrapper compatible with useActionState
// ---------------------------------------------------------------------------

function makeCreateCreativeAction(campaignId: string) {
  return async function createCreativeAction(
    _prev: FormState,
    formData: FormData,
  ): Promise<FormState> {
    return createCreative({
      campaignId,
      name: formData.get('name'),
      slug: formData.get('slug'),
      channel: formData.get('channel') || null,
    })
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreativeForm({ campaignId, children }: CreativeFormProps) {
  const [open, setOpen] = React.useState(false)
  const actionFn = React.useMemo(
    () => makeCreateCreativeAction(campaignId),
    [campaignId],
  )
  const [state, dispatch, isPending] = useActionState<FormState, FormData>(
    actionFn,
    null,
  )

  React.useEffect(() => {
    if (state?.ok) setOpen(false)
  }, [state])

  const errorMessage = state && !state.ok ? state.error.message : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" variant="outline" size="sm">
            Novo Criativo
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Novo Criativo</DialogTitle>
        </DialogHeader>

        <form action={dispatch} className="mt-4 flex flex-col gap-4">
          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crf-name">Nome</Label>
            <Input
              id="crf-name"
              name="name"
              placeholder="Video Depoimento 01"
              required
              minLength={1}
              maxLength={255}
              autoComplete="off"
            />
          </div>

          {/* Slug */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crf-slug">
              Slug{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (apenas letras, números e hífens)
              </span>
            </Label>
            <Input
              id="crf-slug"
              name="slug"
              placeholder="vid-depoimento-01"
              required
              minLength={1}
              maxLength={100}
              pattern="[a-z0-9-]+"
              autoComplete="off"
            />
          </div>

          {/* Canal */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="crf-channel">
              Canal{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (opcional)
              </span>
            </Label>
            <select
              id="crf-channel"
              name="channel"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Nenhum canal</option>
              {CHANNEL_SUGGESTIONS.map((ch) => (
                <option key={ch.value} value={ch.value}>
                  {ch.label}
                </option>
              ))}
            </select>
          </div>

          {/* Erro */}
          {errorMessage && (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage}
            </p>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Salvando…' : 'Criar criativo'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
