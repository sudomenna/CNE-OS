/**
 * MOD-TIMELINE — listTimelineEvents (T-1-13)
 *
 * docs/20-domain/04-timeline.md §4
 * INV-TIMELINE-07: consolidação da timeline do principal é feita na leitura,
 *   não via UPDATE de contact_id nos eventos históricos do secundário.
 *
 * ADR-10: lança erros de domínio — nunca retorna Result<T,E>.
 * ADR-11: função de leitura — não recebe tx (não muta estado).
 */

import { db } from '@/lib/db/client'
import { timelineEvent } from '@/lib/db/schema/timeline'
import { contact } from '@/lib/db/schema/contact'
import type { TimelineEvent } from '@/lib/db/schema/timeline'
import { and, desc, eq, inArray, or, lte, gte, lt } from 'drizzle-orm'
import { ContactNotFoundError } from './errors'

export { ContactNotFoundError }

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TimelineFilters = {
  brandId?: string
  kinds?: string[]   // filtrar por kind(s)
  since?: Date       // occurred_at >= since
  until?: Date       // occurred_at <= until
}

export type TimelineEventPage = {
  events: TimelineEvent[]
  nextCursor: string | null  // keyset: `${occurred_at.toISOString()}_${id}`
  hasMore: boolean
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** INV-TIMELINE-07 / OQ-TIMELINE-02: profundidade máxima de merge tree em memória */
const MAX_MERGE_DEPTH = 5

const DEFAULT_PAGE_SIZE = 50

// ---------------------------------------------------------------------------
// listTimelineEvents
// ---------------------------------------------------------------------------

/**
 * Retorna a timeline paginada de um contato, consolidando eventos de todos os
 * contatos que foram mesclados nele (transitividade, profundidade ≤ 5).
 *
 * INV-TIMELINE-07: reaponte de contact_id é feito na leitura — eventos
 *   históricos do secundário continuam apontando para o id original.
 */
export async function listTimelineEvents(
  contactId: string,
  filters?: TimelineFilters,
  cursor?: string | null,
  pageSize?: number,
): Promise<TimelineEventPage> {
  const limit = pageSize ?? DEFAULT_PAGE_SIZE

  // -------------------------------------------------------------------------
  // 1. Verificar existência do contato principal
  // -------------------------------------------------------------------------
  const primaryRows = await db
    .select({ id: contact.id, mergedIntoId: contact.mergedIntoId })
    .from(contact)
    .where(eq(contact.id, contactId))
    .limit(1)

  if (primaryRows.length === 0) {
    throw new ContactNotFoundError(contactId)
  }

  // -------------------------------------------------------------------------
  // 2. Coletar todos os IDs que fazem parte desta timeline (merge tree)
  //    INV-TIMELINE-07: resolução iterativa em memória, sem CTE recursivo.
  //    OQ-TIMELINE-02: profundidade máxima de 5 para evitar loop infinito por bug.
  // -------------------------------------------------------------------------
  const allIds = new Set<string>([contactId])
  let frontier = [contactId]

  for (let depth = 0; depth < MAX_MERGE_DEPTH && frontier.length > 0; depth++) {
    // Buscar contatos onde merged_into_id está na fronteira atual
    const merged = await db
      .select({ id: contact.id })
      .from(contact)
      .where(inArray(contact.mergedIntoId, frontier))

    const newIds = merged.map((r) => r.id).filter((id) => !allIds.has(id))
    for (const id of newIds) {
      allIds.add(id)
    }
    frontier = newIds
  }

  const contactIds = Array.from(allIds)

  // -------------------------------------------------------------------------
  // 3. Construir filtros da query de eventos
  // -------------------------------------------------------------------------
  const conditions = [inArray(timelineEvent.contactId, contactIds)]

  if (filters?.brandId) {
    conditions.push(eq(timelineEvent.brandId, filters.brandId))
  }

  if (filters?.kinds && filters.kinds.length > 0) {
    conditions.push(inArray(timelineEvent.kind, filters.kinds))
  }

  if (filters?.since) {
    conditions.push(gte(timelineEvent.occurredAt, filters.since))
  }

  if (filters?.until) {
    conditions.push(lte(timelineEvent.occurredAt, filters.until))
  }

  // Paginação keyset — cursor = `${occurred_at.toISOString()}_${id}`
  // WHERE (occurred_at, id) < (cursor_time, cursor_id)
  if (cursor) {
    const separatorIdx = cursor.lastIndexOf('_')
    const cursorTime = new Date(cursor.substring(0, separatorIdx))
    const cursorId = cursor.substring(separatorIdx + 1)

    // (occurred_at < cursorTime) OR (occurred_at = cursorTime AND id < cursorId)
    conditions.push(
      or(
        lt(timelineEvent.occurredAt, cursorTime),
        and(
          lte(timelineEvent.occurredAt, cursorTime),
          lt(timelineEvent.id, cursorId),
        ),
      )!,
    )
  }

  // -------------------------------------------------------------------------
  // 4. Query dos eventos
  // -------------------------------------------------------------------------
  const events = await db
    .select()
    .from(timelineEvent)
    .where(and(...conditions))
    .orderBy(desc(timelineEvent.occurredAt), desc(timelineEvent.id))
    .limit(limit)

  // -------------------------------------------------------------------------
  // 5. Montar cursor para próxima página
  // -------------------------------------------------------------------------
  const lastEvent = events[events.length - 1]
  const hasMore = events.length === limit
  const nextCursor =
    hasMore && lastEvent
      ? `${lastEvent.occurredAt.toISOString()}_${lastEvent.id}`
      : null

  return { events, nextCursor, hasMore }
}
