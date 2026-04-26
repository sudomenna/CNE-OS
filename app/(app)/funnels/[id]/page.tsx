/**
 * /funnels/[id] — Kanban do funil
 *
 * Server Component: carrega funil + estágios + oportunidades ativas (com contato).
 * Lê cookie `cne_pref_funnel_view` para estado inicial do toggle Board/Lista.
 * Renderiza <FunnelMetrics> (métricas) + <FunnelBoardClient> (wrapper client).
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * UX: docs/70-ux/05-screen-funnel-board.md §2, §3
 * Roadmap: T-12-20
 */

import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import { eq, and, isNull, not, inArray } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { funnel, funnelStage, funnelEntry } from '@/lib/db/schema/funnel'
import { contact } from '@/lib/db/schema/contact'
import { FunnelMetrics } from '@/components/funnel/funnel-metrics'
import { FunnelBoardClient } from '@/components/funnel/funnel-board-client'
import type { KanbanFunnel } from '@/components/funnel/kanban'

export const dynamic = 'force-dynamic'

interface FunnelDetailPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | undefined>>
}

export async function generateMetadata({ params }: FunnelDetailPageProps) {
  const { id } = await params
  const [row] = await db
    .select({ name: funnel.name })
    .from(funnel)
    .where(and(eq(funnel.id, id), isNull(funnel.deletedAt)))
    .limit(1)

  return {
    title: row ? `${row.name} — Funis | CNE-OS` : 'Funil | CNE-OS',
  }
}

export default async function FunnelDetailPage({
  params,
  searchParams,
}: FunnelDetailPageProps) {
  const { id } = await params
  const sp = await searchParams

  // ---- Lê cookie de preferência de vista ----
  const cookieStore = await cookies()
  const prefCookie = cookieStore.get('cne_pref_funnel_view')
  const initialView: 'board' | 'list' =
    prefCookie?.value === 'list' ? 'list' : 'board'

  // ---- Filtros via searchParams ----
  const assignee = sp.assignee ?? null
  const dateFrom = sp.dateFrom ?? null
  const dateTo = sp.dateTo ?? null

  // ---- Carrega funil ----
  const [funnelRow] = await db
    .select()
    .from(funnel)
    .where(and(eq(funnel.id, id), isNull(funnel.deletedAt)))
    .limit(1)

  if (!funnelRow) {
    notFound()
  }

  // ---- Carrega estágios ordenados por position ----
  const stages = await db
    .select()
    .from(funnelStage)
    .where(eq(funnelStage.funnelId, id))
    .orderBy(funnelStage.position)

  // ---- Carrega oportunidades ativas (label NOT IN ('won','lost')) com contato ----
  const entries = await db
    .select({
      id: funnelEntry.id,
      funnelId: funnelEntry.funnelId,
      contactId: funnelEntry.contactId,
      currentStageId: funnelEntry.currentStageId,
      label: funnelEntry.label,
      score: funnelEntry.score,
      entryDate: funnelEntry.entryDate,
      updatedAt: funnelEntry.updatedAt,
      contactName: contact.fullName,
    })
    .from(funnelEntry)
    .innerJoin(contact, eq(contact.id, funnelEntry.contactId))
    .where(
      and(
        eq(funnelEntry.funnelId, id),
        not(inArray(funnelEntry.label, ['won', 'lost'])),
      ),
    )
    .orderBy(funnelEntry.entryDate)

  const kanbanData: KanbanFunnel = {
    funnel: {
      id: funnelRow.id,
      name: funnelRow.name,
      slug: funnelRow.slug,
    },
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      isTerminal: s.isTerminal,
    })),
    entries: entries.map((e) => ({
      id: e.id,
      contactId: e.contactId,
      currentStageId: e.currentStageId,
      label: e.label,
      score: e.score,
      entryDate: e.entryDate.toISOString(),
      contactName: e.contactName ?? 'Contato sem nome',
    })),
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Cabeçalho */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-card">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-1">
          <a href="/funnels" className="hover:text-foreground transition-colors">
            Funis
          </a>
          <span className="mx-2" aria-hidden="true">
            /
          </span>
          <span className="text-foreground font-medium">{funnelRow.name}</span>
        </nav>
        <h1 className="text-xl font-semibold text-foreground">{funnelRow.name}</h1>
      </div>

      {/* Métricas */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border bg-muted/30">
        <FunnelMetrics funnelId={id} />
      </div>

      {/* Filtros + Board/Lista — Client wrapper */}
      <FunnelBoardClient
        kanbanData={kanbanData}
        initialView={initialView}
        assignee={assignee}
        dateFrom={dateFrom}
        dateTo={dateTo}
      />
    </div>
  )
}
