/**
 * /campaigns — Lista de campanhas.
 * Server Component — lê DB via Drizzle.
 * T-5-06: UI campanhas lista + criação.
 * Spec: docs/20-domain/07-campaign-creative.md
 */

import { desc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import { campaign } from '@/lib/db/schema/campaign'
import { brand } from '@/lib/db/schema/organization'
import { funnel } from '@/lib/db/schema/funnel'
import { CampaignForm } from '@/components/campaign/campaign-form'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Campanhas — CNE-OS',
}

export default async function CampaignsPage() {
  // Fetch campaigns (non-deleted), most recent first
  const campaigns = await db
    .select({
      id: campaign.id,
      name: campaign.name,
      slug: campaign.slug,
      isActive: campaign.isActive,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      createdAt: campaign.createdAt,
      brandName: brand.name,
      brandSlug: brand.slug,
      funnelName: funnel.name,
      funnelSlug: funnel.slug,
    })
    .from(campaign)
    .innerJoin(brand, eq(brand.id, campaign.brandId))
    .innerJoin(funnel, eq(funnel.id, campaign.funnelId))
    .where(isNull(campaign.deletedAt))
    .orderBy(desc(campaign.createdAt))
    .limit(200)

  // Fetch brands and funnels for the creation form selects
  const [brands, funnels] = await Promise.all([
    db
      .select({ id: brand.id, name: brand.name, slug: brand.slug })
      .from(brand)
      .where(isNull(brand.deletedAt))
      .orderBy(brand.name),
    db
      .select({ id: funnel.id, name: funnel.name, slug: funnel.slug })
      .from(funnel)
      .where(isNull(funnel.deletedAt))
      .orderBy(funnel.name),
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campanhas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize suas ações de marketing e gere links rastreáveis com UTMs canônicas.
          </p>
        </div>
        <CampaignForm brands={brands} funnels={funnels}>
          <Button type="button">Nova Campanha</Button>
        </CampaignForm>
      </div>

      {/* Lista */}
      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">Nenhuma campanha cadastrada</p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Crie a primeira campanha para começar a rastrear suas ações.
          </p>
          <div className="mt-4">
            <CampaignForm brands={brands} funnels={funnels}>
              <Button type="button" variant="outline" size="sm">
                Nova Campanha
              </Button>
            </CampaignForm>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Campanha
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">
                  Funil
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden lg:table-cell">
                  Período
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">
                  Criada em
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`/campaigns/${c.id}` as Route}
                        className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-muted-foreground/60">{c.brandName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs hidden md:table-cell">
                    {c.slug}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                    {c.funnelName}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                    {c.startsAt || c.endsAt ? (
                      <>
                        {c.startsAt
                          ? new Date(c.startsAt).toLocaleDateString('pt-BR')
                          : '—'}
                        {' → '}
                        {c.endsAt
                          ? new Date(c.endsAt).toLocaleDateString('pt-BR')
                          : '—'}
                      </>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={c.isActive ? 'default' : 'secondary'}
                      className={
                        c.isActive
                          ? 'bg-green-100 text-green-700 hover:bg-green-100'
                          : 'bg-muted text-muted-foreground hover:bg-muted'
                      }
                    >
                      {c.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground/60 hidden sm:table-cell">
                    <time dateTime={c.createdAt.toISOString()}>
                      {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                    </time>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/campaigns/${c.id}` as Route}
                      className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                      aria-label={`Ver detalhes da campanha ${c.name}`}
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
