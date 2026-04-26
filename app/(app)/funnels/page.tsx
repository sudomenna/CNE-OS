/**
 * /funnels — Lista todos os funis ativos da organização
 *
 * Server Component + Dialog para criar funil novo (Client).
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * Roadmap: T-5-13
 */

import { Suspense } from 'react'
import { eq, isNull, count } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { funnel, funnelStage, funnelEntry } from '@/lib/db/schema/funnel'
import { brand } from '@/lib/db/schema/organization'
import { FunnelListClient } from '@/components/funnel/funnel-list-client'
import { CreateFunnelDialog } from '@/components/funnel/create-funnel-dialog'
import { FunnelListSkeleton } from '@/components/funnel/funnel-list-skeleton'

export const metadata = {
  title: 'Funis — CNE-OS',
}

export const dynamic = 'force-dynamic'

async function FunnelList() {
  // Busca funis ativos com contagem de estágios e oportunidades ativas
  const funnels = await db
    .select({
      id: funnel.id,
      name: funnel.name,
      slug: funnel.slug,
      brandId: funnel.brandId,
      isActive: funnel.isActive,
      createdAt: funnel.createdAt,
    })
    .from(funnel)
    .where(isNull(funnel.deletedAt))
    .orderBy(funnel.createdAt)

  // Para cada funil, busca contagem de estágios e oportunidades ativas
  const funnelsWithCounts = await Promise.all(
    funnels.map(async (f) => {
      const [stageCount, entryCount] = await Promise.all([
        db
          .select({ count: count() })
          .from(funnelStage)
          .where(eq(funnelStage.funnelId, f.id))
          .then((r) => r[0]?.count ?? 0),
        db
          .select({ count: count() })
          .from(funnelEntry)
          .where(eq(funnelEntry.funnelId, f.id))
          .then((r) => r[0]?.count ?? 0),
      ])
      return { ...f, stageCount, entryCount }
    }),
  )

  return <FunnelListClient funnels={funnelsWithCounts} />
}

async function fetchBrands() {
  return db
    .select({ id: brand.id, name: brand.name })
    .from(brand)
    .where(isNull(brand.deletedAt))
    .orderBy(brand.name)
}

export default async function FunnelsPage() {
  const brands = await fetchBrands()

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Funis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seus funis de vendas e acompanhe as oportunidades.
          </p>
        </div>
        <CreateFunnelDialog brands={brands} />
      </div>

      <Suspense fallback={<FunnelListSkeleton count={6} />}>
        <FunnelList />
      </Suspense>
    </div>
  )
}
