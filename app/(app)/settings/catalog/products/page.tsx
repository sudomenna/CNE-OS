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
          <h1 className="text-2xl font-bold text-slate-900">Produtos</h1>
          <p className="text-sm text-slate-500 mt-1">
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

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de produtos">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Nome</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Slug</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Tipo</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Criado em</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Nenhum produto cadastrado.
                </td>
              </tr>
            ) : (
              products.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.slug}</td>
                  <td className="px-4 py-3 text-slate-600 capitalize">{p.kind.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3">
                    {p.status === 'archived' ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Arquivado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
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
