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
import { FunnelListClient } from '@/components/funnel/funnel-list-client'

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

export default function FunnelsPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Funis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie seus funis de vendas e acompanhe as oportunidades.
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg border border-border bg-card p-5 h-36"
              />
            ))}
          </div>
        }
      >
        <FunnelList />
      </Suspense>
    </div>
  )
}
