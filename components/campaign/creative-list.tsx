'use client'

import { Badge } from '@/components/ui/badge'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { CREATIVE_COLUMNS, CREATIVES_LIST_TABLE_ID } from './creative-columns'

export interface CreativeRow {
  id: string
  name: string
  slug: string
  channel: string | null
  createdAt: Date
}

interface CreativeListProps {
  creatives: CreativeRow[]
  userId: string
}

export function CreativeList({ creatives, userId }: CreativeListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: CREATIVES_LIST_TABLE_ID,
    userId,
    columns: CREATIVE_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={CREATIVES_LIST_TABLE_ID}
          userId={userId}
          columns={CREATIVE_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm" aria-label="Lista de criativos">
          <thead>
            <tr className="border-b border-border bg-muted/50">
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
              {isVisible('channel') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Canal
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
            {creatives.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Nenhum criativo encontrado.
                </td>
              </tr>
            ) : (
              creatives.map((cr) => (
                <tr key={cr.id} className="hover:bg-muted/50 transition-colors">
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">{cr.name}</td>
                  {isVisible('slug') && (
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {cr.slug}
                    </td>
                  )}
                  {isVisible('channel') && (
                    <td className="px-4 py-3">
                      {cr.channel ? (
                        <Badge variant="secondary" className="text-xs">
                          {cr.channel}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-xs text-muted-foreground/60">
                      <time dateTime={cr.createdAt.toISOString()}>
                        {new Date(cr.createdAt).toLocaleDateString('pt-BR')}
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
