/**
 * /funnels/[id]/targets — Metas comerciais do funil
 *
 * Módulo: MOD-FUNNEL
 * Spec: docs/20-domain/08-funnel-opportunity.md §3
 * Tarefa: T-5-14
 *
 * Server Component: lê sales_target via Drizzle (ownership do módulo).
 * OQ-SPRINT5-02: % atingido calculado em query; hoje exibido como placeholder "—" (Sprint 10).
 */

import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { db } from '@/lib/db/client'
import { funnel, salesTarget } from '@/lib/db/schema/funnel'
import { TargetForm } from '@/components/funnel/target-form'

// ---------------------------------------------------------------------------
// Metadata dinâmica
// ---------------------------------------------------------------------------

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const rows = await db.select({ name: funnel.name }).from(funnel).where(eq(funnel.id, id))
  const name = rows[0]?.name ?? 'Funil'
  return { title: `Metas — ${name} — CNE-OS` }
}

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function formatDate(raw: string): string {
  // raw vem como string ISO do Drizzle (date column)
  const [year, month, day] = raw.split('-')
  return `${day}/${month}/${year}`
}

function formatRevenue(value: string | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value))
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function FunnelTargetsPage({ params }: PageProps) {
  const { id: funnelId } = await params

  // Valida existência do funil
  const funnelRows = await db
    .select({ id: funnel.id, name: funnel.name })
    .from(funnel)
    .where(eq(funnel.id, funnelId))

  const currentFunnel = funnelRows[0]
  if (!currentFunnel) {
    notFound()
  }

  // Lista metas ordenadas por period_start DESC
  const targets = await db
    .select()
    .from(salesTarget)
    .where(eq(salesTarget.funnelId, funnelId))
    .orderBy(desc(salesTarget.periodStart))

  return (
    <div className="space-y-6">
      {/* Breadcrumb / navegacao */}
      <nav aria-label="Navegacao" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href={`/funnels/${funnelId}`}
          className="flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          Voltar ao funil
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium">Metas</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Metas Comerciais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Funil: <span className="font-medium text-muted-foreground">{currentFunnel.name}</span>
          </p>
        </div>
        {/* TargetForm inclui o trigger "Nova Meta" internamente */}
        <TargetForm funnelId={funnelId} />
      </div>

      {/* Lista de metas */}
      {targets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-muted-foreground text-sm">Nenhuma meta cadastrada para este funil.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">
            Clique em &ldquo;Nova Meta&rdquo; para adicionar a primeira.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Periodo
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Tipo
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Valor Alvo
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  title="Disponivel no Sprint 10 — Analytics"
                >
                  % Atingido
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-card">
              {targets.map((target) => {
                const hasRevenue = target.targetRevenue !== null
                const hasCount = target.targetCount !== null
                const tipo = hasRevenue && hasCount
                  ? 'Receita + Volume'
                  : hasRevenue
                  ? 'Receita'
                  : 'Volume'

                return (
                  <tr key={target.id} className="hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(target.periodStart)} — {formatDate(target.periodEnd)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{tipo}</td>
                    <td className="px-4 py-3 text-right text-foreground font-medium tabular-nums">
                      {hasRevenue && hasCount ? (
                        <span>
                          {formatRevenue(target.targetRevenue)} /{' '}
                          {target.targetCount} vendas
                        </span>
                      ) : hasRevenue ? (
                        formatRevenue(target.targetRevenue)
                      ) : (
                        <span>{target.targetCount} vendas</span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-right text-muted-foreground/60 tabular-nums"
                      aria-label="Percentual atingido indisponivel ate Sprint 10"
                    >
                      —
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Nota sobre analytics */}
      <p className="text-xs text-muted-foreground/60">
        * O percentual atingido sera calculado automaticamente a partir dos dados de vendas
        (disponivel no Sprint 10 — Analytics).
      </p>
    </div>
  )
}
