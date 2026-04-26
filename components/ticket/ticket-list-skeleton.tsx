/**
 * TicketListSkeleton — fallback de Suspense para a lista de tickets.
 * Replica a estrutura visual do TicketCard enquanto os dados carregam.
 * docs/70-ux/09-interaction-patterns.md §2.1
 */

import { Skeleton } from '@/components/ui/skeleton'

interface TicketListSkeletonProps {
  rows?: number
}

export function TicketListSkeleton({ rows = 7 }: TicketListSkeletonProps) {
  return (
    <ul className="space-y-2" aria-busy="true" aria-label="Carregando tickets">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
        >
          {/* Left: number + title + badges */}
          <div className="flex min-w-0 flex-col gap-2 flex-1">
            <div className="flex items-center gap-2">
              {/* Ticket number */}
              <Skeleton className="h-3.5 w-8 shrink-0" />
              {/* Title */}
              <Skeleton className="h-4 w-[55%]" />
            </div>
            {/* Badge row */}
            <div className="flex gap-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-18 rounded-full" />
            </div>
          </div>

          {/* Right: avatar + date */}
          <div className="ml-4 flex shrink-0 flex-col items-end gap-1.5">
            <Skeleton className="h-6 w-6 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/**
 * TicketListEmptyState — estado vazio da lista de tickets.
 */
export function TicketListEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-16 text-center">
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
          d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18m-9-5.25h5.25M7.5 15h3M3.375 5.25c-.621 0-1.125.504-1.125 1.125v3.026a2.999 2.999 0 010 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a2.999 2.999 0 010-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375z"
        />
      </svg>
      <p className="font-medium text-foreground">Nenhum ticket encontrado</p>
      <p className="text-sm text-muted-foreground mt-1">
        Nenhum ticket corresponde aos filtros selecionados.
      </p>
    </div>
  )
}
