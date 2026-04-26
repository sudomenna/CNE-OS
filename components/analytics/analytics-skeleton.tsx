/**
 * AnalyticsSkeleton — fallback de Suspense genérico para dashboards de analytics.
 * Replica a estrutura visual de: metric cards (linha superior) + chart placeholder.
 * docs/70-ux/09-interaction-patterns.md §2.1
 */

import { Skeleton } from '@/components/ui/skeleton'

interface AnalyticsSkeletonProps {
  /** Número de metric cards na linha superior (default: 5 — igual ao OverviewCards) */
  metricCount?: number
  /** Incluir placeholder de gráfico abaixo dos metric cards */
  showChart?: boolean
}

export function AnalyticsSkeleton({ metricCount = 5, showChart = true }: AnalyticsSkeletonProps) {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando analytics">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: metricCount }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
            {/* Label */}
            <Skeleton className="h-3 w-[65%]" />
            {/* Value */}
            <Skeleton className="h-7 w-[80%]" />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      {showChart && (
        <div className="rounded-lg border bg-card p-4 shadow-sm space-y-3">
          {/* Chart title */}
          <Skeleton className="h-4 w-40" />
          {/* Chart area */}
          <Skeleton className="h-52 w-full rounded-md" />
        </div>
      )}
    </div>
  )
}
