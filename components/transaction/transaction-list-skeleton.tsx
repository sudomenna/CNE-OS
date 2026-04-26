/**
 * TransactionListSkeleton — fallback de Suspense para a tabela de transações.
 * Replica a estrutura visual do TransactionList enquanto os dados carregam.
 * docs/70-ux/09-interaction-patterns.md §2.1
 */

import { Skeleton } from '@/components/ui/skeleton'

interface TransactionListSkeletonProps {
  rows?: number
}

export function TransactionListSkeleton({ rows = 8 }: TransactionListSkeletonProps) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card"
      aria-busy="true"
      aria-label="Carregando transações"
    >
      <div className="overflow-x-auto">
        {/* Table header */}
        <div className="flex items-center gap-4 border-b border-border bg-muted/50 px-4 py-3">
          <Skeleton className="h-3.5 w-[14%]" />
          <Skeleton className="h-3.5 w-[22%]" />
          <Skeleton className="h-3.5 w-[22%]" />
          <Skeleton className="h-3.5 w-[12%] ml-auto" />
          <Skeleton className="h-3.5 w-[12%]" />
        </div>

        {/* Table rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0"
          >
            {/* Data */}
            <Skeleton className="h-4 w-[14%]" />
            {/* Contato */}
            <div className="flex flex-col gap-1.5 w-[22%]">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-[70%]" />
            </div>
            {/* Oferta */}
            <Skeleton className="h-4 w-[22%]" />
            {/* Valor */}
            <Skeleton className="h-4 w-[12%] ml-auto" />
            {/* Status badge */}
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * TransactionListEmptyState — estado vazio da lista de transações.
 */
export function TransactionListEmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-16 text-center">
      <div className="flex flex-col items-center">
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
            d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
          />
        </svg>
        <p className="font-medium text-foreground">Nenhuma transação encontrada</p>
        <p className="text-sm text-muted-foreground mt-1">
          Nenhuma transação corresponde aos filtros selecionados.
        </p>
      </div>
    </div>
  )
}
