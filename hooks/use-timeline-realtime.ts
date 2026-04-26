'use client'

/**
 * useTimelineRealtime — subscreve Supabase Realtime para INSERT em timeline_event
 * filtrado pelo contactId e chama router.refresh() para revalidar Server Components.
 *
 * T-13-23: Realtime na timeline de contato
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowserClient } from '@/lib/auth/supabase'

export function useTimelineRealtime(contactId: string) {
  const router = useRouter()
  const supabase = useRef(createSupabaseBrowserClient())

  useEffect(() => {
    const client = supabase.current

    const channel = client
      .channel(`timeline-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'timeline_event',
          filter: `contact_id=eq.${contactId}`,
        },
        () => {
          router.refresh()
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [contactId, router])
}
