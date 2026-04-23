/**
 * MOD-TIMELINE — emitTimelineEvent
 *
 * docs/20-domain/04-timeline.md §3.3
 * docs/50-business-rules/BR-TIMELINE.md
 *
 * ADR-11: tx is optional first-class parameter (write function).
 * ADR-10: throws domain errors — never returns Result<T,E>.
 */
import { db } from '@/lib/db/client'
import type { DbTx } from '@/lib/db/client'
import { timelineEvent } from '@/lib/db/schema/timeline'
import type { TimelineEvent } from '@/lib/db/schema/timeline'
import { getKindEntry } from './schemas/index'
import {
  UnknownTimelineKindError,
  TimelinePayloadError,
  TimelineOccurredAtError,
} from './errors'

// BR-TIMELINE §2: module source identifiers
export type ModuleSource =
  | 'MOD-CONTACT'
  | 'MOD-MERGE'
  | 'MOD-INBOX'
  | 'MOD-TICKET'
  | 'MOD-FUNNEL'
  | 'MOD-CAMPAIGN'
  | 'MOD-TRANSACTION'
  | 'MOD-REFUND'
  | 'MOD-ENTITLEMENT'
  | 'MOD-BILLING'
  | 'MOD-INTEGRATION'
  | 'MOD-AUTOMATION'

export type TimelineEventInput = {
  contactId: string
  brandId?: string | null
  kind: string
  source: ModuleSource
  actorUserId?: string | null   // XOR com actorSystem — INV-TIMELINE-02
  actorSystem?: string | null
  subjectKind?: string | null
  subjectId?: string | null
  payload: Record<string, unknown>
  occurredAt?: Date
}

export async function emitTimelineEvent(
  input: TimelineEventInput,
  tx?: DbTx,
): Promise<TimelineEvent> {
  // BR-TIMELINE INV-TIMELINE-02: actorUserId XOR actorSystem — at least one required
  if (!input.actorUserId && !input.actorSystem) {
    throw new Error('emitTimelineEvent: actorUserId or actorSystem is required')
  }

  // BR-TIMELINE: kind must be registered in the catalog
  const entry = getKindEntry(input.kind)
  if (!entry) {
    throw new UnknownTimelineKindError(input.kind)
  }

  // BR-TIMELINE: payload must conform to the kind's Zod schema
  const parsed = entry.schema.safeParse(input.payload)
  if (!parsed.success) {
    throw new TimelinePayloadError(input.kind, parsed.error.message)
  }

  // BR-TIMELINE INV-TIMELINE-06: occurredAt must not be in the future
  const occurredAt = input.occurredAt ?? new Date()
  if (occurredAt > new Date()) {
    throw new TimelineOccurredAtError()
  }

  // INSERT — use provided tx or fall back to the global db instance
  const executor = tx ?? db
  const rows = await executor
    .insert(timelineEvent)
    .values({
      contactId: input.contactId,
      brandId: input.brandId ?? null,
      kind: input.kind,
      source: input.source,
      actorUserId: input.actorUserId ?? null,
      actorSystem: input.actorSystem ?? null,
      subjectKind: input.subjectKind ?? null,
      subjectId: input.subjectId ?? null,
      payload: parsed.data as Record<string, unknown>,
      occurredAt,
    })
    .returning()

  const row = rows[0]
  if (!row) {
    throw new Error('emitTimelineEvent: INSERT returned no row')
  }

  return row
}
