/**
 * TabOpportunities — Server Component
 *
 * Exibe as oportunidades (funnel_entry) do contato.
 * Busca: funnel_entry WHERE contact_id = contactId
 *        JOIN funnel (nome), funnel_stage (estágio atual)
 * ORDER BY created_at DESC, LIMIT 50
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §3
 * Task: T-12-11
 */
import Link from 'next/link'
import type { Route } from 'next'
import { eq, desc } from 'drizzle-orm'
import { GitBranch } from 'lucide-react'

import { db } from '@/lib/db/client'
import { funnelEntry, funnel, funnelStage } from '@/lib/db/schema/funnel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FunnelOpportunityLabel = typeof funnelEntry.$inferSelect['label']

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Formata data no padrão dd/MM/yyyy */
function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// Cores dos badges por label — Acessibilidade AA garantida por contraste
const LABEL_BADGE: Record<
  FunnelOpportunityLabel,
  { label: string; className: string }
> = {
  open:        { label: 'Aberta',       className: 'bg-blue-100 text-blue-800 border-blue-200' },
  negotiating: { label: 'Negociando',   className: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  concluded:   { label: 'Concluída',    className: 'bg-purple-100 text-purple-800 border-purple-200' },
  won:         { label: 'Ganha',        className: 'bg-green-100 text-green-800 border-green-200' },
  lost:        { label: 'Perdida',      className: 'bg-red-100 text-red-800 border-red-200' },
  reopened:    { label: 'Reaberta',     className: 'bg-orange-100 text-orange-800 border-orange-200' },
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface TabOpportunitiesProps {
  contactId: string
}

export async function TabOpportunities({ contactId }: TabOpportunitiesProps) {
  // -------------------------------------------------------------------------
  // Query: funnel_entry JOIN funnel + funnel_stage, filtrando por contact_id
  // Limita 50, mais recentes primeiro
  // -------------------------------------------------------------------------
  const rows = await db
    .select({
      entryId:     funnelEntry.id,
      funnelId:    funnelEntry.funnelId,
      label:       funnelEntry.label,
      score:       funnelEntry.score,
      entryCampaignId: funnelEntry.entryCampaignId,
      createdAt:   funnelEntry.createdAt,
      funnelName:  funnel.name,
      stageName:   funnelStage.name,
    })
    .from(funnelEntry)
    .innerJoin(funnel,      eq(funnelEntry.funnelId,       funnel.id))
    .innerJoin(funnelStage, eq(funnelEntry.currentStageId, funnelStage.id))
    .where(eq(funnelEntry.contactId, contactId))
    .orderBy(desc(funnelEntry.createdAt))
    .limit(50)

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Table
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table
          className="w-full caption-bottom text-sm"
          aria-label="Oportunidades do contato"
        >
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Funil
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Estágio atual
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Score
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Campanha
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Entrada
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-background">
            {rows.map((row) => {
              const badge = LABEL_BADGE[row.label] ?? {
                label: row.label,
                className: 'bg-muted text-muted-foreground border-border',
              }

              // Score exibido como inteiro
              const scoreDisplay = row.score != null
                ? String(Math.round(Number(row.score)))
                : '—'

              return (
                <tr
                  key={row.entryId}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* Funil — link para o board */}
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      href={`/funnels/${row.funnelId}` as Route}
                      className="hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {row.funnelName}
                    </Link>
                  </td>

                  {/* Estágio atual */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.stageName}
                  </td>

                  {/* Badge de status */}
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

                  {/* Score */}
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {scoreDisplay}
                  </td>

                  {/* Campanha */}
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.entryCampaignId ?? '—'}
                  </td>

                  {/* Data de entrada */}
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    <time dateTime={new Date(row.createdAt).toISOString()}>
                      {formatDate(row.createdAt)}
                    </time>
                  </td>
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
