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
      <nav aria-label="Navegacao" className="flex items-center gap-2 text-sm text-slate-500">
        <Link
          href={`/funnels/${funnelId}`}
          className="flex items-center gap-1 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
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
        <span className="text-slate-900 font-medium">Metas</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Metas Comerciais</h1>
          <p className="text-sm text-slate-500 mt-1">
            Funil: <span className="font-medium text-slate-700">{currentFunnel.name}</span>
          </p>
        </div>
        {/* TargetForm inclui o trigger "Nova Meta" internamente */}
        <TargetForm funnelId={funnelId} />
      </div>

      {/* Lista de metas */}
      {targets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 py-16 text-center">
          <p className="text-slate-500 text-sm">Nenhuma meta cadastrada para este funil.</p>
          <p className="text-slate-400 text-xs mt-1">
            Clique em &ldquo;Nova Meta&rdquo; para adicionar a primeira.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Periodo
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Tipo
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                >
                  Valor Alvo
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500"
                  title="Disponivel no Sprint 10 — Analytics"
                >
                  % Atingido
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {targets.map((target) => {
                const hasRevenue = target.targetRevenue !== null
                const hasCount = target.targetCount !== null
                const tipo = hasRevenue && hasCount
                  ? 'Receita + Volume'
                  : hasRevenue
                  ? 'Receita'
                  : 'Volume'

                return (
                  <tr key={target.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700">
                      {formatDate(target.periodStart)} — {formatDate(target.periodEnd)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{tipo}</td>
                    <td className="px-4 py-3 text-right text-slate-900 font-medium tabular-nums">
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
                      className="px-4 py-3 text-right text-slate-400 tabular-nums"
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
      <p className="text-xs text-slate-400">
        * O percentual atingido sera calculado automaticamente a partir dos dados de vendas
        (disponivel no Sprint 10 — Analytics).
      </p>
    </div>
  )
}
