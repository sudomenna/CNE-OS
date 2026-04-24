'use client'

/**
 * CampaignForm — Dialog para criar campanha.
 * Chama Server Action `createCampaign` (T-5-04).
 * Spec: docs/20-domain/07-campaign-creative.md
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
import { Switch } from '@/components/ui/switch'
import { createCampaign } from '@/app/(app)/campaigns/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { Campaign } from '@/lib/db/schema/campaign'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SelectOption {
  id: string
  name: string
  slug: string
}

interface CampaignFormProps {
  brands: SelectOption[]
  funnels: SelectOption[]
  children?: React.ReactNode
}

type FormState = ActionResult<Campaign> | null

// ---------------------------------------------------------------------------
// Action wrapper compatible with useActionState (prevState, formData)
// ---------------------------------------------------------------------------

async function createCampaignAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const isActive = formData.get('isActive')
  return createCampaign({
    brandId: formData.get('brandId'),
    funnelId: formData.get('funnelId'),
    name: formData.get('name'),
    slug: formData.get('slug'),
    startsAt: formData.get('startsAt') || null,
    endsAt: formData.get('endsAt') || null,
    isActive: isActive === 'on' || isActive === 'true',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignForm({ brands, funnels, children }: CampaignFormProps) {
  const [open, setOpen] = React.useState(false)
  const [state, dispatch, isPending] = useActionState<FormState, FormData>(
    createCampaignAction,
    null,
  )

  // Close dialog on success
  React.useEffect(() => {
    if (state?.ok) {
      setOpen(false)
    }
  }, [state])

  const errorMessage =
    state && !state.ok ? state.error.message : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button">Nova Campanha</Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Nova Campanha</DialogTitle>
        </DialogHeader>

        <form action={dispatch} className="mt-4 flex flex-col gap-4">
          {/* Marca */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-brandId">Marca</Label>
            <select
              id="cf-brandId"
              name="brandId"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione uma marca…</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Funil */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-funnelId">Funil</Label>
            <select
              id="cf-funnelId"
              name="funnelId"
              required
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Selecione um funil…</option>
              {funnels.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>

          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-name">Nome</Label>
            <Input
              id="cf-name"
              name="name"
              placeholder="Black Friday 2026"
              required
              minLength={1}
              maxLength={255}
              autoComplete="off"
            />
          </div>

          {/* Slug */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-slug">
              Slug{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (apenas letras, números e hífens)
              </span>
            </Label>
            <Input
              id="cf-slug"
              name="slug"
              placeholder="black-friday-2026"
              required
              minLength={1}
              maxLength={100}
              pattern="[a-z0-9-]+"
              autoComplete="off"
            />
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-startsAt">Início</Label>
              <Input
                id="cf-startsAt"
                name="startsAt"
                type="datetime-local"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-endsAt">Fim</Label>
              <Input
                id="cf-endsAt"
                name="endsAt"
                type="datetime-local"
              />
            </div>
          </div>

          {/* Ativa */}
          <div className="flex items-center gap-3">
            <Switch id="cf-isActive" name="isActive" defaultChecked />
            <Label htmlFor="cf-isActive">Campanha ativa</Label>
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
              {isPending ? 'Salvando…' : 'Criar campanha'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
