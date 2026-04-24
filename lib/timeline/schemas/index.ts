/**
 * MOD-TIMELINE — Kind registry with Zod payload schemas
 *
 * docs/30-contracts/03-timeline-event-catalog.md
 * docs/50-business-rules/BR-TIMELINE.md
 *
 * Sprint 0 subset: 5 kinds registered (contact_created, contact_updated,
 * contact_tag_added, contact_merged, sale_approved).
 * Unknown kinds throw UnknownTimelineKindError in emitTimelineEvent.
 */
import { z } from 'zod'
import type { ModuleSource } from '@/lib/timeline/emit'

type KindEntry = {
  source: ModuleSource
  schema: z.ZodTypeAny
}

type KindRegistry = Record<string, KindEntry>

export const KIND_REGISTRY: KindRegistry = {
  contact_created: {
    source: 'MOD-CONTACT',
    schema: z.object({
      origin: z.enum(['checkout', 'message', 'import', 'manual', 'integration']),
      source_ref: z.string().optional(),
    }),
  },
  contact_updated: {
    source: 'MOD-CONTACT',
    schema: z.object({
      field: z.string(),
      from: z.unknown(),
      to: z.unknown(),
    }),
  },
  contact_tag_added: {
    source: 'MOD-CONTACT',
    schema: z.object({
      tag: z.string(),
      source: z.enum(['manual', 'benefit', 'automation']),
    }),
  },
  contact_merged: {
    source: 'MOD-MERGE',
    schema: z.object({
      merged_into: z.string().uuid(),
      merged_from: z.string().uuid(),
      reason: z.string(),
    }),
  },
  contact_unmerged: {
    source: 'MOD-MERGE',
    schema: z.object({
      merge_id: z.string().uuid(),
      principal_contact_id: z.string().uuid(),
      secondary_contact_id: z.string().uuid(),
      reason: z.string(),
    }),
  },
  contact_tag_removed: {
    source: 'MOD-CONTACT',
    schema: z.object({
      tag: z.string(),
    }),
  },
  contact_blacklisted: {
    source: 'MOD-CONTACT',
    schema: z.object({
      from_status: z.string().optional(),
      reason: z.string().optional(),
    }),
  },
  contact_issue_opened: {
    source: 'MOD-MERGE',
    schema: z.object({
      issue_id: z.string(),
      kind: z.string(),
      detail: z.string(),
    }),
  },
  contact_issue_resolved: {
    source: 'MOD-MERGE',
    schema: z.object({
      issue_id: z.string(),
      resolution: z.string(),
    }),
  },
  sale_approved: {
    source: 'MOD-TRANSACTION',
    schema: z.object({
      transaction_id: z.string().uuid(),
      amount: z.number().positive(),
      offer_id: z.string().uuid(),
    }),
  },
}

export function getKindEntry(kind: string): KindEntry | null {
  return KIND_REGISTRY[kind] ?? null
}
