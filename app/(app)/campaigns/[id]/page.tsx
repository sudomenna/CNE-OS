/**
 * /campaigns/[id] — Detalhe da campanha: lista criativos e links rastreáveis.
 * Server Component — lê DB via Drizzle.
 * T-5-06: detalhe com criativos e links + preview UTM antes de publicar.
 * Spec: docs/20-domain/07-campaign-creative.md
 */

import { and, desc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import { campaign, creative, trackableLink } from '@/lib/db/schema/campaign'
import { brand } from '@/lib/db/schema/organization'
import { funnel } from '@/lib/db/schema/funnel'
import { CreativeForm } from '@/components/campaign/creative-form'
import { TrackableLinkForm } from '@/components/campaign/trackable-link-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import type { Utm } from '@/lib/domain/campaign/generate-utm'

export const metadata = {
  title: 'Detalhe da Campanha — CNE-OS',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CampaignDetailPage({ params }: PageProps) {
  const { id } = await params

  // Fetch campaign with brand + funnel
  const [campaignRow] = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      isActive: campaign.isActive,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      createdAt: campaign.createdAt,
      brandId: campaign.brandId,
      brandName: brand.name,
      brandSlug: brand.slug,
      funnelId: campaign.funnelId,
      funnelName: funnel.name,
      funnelSlug: funnel.slug,
    })
    .from(campaign)
    .innerJoin(brand, eq(brand.id, campaign.brandId))
    .innerJoin(funnel, eq(funnel.id, campaign.funnelId))
    .where(and(eq(campaign.id, id), isNull(campaign.deletedAt)))
    .limit(1)

  if (!campaignRow) {
    notFound()
  }

  // Fetch creatives (non-deleted)
  const creatives = await db
    .select({
      id: creative.id,
      name: creative.name,
      slug: creative.slug,
      channel: creative.channel,
      createdAt: creative.createdAt,
    })
    .from(creative)
    .where(and(eq(creative.campaignId, id), isNull(creative.deletedAt)))
    .orderBy(desc(creative.createdAt))

  // Fetch trackable links for this campaign
  const links = await db
    .select({
      id: trackableLink.id,
      slug: trackableLink.slug,
      destinationUrl: trackableLink.destinationUrl,
      utm: trackableLink.utm,
      createdAt: trackableLink.createdAt,
      creativeId: trackableLink.creativeId,
    })
    .from(trackableLink)
    .where(eq(trackableLink.campaignId, id))
    .orderBy(desc(trackableLink.createdAt))

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={'/campaigns' as Route}
          className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Campanhas
        </Link>
        <span aria-hidden>/</span>
        <span className="text-foreground font-medium">{campaignRow.name}</span>
      </nav>

      {/* Campaign header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">{campaignRow.name}</h1>
            <Badge
              variant={campaignRow.isActive ? 'default' : 'secondary'}
              className={
                campaignRow.isActive
                  ? 'bg-green-100 text-green-700 hover:bg-green-100'
                  : 'bg-muted text-muted-foreground hover:bg-muted'
              }
            >
              {campaignRow.isActive ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>
              Marca:{' '}
              <strong className="font-medium text-muted-foreground">{campaignRow.brandName}</strong>
            </span>
            <span>
              Funil:{' '}
              <strong className="font-medium text-muted-foreground">{campaignRow.funnelName}</strong>
            </span>
            <span className="font-mono text-xs text-muted-foreground/60">{campaignRow.slug}</span>
          </div>
          {(campaignRow.startsAt || campaignRow.endsAt) && (
            <p className="mt-1 text-xs text-muted-foreground/60">
              {campaignRow.startsAt
                ? new Date(campaignRow.startsAt).toLocaleDateString('pt-BR')
                : '—'}
              {' → '}
              {campaignRow.endsAt
                ? new Date(campaignRow.endsAt).toLocaleDateString('pt-BR')
                : '—'}
            </p>
          )}
        </div>
      </div>

      <Separator />

      {/* Creatives section */}
      <section aria-labelledby="creatives-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id="creatives-heading" className="text-lg font-semibold text-foreground">
              Criativos
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {creatives.length} criativo{creatives.length !== 1 ? 's' : ''} — novo criativo = novo
              registro (sem versionamento em Fase 1)
            </p>
          </div>
          <CreativeForm campaignId={campaignRow.id}>
            <Button type="button" variant="outline" size="sm">
              Novo Criativo
            </Button>
          </CreativeForm>
        </div>

        {creatives.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum criativo cadastrado</p>
            <div className="mt-3">
              <CreativeForm campaignId={campaignRow.id}>
                <Button type="button" variant="outline" size="sm">
                  Novo Criativo
                </Button>
              </CreativeForm>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Nome
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                    Slug
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Canal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">
                    Criado em
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {creatives.map((cr) => (
                  <tr key={cr.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-foreground">{cr.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden md:table-cell">
                      {cr.slug}
                    </td>
                    <td className="px-4 py-3">
                      {cr.channel ? (
                        <Badge variant="secondary" className="text-xs">
                          {cr.channel}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground/60 hidden sm:table-cell">
                      <time dateTime={cr.createdAt.toISOString()}>
                        {new Date(cr.createdAt).toLocaleDateString('pt-BR')}
                      </time>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Separator />

      {/* Trackable links section */}
      <section aria-labelledby="links-heading">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 id="links-heading" className="text-lg font-semibold text-foreground">
              Links Rastreáveis
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {links.length} link{links.length !== 1 ? 's' : ''} — slugs globalmente únicos
              (INV-CAMPAIGN-03)
            </p>
          </div>
          <TrackableLinkForm
            brandId={campaignRow.brandId}
            brandSlug={campaignRow.brandSlug}
            campaignId={campaignRow.id}
            campaignSlug={campaignRow.slug}
            funnelId={campaignRow.funnelId}
            funnelSlug={campaignRow.funnelSlug}
            creatives={creatives.map((cr) => ({
              id: cr.id,
              name: cr.name,
              slug: cr.slug,
              channel: cr.channel,
            }))}
          >
            <Button type="button" variant="outline" size="sm">
              Novo Link
            </Button>
          </TrackableLinkForm>
        </div>

        {links.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum link rastreável gerado</p>
            <div className="mt-3">
              <TrackableLinkForm
                brandId={campaignRow.brandId}
                brandSlug={campaignRow.brandSlug}
                campaignId={campaignRow.id}
                campaignSlug={campaignRow.slug}
                funnelId={campaignRow.funnelId}
                funnelSlug={campaignRow.funnelSlug}
                creatives={creatives.map((cr) => ({
                  id: cr.id,
                  name: cr.name,
                  slug: cr.slug,
                  channel: cr.channel,
                }))}
              >
                <Button type="button" variant="outline" size="sm">
                  Novo Link
                </Button>
              </TrackableLinkForm>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {links.map((lk) => {
              const utm = lk.utm as Utm
              const shortUrl = `/go/${lk.slug}`
              const linkedCreative = creatives.find((cr) => cr.id === lk.creativeId)

              return (
                <div
                  key={lk.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-3"
                >
                  {/* URL row */}
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-xs font-semibold text-muted-foreground">URL de destino</p>
                      <a
                        href={lk.destinationUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:underline break-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {lk.destinationUrl}
                      </a>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <p className="text-xs font-semibold text-muted-foreground">Short URL</p>
                      <code className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        {shortUrl}
                      </code>
                    </div>
                  </div>

                  {/* Creative badge */}
                  {linkedCreative && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Criativo:</span>
                      <Badge variant="secondary" className="text-xs">
                        {linkedCreative.name}
                        {linkedCreative.channel ? ` · ${linkedCreative.channel}` : ''}
                      </Badge>
                    </div>
                  )}

                  {/* UTM snapshot */}
                  <div className="rounded-md border border-border bg-muted/50 px-3 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      UTMs
                    </p>
                    <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
                      {(
                        [
                          ['utm_source', utm.utm_source],
                          ['utm_medium', utm.utm_medium],
                          ['utm_campaign', utm.utm_campaign],
                          ...(utm.utm_content
                            ? [['utm_content', utm.utm_content]]
                            : []),
                          ...(utm.utm_term ? [['utm_term', utm.utm_term]] : []),
                        ] as [string, string][]
                      ).map(([key, val]) => (
                        <div key={key} className="contents">
                          <span className="font-mono text-muted-foreground/60">{key}</span>
                          <span className="text-muted-foreground font-medium">{val}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Date */}
                  <p className="text-xs text-muted-foreground/60 text-right">
                    <time dateTime={lk.createdAt.toISOString()}>
                      Gerado em {new Date(lk.createdAt).toLocaleDateString('pt-BR')}
                    </time>
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
