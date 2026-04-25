/**
 * MOD-CATALOG — Página de Produtos
 * Server Component: lista produtos + Client Component para criar/arquivar.
 * Spec: docs/20-domain/09-catalog.md §2, T-6-04
 */

import { listProductsAction, listBrandsForSelectAction } from './actions'
import { ProductsClient } from './products-client'

export const metadata = {
  title: 'Produtos — Catálogo',
}

export default async function ProductsPage() {
  const [productsResult, brandsResult] = await Promise.all([
    listProductsAction(),
    listBrandsForSelectAction(),
  ])

  const products = productsResult.ok ? productsResult.data : []
  const brands = brandsResult.ok ? brandsResult.data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie o catálogo de produtos por marca.
          </p>
        </div>
        <ProductsClient brands={brands} mode="create-only" />
      </div>

      {!productsResult.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar os produtos. Tente recarregar a página.
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de produtos">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Criado em</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground/60">
                  Nenhum produto cadastrado.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{p.kind.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    {p.status === 'archived' ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Arquivado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    {p.status === 'active' && (
                      <ProductsClient
                        brands={brands}
                        mode="archive-only"
                        productId={p.id}
                        productName={p.name}
                      />
                    )}
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
