'use client'

import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { LEGAL_ENTITIES_COLUMNS, SETTINGS_LEGAL_ENTITIES_TABLE_ID } from './legal-entities-columns'

/** Formata CNPJ numérico para exibição: XX.XXX.XXX/XXXX-XX */
function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
}

export interface LegalEntityRow {
  id: string
  cnpj: string
  companyName: string
  tradeName: string | null
  createdAt: Date
  brandId: string | null
  isDefault: boolean | null
  brandName: string | null
  brandSlug: string | null
}

interface LegalEntitiesListProps {
  entities: LegalEntityRow[]
  userId: string
}

export function LegalEntitiesList({ entities, userId }: LegalEntitiesListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_LEGAL_ENTITIES_TABLE_ID,
    userId,
    columns: LEGAL_ENTITIES_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_LEGAL_ENTITIES_TABLE_ID}
          userId={userId}
          columns={LEGAL_ENTITIES_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de entidades fiscais">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* cnpj — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                CNPJ
              </th>
              {isVisible('companyName') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Razão social
                </th>
              )}
              {isVisible('tradeName') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Nome fantasia
                </th>
              )}
              {isVisible('brand') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Marca
                </th>
              )}
              {isVisible('isDefault') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Padrão
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entities.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground/60"
                >
                  Nenhuma entidade fiscal cadastrada.
                </td>
              </tr>
            ) : (
              entities.map((e) => (
                <tr
                  key={e.id}
                  className="hover:bg-muted/50 transition-colors"
                >
                  {/* cnpj — alwaysVisible */}
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {formatCnpj(e.cnpj)}
                  </td>
                  {isVisible('companyName') && (
                    <td className="px-4 py-3 font-medium text-foreground">
                      {e.companyName}
                    </td>
                  )}
                  {isVisible('tradeName') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.tradeName ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                  )}
                  {isVisible('brand') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {e.brandName ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                  )}
                  {isVisible('isDefault') && (
                    <td className="px-4 py-3">
                      {e.isDefault ? (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                          Padrão
                        </span>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
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
