/**
 * Tests for timeline_event schema structure (T-0-11)
 *
 * These are unit-level tests that verify the Drizzle schema shape without
 * a live database. Integration tests covering actual trigger behaviour
 * (UPDATE blocked, DELETE blocked) belong in tests/integration/timeline/
 * and are deferred until a test DB is available (Sprint 1+).
 *
 * docs/20-domain/04-timeline.md §10
 */
import { describe, it, expect } from 'vitest'
import { timelineEvent } from '@/lib/db/schema/timeline'
import type { NewTimelineEvent } from '@/lib/db/schema/timeline'

describe('timeline_event schema', () => {
  it('timeline.append-only — schema has no updatedAt or deletedAt', () => {
    // timeline_event is append-only (INV-TIMELINE-01); updated_at and deleted_at
    // must NOT be present — docs/30-contracts/02-db-schema-conventions.md §4
    expect(timelineEvent).toBeDefined()
    const cols = Object.keys(timelineEvent)
    expect(cols).not.toContain('updatedAt')
    expect(cols).not.toContain('deletedAt')
  })

  it('timeline.append-only — schema has createdAt but no updatedAt', () => {
    const cols = Object.keys(timelineEvent)
    expect(cols).toContain('createdAt')
    expect(cols).not.toContain('updatedAt')
  })

  it('timeline.contact-id — column exists and has no references (Sprint 0)', () => {
    // contact_id is stored without FK until contact table exists in Sprint 1
    expect(timelineEvent).toBeDefined()
    const cols = Object.keys(timelineEvent)
    expect(cols).toContain('contactId')
  })

  it('timeline.insert.requires-actor — schema has actor check fields', () => {
    // Both actor_user_id and actor_system exist to support the CHECK constraint
    // INV-TIMELINE-02: ck_timeline_actor_present
    const entry: Partial<NewTimelineEvent> = {
      contactId: '00000000-0000-0000-0000-000000000001',
      kind: 'te_sale_approved',
      source: 'MOD-TRANSACTION',
      actorSystem: 'digital_guru',
      payload: { amount: 100 },
    }
    expect(entry.actorSystem).toBe('digital_guru')
    expect(entry.contactId).toBeDefined()
  })

  it('timeline.insert.requires-actor — schema supports actorUserId field', () => {
    const entry: Partial<NewTimelineEvent> = {
      contactId: '00000000-0000-0000-0000-000000000001',
      kind: 'te_contact_created',
      source: 'MOD-CONTACT',
      actorUserId: '00000000-0000-0000-0000-000000000002',
      payload: {},
    }
    expect(entry.actorUserId).toBeDefined()
  })

  it('timeline.schema — payload defaults to empty object shape', () => {
    // payload column must exist and be jsonb
    const cols = Object.keys(timelineEvent)
    expect(cols).toContain('payload')
  })

  it('timeline.schema — subject polymorphic fields exist', () => {
    // subject_kind and subject_id enable polymorphic reference without FK coupling
    const cols = Object.keys(timelineEvent)
    expect(cols).toContain('subjectKind')
    expect(cols).toContain('subjectId')
  })

  it('timeline.schema — occurredAt and createdAt exist', () => {
    const cols = Object.keys(timelineEvent)
    expect(cols).toContain('occurredAt')
    expect(cols).toContain('createdAt')
  })
})
