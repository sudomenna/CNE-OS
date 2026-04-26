'use client'

/**
 * CategoriesList — client component que renderiza a tabela de categorias do catálogo
 * com suporte a customização de colunas via <ColumnsCustomizer>.
 *
 * Extraído de app/(app)/settings/catalog/categories/page.tsx (T-16-13).
 */

import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  CategoryEditButton,
  CategoryDeleteButton,
} from '@/app/(app)/settings/catalog/categories/categories-client'
import { CATEGORIES_COLUMNS, SETTINGS_CATEGORIES_TABLE_ID } from './categories-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CategoryRow = {
  id: string
  name: string
  slug: string
  brandId: string
  parentId: string | null
  createdAt: Date
}

export interface CategoriesListProps {
  rows: CategoryRow[]
  categoryMap: Map<string, string>
  userId: string
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function CategoriesList({ rows, categoryMap, userId }: CategoriesListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_CATEGORIES_TABLE_ID,
    userId,
    columns: CATEGORIES_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_CATEGORIES_TABLE_ID}
          userId={userId}
          columns={CATEGORIES_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de categorias de produto">
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
              {isVisible('parentCategory') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Categoria pai
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
                  Nenhuma categoria cadastrada.
                </td>
              </tr>
            ) : (
              rows.map((cat) => (
                <tr
                  key={cat.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">{cat.name}</td>
                  {isVisible('slug') && (
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cat.slug}</td>
                  )}
                  {isVisible('parentCategory') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {cat.parentId ? (
                        <span>{categoryMap.get(cat.parentId) ?? cat.parentId}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(cat.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  )}
                  {/* actions — alwaysVisible */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CategoryEditButton category={cat} categories={rows} />
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
