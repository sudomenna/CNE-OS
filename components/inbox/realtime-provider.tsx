'use client'

/**
 * RealtimeProvider — assina Supabase Realtime para conversation e message.
 *
 * Ao receber qualquer mudança → router.refresh() para recarregar Server Components.
 * Ao receber nova mensagem inbound → push desktop se janela não estiver em foco.
 *
 * docs/20-domain/05-conversation-inbox.md §1
 * docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-11)
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/auth/supabase'

interface RealtimeProviderProps {
  children: React.ReactNode
  /** Filtrar assinatura pelo usuário logado (assigned_user_id) para reduzir load. */
  userId?: string | undefined
}

export function RealtimeProvider({ children, userId }: RealtimeProviderProps) {
  const router = useRouter()
  const supabase = useRef(createSupabaseBrowserClient())

  useEffect(() => {
    const client = supabase.current

    // Canal Realtime para tabela conversation
    const convChannel = client
      .channel('inbox-conversations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation',
          // T-3-11 spec: assinar só canal do usuário logado quando disponível
          ...(userId ? { filter: `assigned_user_id=eq.${userId}` } : {}),
        },
        () => {
          router.refresh()
        },
      )
      .subscribe()

    // Canal Realtime para tabela message
    const msgChannel = client
      .channel('inbox-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message',
        },
        (payload) => {
          router.refresh()

          // Push desktop para mensagens inbound quando a janela não está em foco
          const record = payload.new as { direction?: string; body?: string }
          if (record.direction === 'inbound' && !document.hasFocus()) {
            void requestDesktopNotification(record.body ?? 'Nova mensagem recebida')
          }
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(convChannel)
      void client.removeChannel(msgChannel)
    }
  }, [router, userId])

  return <>{children}</>
}

async function requestDesktopNotification(body: string) {
  try {
    if (!('Notification' in window)) return

    let permission = Notification.permission
    if (permission === 'default') {
      permission = await Notification.requestPermission()
    }

    if (permission === 'granted') {
      new Notification('CNE-OS — Nova mensagem', {
        body,
        icon: '/favicon.ico',
      })
    }
  } catch {
    // Silencioso — notificação é best-effort
  }
}
