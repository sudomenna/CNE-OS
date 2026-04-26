/**
 * /campaigns — Lista de campanhas.
 * Server Component — lê DB via Drizzle.
 * T-5-06: UI campanhas lista + criação.
 * T-16-09: extração da tabela para CampaignList (client component com ColumnsCustomizer).
 * Spec: docs/20-domain/07-campaign-creative.md
 */

import { desc, eq, isNull } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { campaign } from '@/lib/db/schema/campaign'
import { brand } from '@/lib/db/schema/organization'
import { funnel } from '@/lib/db/schema/funnel'
import { requireSession } from '@/lib/auth/session'
import { CampaignForm } from '@/components/campaign/campaign-form'
import { CampaignList } from '@/components/campaign/campaign-list'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Campanhas — CNE-OS',
}

export default async function CampaignsPage() {
  // Obter userId para namespacing das preferências de colunas (ADR-19)
  const session = await requireSession().catch(() => null)
  const userId = session?.user.id ?? 'anonymous'

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
      funnelName: funnel.name,
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
        <CampaignList campaigns={campaigns} userId={userId} />
      )}
    </div>
  )
}
