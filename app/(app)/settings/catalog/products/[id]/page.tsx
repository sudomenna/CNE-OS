/**
 * MOD-CATALOG — Página de detalhe de produto
 * Server Component: exibe dados do produto + tabela de ofertas que o contêm.
 * Spec: docs/20-domain/09-catalog.md §2, T-14-04
 */

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { product } from '@/lib/db/schema/catalog'
import { offer, offerCondition, offerConditionItem } from '@/lib/db/schema/offer'
import { requireSession } from '@/lib/auth/session'

export const metadata = {
  title: 'Detalhe do Produto — Catálogo',
}

// ---------------------------------------------------------------------------
// Helpers de badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  if (status === 'archived') {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Arquivado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Ativo
    </span>
  )
}

function OfferStatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    draft: 'bg-muted text-muted-foreground',
    paused: 'bg-amber-100 text-amber-700',
    archived: 'bg-muted text-muted-foreground/60',
  }
  const label: Record<string, string> = {
    active: 'Ativa',
    draft: 'Rascunho',
    paused: 'Pausada',
    archived: 'Arquivada',
  }
  const cls = variants[status] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label[status] ?? status}
    </span>
  )
}

function KindBadge({ kind }: { kind: string }) {
  const variants: Record<string, string> = {
    main: 'bg-blue-900 text-blue-100',
    bonus: 'bg-green-700 text-green-50',
    upsell: 'bg-orange-500 text-white',
    order_bump: 'bg-purple-600 text-purple-50',
    complement: 'bg-cyan-600 text-cyan-50',
  }
  const label: Record<string, string> = {
    main: 'Principal',
    bonus: 'Bônus',
    upsell: 'Upsell',
    order_bump: 'Order Bump',
    complement: 'Complemento',
  }
  const cls = variants[kind] ?? 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {label[kind] ?? kind}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession()
  const { id } = await params

  // Busca produto
  const [prod] = await db
    .select({
      id: product.id,
      name: product.name,
      slug: product.slug,
      kind: product.kind,
      status: product.status,
      categoryId: product.categoryId,
      description: product.description,
      brandId: product.brandId,
      createdAt: product.createdAt,
    })
    .from(product)
    .where(eq(product.id, id))
    .limit(1)

  if (!prod) {
    notFound()
  }

  // Busca ofertas que contêm este produto via offer_condition_item
  // JOIN: offer_condition_item → offer_condition → offer
  // Agrupa por (offerId, offerName, offerStatus) e coleta os kinds distintos
  const usageRows = await db
    .select({
      offerId: offer.id,
      offerName: offer.name,
      offerStatus: offer.status,
      itemKind: offerConditionItem.kind,
    })
    .from(offerConditionItem)
    .innerJoin(offerCondition, eq(offerConditionItem.offerConditionId, offerCondition.id))
    .innerJoin(offer, eq(offerCondition.offerId, offer.id))
    .where(eq(offerConditionItem.productId, prod.id))

  // Agrupa por oferta, deduplica kinds
  const offerMap = new Map<
    string,
    { offerId: string; offerName: string; offerStatus: string; kinds: Set<string> }
  >()
  for (const row of usageRows) {
    const existing = offerMap.get(row.offerId)
    if (existing) {
      existing.kinds.add(row.itemKind)
    } else {
      offerMap.set(row.offerId, {
        offerId: row.offerId,
        offerName: row.offerName,
        offerStatus: row.offerStatus,
        kinds: new Set([row.itemKind]),
      })
    }
  }
  const offerUsages = Array.from(offerMap.values())

  const kindLabel: Record<string, string> = {
    course: 'Curso',
    ebook: 'E-book',
    training_online: 'Treinamento Online',
    training_in_person: 'Treinamento Presencial',
    mentoring: 'Mentoria',
    bonus: 'Bônus',
    other: 'Outro',
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground flex items-center gap-1.5" aria-label="Breadcrumb">
        <Link href="/settings" className="hover:underline">
          Configurações
        </Link>
        <span>/</span>
        <Link href="/settings/catalog/products" className="hover:underline">
          Produtos
        </Link>
        <span>/</span>
        <span className="text-foreground font-medium">{prod.name}</span>
      </nav>

      {/* Cabeçalho */}
      <div className="rounded-lg border border-border bg-card px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{prod.name}</h1>
              <StatusBadge status={prod.status} />
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground capitalize">
                {kindLabel[prod.kind] ?? prod.kind.replace(/_/g, ' ')}
              </span>
            </div>
            <p className="text-sm font-mono text-muted-foreground">{prod.slug}</p>
            {prod.description && (
              <p className="text-sm text-muted-foreground mt-2">{prod.description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de ofertas */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Ofertas que contêm este produto</h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm" aria-label="Ofertas que contêm o produto">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Nome da oferta
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Usado como
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {offerUsages.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="text-center py-12 text-muted-foreground/60">
                      Este produto ainda não está em nenhuma oferta.
                    </div>
                  </td>
                </tr>
              ) : (
                offerUsages.map((usage) => (
                  <tr
                    key={usage.offerId}
                    className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{usage.offerName}</td>
                    <td className="px-4 py-3">
                      <OfferStatusBadge status={usage.offerStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Array.from(usage.kinds)
                          .filter((k) => k !== 'commercial_benefit')
                          .map((k) => (
                            <KindBadge key={k} kind={k} />
                          ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/offers/${usage.offerId}`}
                        className="text-sm text-muted-foreground hover:text-foreground hover:underline transition-colors"
                      >
                        Ver oferta →
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
