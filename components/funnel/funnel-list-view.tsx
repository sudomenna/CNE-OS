'use client'

/**
 * FunnelListView — Client Component
 *
 * Tabela plana alternativa ao kanban. Carrega entries via listFunnelEntriesAction.
 * Colunas: Contato, Estágio, Responsável, Score, Status, Data entrada.
 *
 * Spec: docs/70-ux/05-screen-funnel-board.md §3 (Toggle Board/Lista)
 * T-12-20
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { listFunnelEntriesAction } from '@/app/(app)/funnels/actions'
import type { FunnelEntryListItem } from '@/app/(app)/funnels/actions'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FunnelListViewProps {
  funnelId: string
  stages: { id: string; name: string }[]
  assignee?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LABEL_MAP: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }
> = {
  open: { label: 'Aberta', variant: 'secondary' },
  negotiating: { label: 'Negociando', variant: 'default' },
  concluded: { label: 'Concluída', variant: 'default' },
  won: { label: 'Ganha', variant: 'default' },
  lost: { label: 'Perdida', variant: 'destructive' },
  reopened: { label: 'Reaberta', variant: 'outline' },
}

function formatEntryDate(date: Date | string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(date))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FunnelListView({
  funnelId,
  stages: _stages,
  assignee,
  dateFrom,
  dateTo,
}: FunnelListViewProps) {
  const [entries, setEntries] = useState<FunnelEntryListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setError(null)

    listFunnelEntriesAction({ funnelId, assignee, dateFrom, dateTo }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setEntries(result.data)
      } else {
        setError('Falha ao carregar oportunidades.')
      }
      setIsLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [funnelId, assignee, dateFrom, dateTo])

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Carregando lista">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        {error}
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground/60">
        <p className="text-sm">Nenhuma oportunidade encontrada com os filtros aplicados.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" role="table" aria-label="Lista de oportunidades">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Contato
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Estágio
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Responsável
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Score
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Status
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Entrada
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-card">
          {entries.map((entry) => {
            const labelMeta = LABEL_MAP[entry.label] ?? {
              label: entry.label,
              variant: 'outline' as const,
            }

            return (
              <tr key={entry.id} className="hover:bg-muted/30 transition-colors">
                {/* Contato */}
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/contacts/${entry.contactId}`}
                    className="text-foreground hover:text-blue-600 hover:underline transition-colors truncate max-w-[200px] block"
                    aria-label={`Ver perfil de ${entry.contactName}`}
                  >
                    {entry.contactName}
                  </Link>
                </td>

                {/* Estágio */}
                <td className="px-4 py-3 text-muted-foreground">
                  {entry.stageName}
                </td>

                {/* Responsável */}
                <td className="px-4 py-3 text-muted-foreground">
                  {entry.ownerName ?? (
                    <span className="text-muted-foreground/50">Sem responsável</span>
                  )}
                </td>

                {/* Score */}
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {parseFloat(entry.score).toFixed(0)}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <Badge variant={labelMeta.variant} className="text-xs">
                    {labelMeta.label}
                  </Badge>
                </td>

                {/* Data entrada */}
                <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatEntryDate(entry.entryDate)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
