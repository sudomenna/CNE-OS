'use client'

/**
 * NotificationCenter — popover de notificações na topbar.
 * T-12-04: Centro de Notificações
 *
 * Spec: docs/70-ux/02-information-architecture.md §3 (Topbar §4)
 *       docs/70-ux/09-interaction-patterns.md §3 (Realtime / Notificação desktop)
 *
 * Alimenta-se via Server Actions — sem fetch direto para /api.
 * TODO: integrar Supabase Realtime subscription quando tabela user_notification for criada.
 */

import { useEffect, useState, useTransition } from 'react'
import { Bell } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  listNotifications,
  markAllAsRead,
  markAsRead,
  type NotificationItem,
} from '@/app/(app)/notifications/actions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

  if (seconds < 60) return rtf.format(-seconds, 'second')
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (hours < 24) return rtf.format(-hours, 'hour')
  return rtf.format(-days, 'day')
}

// ---------------------------------------------------------------------------
// NotificationCenter
// ---------------------------------------------------------------------------

export function NotificationCenter() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Conta notificações não lidas
  const unreadCount = items.filter((n) => !n.isRead).length

  // Carrega notificações ao montar o componente
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void listNotifications(20).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setItems(result.data)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Marca todas como lidas
  function handleMarkAllAsRead() {
    startTransition(async () => {
      const result = await markAllAsRead()
      if (result.ok) {
        setItems((prev) => prev.map((n) => ({ ...n, isRead: true })))
      }
    })
  }

  // Marca uma notificação como lida
  function handleMarkAsRead(id: string) {
    startTransition(async () => {
      const result = await markAsRead({ id })
      if (result.ok) {
        setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
      }
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8"
          aria-label={
            unreadCount > 0
              ? `${unreadCount} notificação${unreadCount > 1 ? 'ões' : ''} não lida${unreadCount > 1 ? 's' : ''}`
              : 'Notificações'
          }
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground"
              aria-hidden="true"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        className="w-80 p-0"
        role="dialog"
        aria-label="Centro de notificações"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Notificações</h2>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllAsRead}
              disabled={isPending}
              aria-label="Marcar todas as notificações como lidas"
            >
              Marcar todas como lidas
            </Button>
          )}
        </div>

        {/* Lista de notificações */}
        <ScrollArea className="max-h-96">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                  <div className="h-2.5 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <Bell className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nenhuma notificação</p>
            </div>
          ) : (
            <ul role="list" className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={[
                      'w-full px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      !item.isRead ? 'bg-muted/30' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => handleMarkAsRead(item.id)}
                    aria-label={`${item.message}${!item.isRead ? ' — não lida' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Indicador de não-lida */}
                      <span
                        className={[
                          'mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full',
                          !item.isRead ? 'bg-blue-500' : 'bg-transparent',
                        ].join(' ')}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{item.message}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatRelativeTime(item.createdAt)}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2">
          <a
            href="/notifications"
            className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver todas
          </a>
        </div>
      </PopoverContent>
    </Popover>
  )
}
