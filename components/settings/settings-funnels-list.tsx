'use client'

/**
 * SettingsFunnelsList — client component que renderiza a tabela de funis de configuração
 * com suporte a customização de colunas via <ColumnsCustomizer>.
 *
 * Nota: este componente é para a página /settings/funnels (configuração de funis),
 * distinto de components/funnel/ (oportunidades operacionais em kanban).
 *
 * Extraído de app/(app)/settings/funnels/page.tsx (T-16-13).
 */

import { GitMerge } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { FunnelConfigSheet } from '@/components/settings/funnel-config-sheet'
import { SETTINGS_FUNNELS_COLUMNS, SETTINGS_FUNNELS_TABLE_ID } from './settings-funnels-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SettingsFunnelRow = {
  id: string
  name: string
  brandName: string
  stageCount: number | bigint
  isActive: boolean
}

export interface SettingsFunnelsListProps {
  rows: SettingsFunnelRow[]
  userId: string
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function SettingsFunnelsList({ rows, userId }: SettingsFunnelsListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: SETTINGS_FUNNELS_TABLE_ID,
    userId,
    columns: SETTINGS_FUNNELS_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={SETTINGS_FUNNELS_TABLE_ID}
          userId={userId}
          columns={SETTINGS_FUNNELS_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de funis">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              {/* name — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Nome
              </th>
              {isVisible('brand') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Marca
                </th>
              )}
              {isVisible('stageCount') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Estágios
                </th>
              )}
              {isVisible('status') && (
                <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Status
                </th>
              )}
              {/* actions — alwaysVisible */}
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-3 text-muted-foreground/60">
                    <GitMerge className="h-8 w-8" aria-hidden="true" />
                    <p className="text-sm">Nenhum funil configurado.</p>
                    <p className="text-xs">
                      Crie o primeiro funil usando o botão acima.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3 font-medium text-foreground">
                    {f.name}
                  </td>
                  {isVisible('brand') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {f.brandName || <span className="text-muted-foreground/40">—</span>}
                    </td>
                  )}
                  {isVisible('stageCount') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {Number(f.stageCount)} estágio{Number(f.stageCount) !== 1 ? 's' : ''}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td className="px-4 py-3">
                      {f.isActive ? (
                        <Badge variant="default" className="text-xs">
                          Ativo
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </td>
                  )}
                  {/* actions — alwaysVisible */}
                  <td className="px-4 py-3 text-right">
                    <FunnelConfigSheet funnelId={f.id} funnelName={f.name} />
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
