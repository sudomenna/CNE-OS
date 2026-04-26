'use client'

import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { BRANDS_COLUMNS, SETTINGS_BRANDS_TABLE_ID } from './brands-columns'

export interface BrandRow {
  id: string
  name: string
  slug: string
  primaryColor: string | null
  createdAt: Date
  deletedAt: Date | null
}

interface BrandsListProps {
  brands: BrandRow[]
  userId: string
}

export function BrandsList({ brands, userId }: BrandsListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_BRANDS_TABLE_ID,
    userId,
    columns: BRANDS_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_BRANDS_TABLE_ID}
          userId={userId}
          columns={BRANDS_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de marcas">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* name — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Nome
              </th>
              {isVisible('slug') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Slug
                </th>
              )}
              {isVisible('primaryColor') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Cor principal
                </th>
              )}
              {isVisible('createdAt') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Criado em
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {brands.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground/60"
                >
                  Nenhuma marca cadastrada.
                </td>
              </tr>
            ) : (
              brands.map((b) => (
                <tr
                  key={b.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {b.primaryColor && (
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border flex-shrink-0"
                          style={{ backgroundColor: b.primaryColor }}
                          aria-hidden="true"
                        />
                      )}
                      {b.name}
                    </div>
                  </td>
                  {isVisible('slug') && (
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {b.slug}
                    </td>
                  )}
                  {isVisible('primaryColor') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.primaryColor ?? (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      <time dateTime={new Date(b.createdAt).toISOString()}>
                        {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                      </time>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
