/**
 * MOD-CATALOG — Página de Categorias de Produto
 * Server Component: lista categorias + Client Components para criar/editar/excluir.
 * Spec: docs/20-domain/09-catalog.md §3.2, T-6-04, T-12-26
 */

import { listCategoriesAction, listBrandsForCategorySelectAction } from './actions'
import { CategoryCreateButton, CategoryEditButton, CategoryDeleteButton } from './categories-client'

export const metadata = {
  title: 'Categorias — Catálogo',
}

export default async function CategoriesPage() {
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de categorias de produto">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Categoria pai</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Criado em</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground/60">
                  Nenhuma categoria cadastrada.
                </td>
              </tr>
            ) : (
              categories.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{cat.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cat.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {cat.parentId ? (
                      <span>{categoryMap.get(cat.parentId) ?? cat.parentId}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(cat.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CategoryEditButton category={cat} categories={categories} />
                      <CategoryDeleteButton categoryId={cat.id} categoryName={cat.name} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
