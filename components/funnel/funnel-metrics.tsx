/**
 * FunnelMetrics — Server Component
 *
 * Exibe 3 métricas do funil:
 *   1. Abertas — COUNT(funnel_entry) WHERE status active (label NOT IN won/lost)
 *   2. Conversão 30d — COUNT(won) / COUNT(*) * 100 WHERE closed_at >= now()-30d
 *   3. Score médio — AVG(score) WHERE label='won' (estimativa de valor/qualidade)
 *
 * Spec: docs/70-ux/05-screen-funnel-board.md §2.1
 * T-12-20
 */

import { and, count, eq, gte, inArray, not, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { funnelEntry } from '@/lib/db/schema/funnel'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FunnelMetricsProps {
  funnelId: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function MetricCard({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string | undefined
}) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground uppercase tracking-wide leading-tight">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold text-foreground tabular-nums leading-tight">
          {value}
        </span>
        {unit && (
          <span className="text-sm text-muted-foreground leading-tight">{unit}</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export async function FunnelMetrics({ funnelId }: FunnelMetricsProps) {
  // 1. Abertas (label NOT IN ('won', 'lost'))
  const [openResult] = await db
    .select({ total: count() })
    .from(funnelEntry)
    .where(
      and(
        eq(funnelEntry.funnelId, funnelId),
        not(inArray(funnelEntry.label, ['won', 'lost'])),
      ),
    )

  const openCount = openResult?.total ?? 0

  // 2. Conversão 30d — won / (won + lost) WHERE updatedAt >= now()-30d
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [wonResult] = await db
    .select({ total: count() })
    .from(funnelEntry)
    .where(
      and(
        eq(funnelEntry.funnelId, funnelId),
        eq(funnelEntry.label, 'won'),
        gte(funnelEntry.updatedAt, thirtyDaysAgo),
      ),
    )

  const [closedResult] = await db
    .select({ total: count() })
    .from(funnelEntry)
    .where(
      and(
        eq(funnelEntry.funnelId, funnelId),
        inArray(funnelEntry.label, ['won', 'lost']),
        gte(funnelEntry.updatedAt, thirtyDaysAgo),
      ),
    )

  const wonCount = wonResult?.total ?? 0
  const closedCount = closedResult?.total ?? 0
  const conversionPct =
    closedCount > 0
      ? ((wonCount / closedCount) * 100).toFixed(1)
      : '—'
  const conversionDisplay = closedCount > 0 ? `${conversionPct}` : '—'
  const conversionUnit: string | undefined = closedCount > 0 ? '%' : undefined

  // 3. Score médio das ganhas (proxy de valor estimado)
  const [scoreResult] = await db
    .select({ avg: sql<string>`AVG(${funnelEntry.score})` })
    .from(funnelEntry)
    .where(
      and(eq(funnelEntry.funnelId, funnelId), eq(funnelEntry.label, 'won')),
    )

  const avgScore = scoreResult?.avg ? parseFloat(scoreResult.avg).toFixed(0) : '—'

  return (
    <div
      className="grid grid-cols-3 gap-3"
      role="region"
      aria-label="Métricas do funil"
    >
      <MetricCard label="Abertas" value={String(openCount)} />
      <MetricCard
        label="Conversão 30d"
        value={conversionDisplay}
        {...(conversionUnit !== undefined ? { unit: conversionUnit } : {})}
      />
      <MetricCard label="Score médio (ganhas)" value={avgScore} />
    </div>
  )
}
