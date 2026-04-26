'use client'

/**
 * BenefitsList — client component que renderiza a tabela de benefícios comerciais
 * com suporte a customização de colunas via <ColumnsCustomizer>.
 *
 * Extraído de app/(app)/settings/catalog/benefits/page.tsx (T-16-13).
 */

import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  CatalogBenefitEditForm,
  CatalogBenefitArchiveDialog,
} from '@/components/settings/catalog-benefit-form'
import { BENEFITS_COLUMNS, SETTINGS_BENEFITS_TABLE_ID } from './benefits-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BenefitRow = {
  id: string
  name: string
  slug: string
  description: string | null
  autoTag: string | null
  defaultDurationMonths: number | null
  deliveryStatusRequired: boolean
  status: string
  brandId: string
  createdAt: Date
}

export interface BenefitsListProps {
  rows: BenefitRow[]
  userId: string
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function BenefitsList({ rows, userId }: BenefitsListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_BENEFITS_TABLE_ID,
    userId,
    columns: BENEFITS_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_BENEFITS_TABLE_ID}
          userId={userId}
          columns={BENEFITS_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de benefícios comerciais">
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
              {isVisible('autoTag') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Tag automática
                </th>
              )}
              {isVisible('defaultDurationMonths') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Vigência padrão
                </th>
              )}
              {isVisible('status') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
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
                  Nenhum benefício cadastrado.
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                  {isVisible('slug') && (
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.slug}</td>
                  )}
                  {isVisible('autoTag') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.autoTag ? (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{b.autoTag}</code>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('defaultDurationMonths') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {b.defaultDurationMonths != null ? (
                        `${b.defaultDurationMonths} meses`
                      ) : (
                        <span className="text-muted-foreground/40">Perpétuo</span>
                      )}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td className="px-4 py-3">
                      {b.status === 'archived' ? (
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
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                  )}
                  {/* actions — alwaysVisible */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CatalogBenefitEditForm benefit={b} />
                      {b.status === 'active' && (
                        <CatalogBenefitArchiveDialog
                          benefitId={b.id}
                          benefitName={b.name}
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
