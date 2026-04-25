/**
 * /offers/new — Criação de oferta.
 * Server Component com formulário Client.
 * T-6-17: UI /offers lista + criação
 * Spec: docs/20-domain/10-offer-engine.md §3.1
 */

import { isNull } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import { brand, legalEntity } from '@/lib/db/schema/organization'
import { Button } from '@/components/ui/button'
import { NewOfferForm } from '@/components/offer/new-offer-form'

export const metadata: Metadata = {
  title: 'Nova Oferta — CNE-OS',
}

export default async function NewOfferPage() {
  const [brands, legalEntities] = await Promise.all([
    db
      .select({ id: brand.id, name: brand.name })
      .from(brand)
      .where(isNull(brand.deletedAt))
      .orderBy(brand.name),

    db
      .select({ id: legalEntity.id, companyName: legalEntity.companyName })
      .from(legalEntity)
      .orderBy(legalEntity.companyName),
  ])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link
          href={'/offers' as Route}
          className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Ofertas
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium">Nova Oferta</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nova Oferta</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preencha os dados básicos. Condições, itens e opções de pagamento são
            configuradas na página de detalhe após a criação.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={'/offers' as Route}>Cancelar</Link>
        </Button>
      </div>

      {/* Formulário */}
      <div className="max-w-2xl">
        <div className="rounded-lg border border-border bg-card p-6">
          <NewOfferForm brands={brands} legalEntities={legalEntities} />
        </div>
      </div>
    </div>
  )
}
