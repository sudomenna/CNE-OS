'use client'

/**
 * InboxFilters — filtros inline + tabs de conversa para o inbox.
 *
 * Client Component: usa useSearchParams / useRouter para manter estado na URL
 * sem reload de página.
 *
 * Filtros disponíveis:
 *   - tab: 'all' | 'mine' | 'unassigned'  (mapeado para assigned_to param)
 *   - channel: 'all' | 'whatsapp' | 'instagram' | 'email'
 *   - status:  'all' | 'open' | 'waiting_customer' | 'waiting_team'
 *
 * docs/70-ux/04-screen-inbox.md §2.1, §2.2
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InboxTab = 'all' | 'mine' | 'unassigned'
export type ChannelFilter = 'all' | 'whatsapp' | 'instagram' | 'email'
export type StatusFilter = 'all' | 'open' | 'waiting_customer' | 'waiting_team'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildParams(
  current: URLSearchParams,
  updates: Record<string, string>,
): string {
  const next = new URLSearchParams(current.toString())
  for (const [k, v] of Object.entries(updates)) {
    if (v === 'all' || v === '') {
      next.delete(k)
    } else {
      next.set(k, v)
    }
  }
  // Limpar seleção de conversa ao mudar filtros
  next.delete('conversation')
  return next.toString()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface InboxFiltersProps {
  /** ID do usuário logado — necessário para tab "Minhas" */
  currentUserId: string
}

export function InboxFilters({ currentUserId: _currentUserId }: InboxFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const tab = (searchParams.get('tab') as InboxTab | null) ?? 'all'
  const channel = (searchParams.get('channel') as ChannelFilter | null) ?? 'all'
  const status = (searchParams.get('status') as StatusFilter | null) ?? 'all'

  const navigate = useCallback(
    (updates: Record<string, string>) => {
      const qs = buildParams(searchParams, updates)
      startTransition(() => {
        router.replace(`/inbox${qs ? `?${qs}` : ''}` as never, { scroll: false })
      })
    },
    [router, searchParams],
  )

  return (
    <div
      className="flex flex-col gap-2 px-3 py-2 border-b border-border bg-background flex-shrink-0"
      aria-label="Filtros da inbox"
    >
      {/* Tabs rápidas */}
      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ tab: v })}
        aria-label="Filtrar conversas por atribuição"
      >
        <TabsList className="w-full h-8 p-0.5 text-xs">
          <TabsTrigger
            value="all"
            className="flex-1 h-7 text-xs data-[state=active]:shadow-sm"
          >
            Todas
          </TabsTrigger>
          <TabsTrigger
            value="mine"
            className="flex-1 h-7 text-xs data-[state=active]:shadow-sm"
          >
            Minhas
          </TabsTrigger>
          <TabsTrigger
            value="unassigned"
            className="flex-1 h-7 text-xs data-[state=active]:shadow-sm"
          >
            Não atribuídas
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filtros inline: Canal + Status */}
      <div
        className={[
          'flex gap-2 transition-opacity',
          isPending ? 'opacity-50 pointer-events-none' : '',
        ].join(' ')}
      >
        {/* Filtro: Canal */}
        <Select
          value={channel}
          onValueChange={(v) => navigate({ channel: v })}
        >
          <SelectTrigger
            className="flex-1 h-7 text-xs"
            aria-label="Filtrar por canal"
          >
            <SelectValue placeholder="Canal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="email">E-mail</SelectItem>
          </SelectContent>
        </Select>

        {/* Filtro: Status */}
        <Select
          value={status}
          onValueChange={(v) => navigate({ status: v })}
        >
          <SelectTrigger
            className="flex-1 h-7 text-xs"
            aria-label="Filtrar por status"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="open">Aberta</SelectItem>
            <SelectItem value="waiting_customer">Aguardando cliente</SelectItem>
            <SelectItem value="waiting_team">Aguardando equipe</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
