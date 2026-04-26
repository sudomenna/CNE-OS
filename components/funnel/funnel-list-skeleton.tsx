/**
 * FunnelListSkeleton — fallback de Suspense para a grade de cards de funis.
 * Replica a estrutura visual dos cards de funil enquanto os dados carregam.
 * docs/70-ux/09-interaction-patterns.md §2.1
 */

import { Skeleton } from '@/components/ui/skeleton'

interface FunnelListSkeletonProps {
  count?: number
}

export function FunnelListSkeleton({ count = 6 }: FunnelListSkeletonProps) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      aria-busy="true"
      aria-label="Carregando funis"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-5 space-y-4">
          {/* Header: title + badge */}
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-5 w-[60%]" />
            <Skeleton className="h-4 w-12 rounded" />
          </div>
          {/* Slug */}
          <Skeleton className="h-3 w-[40%]" />
          {/* Metrics */}
          <div className="flex gap-6 pt-1">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-8" />
              <Skeleton className="h-3 w-14" />
            </div>
            <div className="flex flex-col gap-1">
              <Skeleton className="h-6 w-8" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * FunnelListEmptyState — estado vazio da lista de funis.
 */
export function FunnelListEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center rounded-lg border border-dashed border-border bg-card">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 text-muted-foreground mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"
        />
      </svg>
      <p className="font-medium text-foreground">Nenhum funil cadastrado</p>
      <p className="text-sm text-muted-foreground mt-1">
        Crie o primeiro funil para começar a gerenciar oportunidades.
      </p>
    </div>
  )
}
