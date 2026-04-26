/**
 * MOD-CATALOG — Página de Categorias de Produto
 * Server Component: lista categorias + Client Components para criar/editar/excluir.
 * Spec: docs/20-domain/09-catalog.md §3.2, T-6-04, T-12-26, T-16-13
 */

import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { listCategoriesAction, listBrandsForCategorySelectAction } from './actions'
import { CategoryCreateButton } from './categories-client'
import { CategoriesList } from '@/components/settings/categories-list'

export const metadata = {
  title: 'Categorias — Catálogo',
}

export default async function CategoriesPage() {
  let ctx
  try {
    ctx = await requireSession()
  } catch {
    redirect('/login')
  }

  const [categoriesResult, brandsResult] = await Promise.all([
    listCategoriesAction(),
    listBrandsForCategorySelectAction(),
  ])

  const categories = categoriesResult.ok ? categoriesResult.data : []
  const brands = brandsResult.ok ? brandsResult.data : []

  // Monta mapa id→name para exibir pai
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categorias</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize os produtos em categorias hierárquicas por marca.
          </p>
        </div>
        <CategoryCreateButton brands={brands} categories={categories} />
      </div>

      {!categoriesResult.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar as categorias. Tente recarregar a página.
        </div>
      )}

      <CategoriesList
        rows={categories}
        categoryMap={categoryMap}
        userId={ctx.user.id}
      />
    </div>
  )
}
