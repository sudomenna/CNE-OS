/**
 * /offers — Lista de ofertas.
 * Server Component — lê DB via Drizzle.
 * T-6-17: UI /offers lista + criação
 * Spec: docs/20-domain/10-offer-engine.md
 */

import { and, desc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import { offer } from '@/lib/db/schema/offer'
import { brand } from '@/lib/db/schema/organization'
import { Button } from '@/components/ui/button'
import { OfferList } from '@/components/offer/offer-list'

export const metadata = {
  title: 'Ofertas — CNE-OS',
}

interface SearchParams {
  brand_id?: string
  status?: string
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const brandIdFilter = params.brand_id ?? ''
  const statusFilter = params.status ?? ''

  // Construir condições dinâmicas
  const conditions = []
  if (brandIdFilter) {
    conditions.push(eq(offer.brandId, brandIdFilter))
  }
  if (
    statusFilter &&
    ['draft', 'active', 'paused', 'archived'].includes(statusFilter)
  ) {
    conditions.push(
      eq(
        offer.status,
        statusFilter as 'draft' | 'active' | 'paused' | 'archived',
      ),
    )
  }

  const [offers, brands] = await Promise.all([
    db
      .select({
        id: offer.id,
        name: offer.name,
        slug: offer.slug,
        status: offer.status,
        createdAt: offer.createdAt,
        brandId: offer.brandId,
        brandName: brand.name,
      })
      .from(offer)
      .innerJoin(brand, eq(brand.id, offer.brandId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(offer.createdAt))
      .limit(200),

    db
      .select({ id: brand.id, name: brand.name })
      .from(brand)
      .where(isNull(brand.deletedAt))
      .orderBy(brand.name),
  ])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ofertas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gerencie as ofertas comerciais e suas condições de elegibilidade.
          </p>
        </div>
        <Button asChild>
          <Link href={'/offers/new' as Route}>Nova Oferta</Link>
        </Button>
      </div>

      {/* Lista com filtros */}
      <OfferList
        offers={offers}
        brands={brands}
        selectedBrandId={brandIdFilter}
        selectedStatus={statusFilter}
      />
    </div>
  )
}
