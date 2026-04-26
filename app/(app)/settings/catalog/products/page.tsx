/**
 * MOD-CATALOG — Página de Produtos
 * Server Component: lista produtos + formulários de criar/editar/arquivar.
 * Spec: docs/20-domain/09-catalog.md §2, T-6-04, T-12-26, T-16-13
 */

import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { listProductsAction, listBrandsForSelectAction, listCategoriesForSelectAction, getProductOfferCountsAction } from './actions'
import { CatalogProductCreateForm } from '@/components/settings/catalog-product-form'
import { ProductsList } from '@/components/settings/products-list'

export const metadata = {
  title: 'Produtos — Catálogo',
}

export default async function ProductsPage() {
  let ctx
  try {
    ctx = await requireSession()
  } catch {
    redirect('/login')
  }

  const [productsResult, brandsResult, categoriesResult] = await Promise.all([
    listProductsAction(),
    listBrandsForSelectAction(),
    listCategoriesForSelectAction(),
  ])

  const products = productsResult.ok ? productsResult.data : []
  const brands = brandsResult.ok ? brandsResult.data : []
  const categories = categoriesResult.ok ? categoriesResult.data : []

  const offerCounts = await getProductOfferCountsAction(products.map((p) => p.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie o catálogo de produtos por marca.
          </p>
        </div>
        <CatalogProductCreateForm brands={brands} categories={categories} />
      </div>

      {!productsResult.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar os produtos. Tente recarregar a página.
        </div>
      )}

      <ProductsList
        rows={products}
        categories={categories}
        offerCounts={offerCounts}
        userId={ctx.user.id}
      />
    </div>
  )
}
