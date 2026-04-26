'use client'

/**
 * TimelineRealtimeTrigger — Client Component sem UI que monta a subscription
 * Supabase Realtime para a timeline de contato.
 *
 * Renderiza null; serve apenas como ponto de montagem do efeito colateral de
 * realtime. É incluído dentro do TimelinePanel (Server Component) via composição.
 *
 * T-13-23: Realtime na timeline de contato
 */

import { useTimelineRealtime } from '@/hooks/use-timeline-realtime'

interface TimelineRealtimeTriggerProps {
  contactId: string
}

export function TimelineRealtimeTrigger({ contactId }: TimelineRealtimeTriggerProps) {
  useTimelineRealtime(contactId)
  return null
}
