'use client'

/**
 * ProductsList — client component que renderiza a tabela de produtos do catálogo
 * com suporte a customização de colunas via <ColumnsCustomizer>.
 *
 * Extraído de app/(app)/settings/catalog/products/page.tsx (T-16-13).
 */

import Link from 'next/link'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  CatalogProductEditForm,
  CatalogProductArchiveDialog,
  type ProductFormCategory,
} from '@/components/settings/catalog-product-form'
import { PRODUCTS_COLUMNS, SETTINGS_PRODUCTS_TABLE_ID } from './products-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProductRow = {
  id: string
  name: string
  slug: string
  kind: string
  status: string
  categoryId: string | null
  description: string | null
  brandId: string
  createdAt: Date
}

export type { ProductFormCategory }

export interface ProductsListProps {
  rows: ProductRow[]
  categories: ProductFormCategory[]
  offerCounts: Record<string, number>
  userId: string
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function ProductsList({ rows, categories, offerCounts, userId }: ProductsListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_PRODUCTS_TABLE_ID,
    userId,
    columns: PRODUCTS_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_PRODUCTS_TABLE_ID}
          userId={userId}
          columns={PRODUCTS_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de produtos">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* name — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Nome
              </th>
              {isVisible('slug') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Slug
                </th>
              )}
              {isVisible('kind') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Tipo
                </th>
              )}
              {isVisible('status') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
              )}
              {isVisible('offers') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Ofertas
                </th>
              )}
              {isVisible('createdAt') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Criado em
                </th>
              )}
              {/* actions — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground/60"
                >
                  Nenhum produto cadastrado.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">{p.name}</td>
                  {isVisible('slug') && (
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.slug}</td>
                  )}
                  {isVisible('kind') && (
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {p.kind.replace(/_/g, ' ')}
                    </td>
                  )}
                  {isVisible('status') && (
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
                  )}
                  {isVisible('offers') && (
                    <td className="px-4 py-3">
                      {(offerCounts[p.id] ?? 0) > 0 ? (
                        <Link
                          href={('/settings/catalog/products/' + p.id) as never}
                          className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full hover:bg-blue-100"
                        >
                          {offerCounts[p.id]} oferta{offerCounts[p.id] === 1 ? '' : 's'}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  )}
                  {/* actions — alwaysVisible */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CatalogProductEditForm
                        product={p}
                        categories={categories}
                      />
                      {p.status === 'active' && (
                        <CatalogProductArchiveDialog
                          productId={p.id}
                          productName={p.name}
                        />
                      )}
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
