'use client'

/**
 * TabOpportunities — Client Component
 *
 * Exibe as oportunidades (funnel_entry) do contato com customizador de colunas.
 * tableId: contact:opportunities (ADR-19)
 *
 * Recebe dados como props (fetched no Server Component pai: contacts/[id]/page.tsx).
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §3
 * Task: T-12-11, T-16-14
 */

import Link from 'next/link'
import type { Route } from 'next'
import { GitBranch } from 'lucide-react'

import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import {
  CONTACT_OPPORTUNITIES_TABLE_ID,
  CONTACT_OPPORTUNITIES_COLUMNS,
} from './contact-opportunities-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FunnelOpportunityLabel =
  | 'open'
  | 'negotiating'
  | 'concluded'
  | 'won'
  | 'lost'
  | 'reopened'

export interface OpportunityRow {
  entryId: string
  funnelId: string
  label: FunnelOpportunityLabel
  score: string | number | null
  entryCampaignId: string | null
  createdAt: Date | string
  funnelName: string
  stageName: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const LABEL_BADGE: Record<
  FunnelOpportunityLabel,
  { label: string; className: string }
> = {
  open:        { label: 'Aberta',     className: 'bg-blue-100 text-blue-800 border-blue-200' },
  negotiating: { label: 'Negociando', className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  concluded:   { label: 'Concluída',  className: 'bg-purple-100 text-purple-800 border-purple-200' },
  won:         { label: 'Ganha',      className: 'bg-green-100 text-green-800 border-green-200' },
  lost:        { label: 'Perdida',    className: 'bg-red-100 text-red-800 border-red-200' },
  reopened:    { label: 'Reaberta',   className: 'bg-orange-100 text-orange-800 border-orange-200' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TabOpportunitiesProps {
  contactId: string
  userId: string
  rows: OpportunityRow[]
}

export function TabOpportunities({ contactId, userId, rows }: TabOpportunitiesProps) {
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: CONTACT_OPPORTUNITIES_TABLE_ID,
    userId,
    columns: CONTACT_OPPORTUNITIES_COLUMNS,
  })

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-16 text-center">
        <GitBranch
          className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
          aria-hidden="true"
        />
        <p className="text-sm font-medium text-muted-foreground">
          Nenhuma oportunidade encontrada
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Este contato ainda não entrou em nenhum funil.
        </p>
        <div className="mt-4">
          <Link
            href={`/funnels?add_contact=${contactId}` as Route}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            Adicionar ao funil
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar com customizador de colunas */}
      <div className="flex items-center justify-end">
        <ColumnsCustomizer
          tableId={CONTACT_OPPORTUNITIES_TABLE_ID}
          userId={userId}
          columns={CONTACT_OPPORTUNITIES_COLUMNS}
          visibleColumnIds={visibleColumnIds}
          onToggle={toggle}
          onReset={reset}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full caption-bottom text-sm"
          aria-label="Oportunidades do contato"
        >
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {/* funnel — alwaysVisible */}
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Funil
              </th>
              {isVisible('stage') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Estágio atual
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
              {isVisible('score') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Score
                </th>
              )}
              {isVisible('campaign') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Campanha
                </th>
              )}
              {isVisible('createdAt') && (
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Entrada
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {rows.map((row) => {
              const badge = LABEL_BADGE[row.label] ?? {
                label: row.label,
                className: 'bg-muted text-muted-foreground border-border',
              }

              const scoreDisplay =
                row.score != null
                  ? String(Math.round(Number(row.score)))
                  : '—'

              return (
                <tr
                  key={row.entryId}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* Funil — alwaysVisible; link para o board */}
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/funnels/${row.funnelId}` as Route}
                      className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {row.funnelName}
                    </Link>
                  </td>

                  {isVisible('stage') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.stageName}
                    </td>
                  )}

                  {isVisible('status') && (
                    <td className="px-4 py-3">
                      <span
                        className={[
                          'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
                          badge.className,
                        ].join(' ')}
                      >
                        {badge.label}
                      </span>
                    </td>
                  )}

                  {isVisible('score') && (
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {scoreDisplay}
                    </td>
                  )}

                  {isVisible('campaign') && (
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.entryCampaignId ?? '—'}
                    </td>
                  )}

                  {isVisible('createdAt') && (
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <time dateTime={new Date(row.createdAt).toISOString()}>
                        {formatDate(row.createdAt)}
                      </time>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* CTA rodapé */}
      <div className="flex justify-end">
        <Link
          href={`/funnels?add_contact=${contactId}` as Route}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
          Adicionar ao funil
        </Link>
      </div>
    </div>
  )
}
