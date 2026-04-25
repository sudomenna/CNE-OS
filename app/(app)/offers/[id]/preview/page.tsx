/**
 * /offers/[id]/preview — Preview/Simulador de Oferta
 *
 * Server Component: carrega nome da oferta e renderiza <DecisionPreview>.
 * Breadcrumb: Ofertas / [nome da oferta] / Preview
 *
 * T-6-21 — spec: docs/20-domain/10-offer-engine.md §11
 */

import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import { offer } from '@/lib/db/schema/offer'
import { DecisionPreview } from '@/components/offer/decision-preview'

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [row] = await db
    .select({ name: offer.name })
    .from(offer)
    .where(eq(offer.id, id))
    .limit(1)

  if (!row) return { title: 'Oferta não encontrada — CNE-OS' }
  return { title: `Preview: ${row.name} — CNE-OS` }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function OfferPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [offerRow] = await db
    .select({
      id: offer.id,
      name: offer.name,
      slug: offer.slug,
      status: offer.status,
    })
    .from(offer)
    .where(eq(offer.id, id))
    .limit(1)

  if (!offerRow) notFound()

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação" className="text-sm text-muted-foreground">
        <Link
          href={'/offers' as Route}
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          Ofertas
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <Link
          href={`/offers/${offerRow.id}` as Route}
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          {offerRow.name}
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-foreground font-medium">Preview</span>
      </nav>

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Simulador de decisão
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Oferta:{' '}
          <span className="font-medium text-muted-foreground">{offerRow.name}</span>
          {' · '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-muted-foreground">
            {offerRow.slug}
          </code>
        </p>
      </div>

      {/* Simulador */}
      <DecisionPreview offerId={offerRow.id} />
    </div>
  )
}
