/**
 * MOD-TIMELINE — Timeline schema (T-0-11)
 *
 * Tables in this file: timeline_event
 *
 * Specs:
 *   docs/20-domain/04-timeline.md §3
 *   docs/30-contracts/02-db-schema-conventions.md
 *
 * IMPORTANT: timeline_event is append-only (INV-TIMELINE-01).
 * No updated_at or deleted_at — see docs/30-contracts/02-db-schema-conventions.md §4.
 */
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { brand, userAccount } from './organization'
import { contact } from './contact'

// ---------------------------------------------------------------------------
// timeline_event
// docs/20-domain/04-timeline.md §3.1
// ---------------------------------------------------------------------------

export const timelineEvent = pgTable(
  'timeline_event',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

    // Sprint 1 T-1-12: FK adicionada agora que contact table existe
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK brand(id) ON DELETE SET NULL — docs/30-contracts/02-db-schema-conventions.md §14
    brandId: uuid('brand_id').references(() => brand.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // kind — snake_case; validated by ck_timeline_kind_snake CHECK and by emitTimelineEvent()
    kind: text('kind').notNull(),

    // source — emitting module identifier, e.g. 'MOD-CONTACT', 'MOD-TRANSACTION'
    source: text('source').notNull(),

    // actor: exactly one of actor_user_id or actor_system must be non-null (CHECK below)
    // INV-TIMELINE-02
    actorUserId: uuid('actor_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    actorSystem: text('actor_system'),

    // Polymorphic subject reference — no FK to avoid coupling
    subjectKind: text('subject_kind'),
    subjectId: uuid('subject_id'),

    // payload — immutable JSONB; schema per kind documented in 03-timeline-event-catalog.md
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),

    // occurred_at — real-world instant of the effect
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    // created_at — insert instant; no updated_at (append-only table)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-TIMELINE-02: at least one actor must be present
    ckTimelineActorPresent: check(
      'ck_timeline_actor_present',
      sql`${t.actorUserId} IS NOT NULL OR ${t.actorSystem} IS NOT NULL`,
    ),
    // INV-TIMELINE-03: kind must be snake_case
    ckTimelineKindSnake: check(
      'ck_timeline_kind_snake',
      sql`${t.kind} ~ '^[a-z][a-z0-9_]*$'`,
    ),

    // Indexes — docs/20-domain/04-timeline.md §3.2
    idxTimelineContactTime: index('idx_timeline_contact_time').on(t.contactId, t.occurredAt),
    idxTimelineBrand: index('idx_timeline_brand').on(t.brandId),
    idxTimelineKind: index('idx_timeline_kind').on(t.kind),
    idxTimelineSubject: index('idx_timeline_subject').on(t.subjectKind, t.subjectId),
    // GIN index on payload — declared via .using('gin', column)
    idxTimelinePayloadGin: index('idx_timeline_payload_gin').using('gin', t.payload),
  }),
)

export type TimelineEvent = InferSelectModel<typeof timelineEvent>
export type NewTimelineEvent = InferInsertModel<typeof timelineEvent>
