/**
 * ContactListSkeleton — fallback de Suspense para a lista de contatos.
 * Replica a estrutura visual da tabela ContactList enquanto os dados carregam.
 * docs/70-ux/09-interaction-patterns.md §2.1
 */

import { Skeleton } from '@/components/ui/skeleton'

interface ContactListSkeletonProps {
  rows?: number
}

export function ContactListSkeleton({ rows = 8 }: ContactListSkeletonProps) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Table header */}
      <div className="border-b border-border bg-muted/50 px-4 py-3 flex gap-4">
        <Skeleton className="h-4 w-[28%]" />
        <Skeleton className="h-4 w-[16%]" />
        <Skeleton className="h-4 w-[14%]" />
        <Skeleton className="h-4 w-[12%]" />
        <Skeleton className="h-4 w-[16%]" />
        <Skeleton className="h-4 w-[8%]" />
      </div>

      {/* Table rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3 border-b border-border last:border-0"
        >
          {/* Avatar + nome */}
          <div className="flex items-center gap-2 w-[28%]">
            <Skeleton className="h-7 w-7 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
          </div>
          {/* CPF */}
          <Skeleton className="h-4 w-[16%]" />
          {/* Classificação badge */}
          <Skeleton className="h-5 w-20 rounded-md" />
          {/* Status */}
          <Skeleton className="h-4 w-[12%]" />
          {/* Criado em */}
          <Skeleton className="h-4 w-[16%]" />
          {/* Ação */}
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}

/**
 * ContactListEmptyState — estado vazio da lista de contatos.
 * Exibido quando não há contatos correspondentes ao filtro atual.
 */
export function ContactListEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-lg border border-dashed border-border bg-card">
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
          d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
        />
      </svg>
      <p className="font-medium text-foreground">Nenhum contato encontrado</p>
      <p className="text-sm text-muted-foreground mt-1">
        Tente ajustar os filtros ou cadastre um novo contato.
      </p>
      <a
        href="/contacts/new"
        className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
      >
        Novo Contato
      </a>
    </div>
  )
}
