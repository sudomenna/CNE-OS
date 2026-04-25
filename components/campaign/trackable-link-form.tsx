'use client'

/**
 * TrackableLinkForm — Dialog para criar link rastreável com preview de UTMs em tempo real.
 * Chama Server Action `issueTrackableLink` (T-5-04).
 * Spec: docs/20-domain/07-campaign-creative.md §9
 * INV-CAMPAIGN-03: slug globalmente único (gerado pelo servidor).
 * INV-CAMPAIGN-04: UTMs deterministas via generateUtm (preview no cliente).
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
import { issueTrackableLink } from '@/app/(app)/campaigns/actions'
import { generateUtm } from '@/lib/domain/campaign/generate-utm'
import type { ActionResult } from '@/lib/actions/result'
import type { TrackableLink } from '@/lib/db/schema/campaign'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreativeOption {
  id: string
  name: string
  slug: string
  channel: string | null
}

interface TrackableLinkFormProps {
  brandId: string
  brandSlug: string
  campaignId: string
  campaignSlug: string
  funnelId: string
  funnelSlug: string
  creatives: CreativeOption[]
  children?: React.ReactNode
}

type FormState = ActionResult<TrackableLink> | null

// ---------------------------------------------------------------------------
// Action wrapper compatible with useActionState
// ---------------------------------------------------------------------------

function makeIssueLinkAction(
  brandId: string,
  brandSlug: string,
  campaignId: string,
  campaignSlug: string,
  funnelId: string,
  funnelSlug: string,
  creatives: CreativeOption[],
) {
  return async function issueLinkAction(
    _prev: FormState,
    formData: FormData,
  ): Promise<FormState> {
    const selectedCreativeId = formData.get('creativeId') as string | null
    const selectedCreative = selectedCreativeId
      ? creatives.find((c) => c.id === selectedCreativeId)
      : null

    return issueTrackableLink({
      brandId,
      brandSlug,
      campaignId,
      campaignSlug,
      funnelId,
      funnelSlug,
      creativeId: selectedCreativeId || null,
      creativeSlug: selectedCreative?.slug ?? null,
      creativeChannel: selectedCreative?.channel ?? null,
      destinationUrl: formData.get('destinationUrl'),
      mediumOverride: formData.get('mediumOverride') || null,
    })
  }
}

// ---------------------------------------------------------------------------
// UTM Preview (purely client-side, INV-CAMPAIGN-04)
// ---------------------------------------------------------------------------

interface UtmPreviewProps {
  brandSlug: string
  campaignSlug: string
  funnelSlug: string
  selectedCreative: CreativeOption | null
  destinationUrl: string
  mediumOverride: string
}

function UtmPreview({
  brandSlug,
  campaignSlug,
  funnelSlug,
  selectedCreative,
  destinationUrl,
  mediumOverride,
}: UtmPreviewProps) {
  // Compute UTMs client-side using the same pure function used server-side
  // INV-CAMPAIGN-04: determinista — mesmos inputs → mesmo output
  const utmCtx: Parameters<typeof generateUtm>[0] = {
    brand: { slug: brandSlug || 'brand' },
    campaign: { slug: campaignSlug || 'campanha' },
  }
  if (funnelSlug) utmCtx.funnel = { slug: funnelSlug }
  if (selectedCreative) {
    const cr: { slug: string; channel?: string } = { slug: selectedCreative.slug }
    if (selectedCreative.channel) cr.channel = selectedCreative.channel
    utmCtx.creative = cr
  }
  if (mediumOverride) utmCtx.mediumOverride = mediumOverride
  const utm = generateUtm(utmCtx)

  // Build preview URL
  let previewUrl = ''
  if (destinationUrl) {
    try {
      const url = new URL(destinationUrl)
      url.searchParams.set('utm_source', utm.utm_source)
      url.searchParams.set('utm_medium', utm.utm_medium)
      url.searchParams.set('utm_campaign', utm.utm_campaign)
      if (utm.utm_content) url.searchParams.set('utm_content', utm.utm_content)
      if (utm.utm_term) url.searchParams.set('utm_term', utm.utm_term)
      previewUrl = url.toString()
    } catch {
      previewUrl = destinationUrl
    }
  }

  return (
    <div className="rounded-md border border-border bg-muted/50 p-3 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Preview UTM
      </p>
      <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        {(
          [
            ['utm_source', utm.utm_source],
            ['utm_medium', utm.utm_medium],
            ['utm_campaign', utm.utm_campaign],
            ['utm_content', utm.utm_content ?? '—'],
            ['utm_term', utm.utm_term ?? '—'],
          ] as [string, string][]
        ).map(([key, val]) => (
          <React.Fragment key={key}>
            <span className="font-mono text-muted-foreground">{key}</span>
            <span className="font-medium text-foreground break-all">{val}</span>
          </React.Fragment>
        ))}
      </div>
      {previewUrl && (
        <div className="mt-2 pt-2 border-t border-border">
          <p className="text-xs text-muted-foreground mb-1">URL final:</p>
          <p className="text-xs font-mono text-muted-foreground break-all leading-relaxed">
            {previewUrl}
          </p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TrackableLinkForm({
  brandId,
  brandSlug,
  campaignId,
  campaignSlug,
  funnelId,
  funnelSlug,
  creatives,
  children,
}: TrackableLinkFormProps) {
  const [open, setOpen] = React.useState(false)

  // UTM preview state
  const [destinationUrl, setDestinationUrl] = React.useState('')
  const [selectedCreativeId, setSelectedCreativeId] = React.useState('')
  const [mediumOverride, setMediumOverride] = React.useState('')

  const selectedCreative =
    creatives.find((c) => c.id === selectedCreativeId) ?? null

  const actionFn = React.useMemo(
    () =>
      makeIssueLinkAction(
        brandId,
        brandSlug,
        campaignId,
        campaignSlug,
        funnelId,
        funnelSlug,
        creatives,
      ),
    [brandId, brandSlug, campaignId, campaignSlug, funnelId, funnelSlug, creatives],
  )

  const [state, dispatch, isPending] = useActionState<FormState, FormData>(
    actionFn,
    null,
  )

  React.useEffect(() => {
    if (state?.ok) {
      setOpen(false)
      // Reset state
      setDestinationUrl('')
      setSelectedCreativeId('')
      setMediumOverride('')
    }
  }, [state])

  const errorMessage = state && !state.ok ? state.error.message : null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button type="button" variant="outline" size="sm">
            Novo Link
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Link Rastreável</DialogTitle>
        </DialogHeader>

        <form action={dispatch} className="mt-4 flex flex-col gap-4">
          {/* URL de destino */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tlf-destinationUrl">URL de destino</Label>
            <Input
              id="tlf-destinationUrl"
              name="destinationUrl"
              type="url"
              placeholder="https://exemplo.com/pagina-de-venda"
              required
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Criativo */}
          {creatives.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tlf-creativeId">
                Criativo{' '}
                <span className="text-xs text-muted-foreground font-normal">
                  (opcional — preenche utm_content e utm_medium)
                </span>
              </Label>
              <select
                id="tlf-creativeId"
                name="creativeId"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={selectedCreativeId}
                onChange={(e) => setSelectedCreativeId(e.target.value)}
              >
                <option value="">Nenhum criativo</option>
                {creatives.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.channel ? ` (${c.channel})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Medium override */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tlf-mediumOverride">
              utm_medium manual{' '}
              <span className="text-xs text-muted-foreground font-normal">
                (opcional — sobrescreve o canal do criativo)
              </span>
            </Label>
            <Input
              id="tlf-mediumOverride"
              name="mediumOverride"
              placeholder="cpc, email, organic…"
              value={mediumOverride}
              onChange={(e) => setMediumOverride(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* UTM Preview em tempo real */}
          <UtmPreview
            brandSlug={brandSlug}
            campaignSlug={campaignSlug}
            funnelSlug={funnelSlug}
            selectedCreative={selectedCreative}
            destinationUrl={destinationUrl}
            mediumOverride={mediumOverride}
          />

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
              {isPending ? 'Gerando…' : 'Gerar link'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
