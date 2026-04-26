'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { CAMPAIGN_COLUMNS, CAMPAIGNS_LIST_TABLE_ID } from './campaign-columns'

export interface CampaignRow {
  id: string
  name: string
  slug: string
  isActive: boolean
  startsAt: Date | null
  endsAt: Date | null
  createdAt: Date
  brandName: string
  funnelName: string
}

interface CampaignListProps {
  campaigns: CampaignRow[]
  userId: string
}

export function CampaignList({ campaigns, userId }: CampaignListProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: CAMPAIGNS_LIST_TABLE_ID,
    userId,
    columns: CAMPAIGN_COLUMNS,
  })

  return (
    <div className="space-y-2">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={CAMPAIGNS_LIST_TABLE_ID}
          userId={userId}
          columns={CAMPAIGN_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm" aria-label="Lista de campanhas">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {/* name — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Campanha
              </th>
              {isVisible('slug') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Slug
                </th>
              )}
              {isVisible('funnel') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Funil
                </th>
              )}
              {isVisible('period') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Período
                </th>
              )}
              {isVisible('status') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Status
                </th>
              )}
              {isVisible('createdAt') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Criada em
                </th>
              )}
              {/* actions — alwaysVisible */}
              <th scope="col" className="w-10 px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {campaigns.length === 0 ? (
              <tr>
                <td
                  colSpan={visibleColumnIds.size}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  Nenhuma campanha encontrada.
                </td>
              </tr>
            ) : (
              campaigns.map((c) => (
                <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                  {/* name — alwaysVisible */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <Link
                        href={`/campaigns/${c.id}` as Route}
                        className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-muted-foreground/60">{c.brandName}</span>
                    </div>
                  </td>
                  {isVisible('slug') && (
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {c.slug}
                    </td>
                  )}
                  {isVisible('funnel') && (
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.funnelName}</td>
                  )}
                  {isVisible('period') && (
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {c.startsAt || c.endsAt ? (
                        <>
                          {c.startsAt
                            ? new Date(c.startsAt).toLocaleDateString('pt-BR')
                            : '—'}
                          {' → '}
                          {c.endsAt
                            ? new Date(c.endsAt).toLocaleDateString('pt-BR')
                            : '—'}
                        </>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                  )}
                  {isVisible('status') && (
                    <td className="px-4 py-3">
                      <Badge
                        variant={c.isActive ? 'default' : 'secondary'}
                        className={
                          c.isActive
                            ? 'bg-green-100 text-green-700 hover:bg-green-100'
                            : 'bg-muted text-muted-foreground hover:bg-muted'
                        }
                      >
                        {c.isActive ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </td>
                  )}
                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-xs text-muted-foreground/60">
                      <time dateTime={c.createdAt.toISOString()}>
                        {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                      </time>
                    </td>
                  )}
                  {/* actions — alwaysVisible */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/campaigns/${c.id}` as Route}
                      className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                      aria-label={`Ver detalhes da campanha ${c.name}`}
                    >
                      Ver
                    </Link>
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
