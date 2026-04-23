/**
 * Unit tests — emitTimelineEvent
 *
 * docs/20-domain/04-timeline.md §3.3
 * docs/50-business-rules/BR-TIMELINE.md
 *
 * All validations that occur BEFORE the DB INSERT are tested here.
 * The DB insert itself is mocked — these are pure-validation unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UnknownTimelineKindError, TimelinePayloadError, TimelineOccurredAtError } from '@/lib/timeline/errors'

// ---------------------------------------------------------------------------
// Mock DB client — avoid real DB connection
// ---------------------------------------------------------------------------
const mockReturning = vi.fn()
const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
const mockInsert = vi.fn().mockReturnValue({ values: mockValues })

vi.mock('@/lib/db/client', () => ({
  db: { insert: mockInsert },
  DbTx: undefined,
}))

// Import AFTER mock is set up
const { emitTimelineEvent } = await import('@/lib/timeline/emit')

// ---------------------------------------------------------------------------
// Shared fixture
// ---------------------------------------------------------------------------
const FIXED_ID = '00000000-0000-0000-0000-000000000001'
const FIXED_CONTACT = '00000000-0000-0000-0000-000000000002'
const FIXED_USER = '00000000-0000-0000-0000-000000000003'

const baseInput = {
  contactId: FIXED_CONTACT,
  kind: 'contact_updated',
  source: 'MOD-CONTACT' as const,
  actorUserId: FIXED_USER,
  payload: { field: 'full_name', from: 'Alice', to: 'Bob' },
}

const happyRow = {
  id: FIXED_ID,
  contactId: FIXED_CONTACT,
  brandId: null,
  kind: 'contact_updated',
  source: 'MOD-CONTACT',
  actorUserId: FIXED_USER,
  actorSystem: null,
  subjectKind: null,
  subjectId: null,
  payload: { field: 'full_name', from: 'Alice', to: 'Bob' },
  occurredAt: new Date(),
  createdAt: new Date(),
}

beforeEach(() => {
  mockReturning.mockResolvedValue([happyRow])
  vi.clearAllMocks()
  mockInsert.mockReturnValue({ values: mockValues })
  mockValues.mockReturnValue({ returning: mockReturning })
  mockReturning.mockResolvedValue([happyRow])
})

// ---------------------------------------------------------------------------
// BR-TIMELINE: Unknown kind
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — kind validation', () => {
  it('timeline.insert.rejects-unknown-kind — unknown kind throws before DB', async () => {
    await expect(
      emitTimelineEvent({ ...baseInput, kind: 'totally_unknown_event_kind' }),
    ).rejects.toThrow(UnknownTimelineKindError)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('timeline.insert.rejects-unknown-kind — error message contains the kind name', async () => {
    await expect(
      emitTimelineEvent({ ...baseInput, kind: 'nonexistent_kind' }),
    ).rejects.toThrow('"nonexistent_kind"')
  })
})

// ---------------------------------------------------------------------------
// BR-TIMELINE: Payload validation
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — payload validation', () => {
  it('timeline.insert.rejects-invalid-payload — wrong fields for contact_updated', async () => {
    await expect(
      emitTimelineEvent({ ...baseInput, payload: { wrong_field: 'oops' } }),
    ).rejects.toThrow(TimelinePayloadError)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('timeline.insert.rejects-invalid-payload — empty payload throws for contact_updated', async () => {
    await expect(
      emitTimelineEvent({ ...baseInput, payload: {} }),
    ).rejects.toThrow(TimelinePayloadError)
  })

  it('timeline.insert.rejects-invalid-payload — contact_created rejects unknown origin', async () => {
    await expect(
      emitTimelineEvent({
        ...baseInput,
        kind: 'contact_created',
        payload: { origin: 'unknown_origin' },
      }),
    ).rejects.toThrow(TimelinePayloadError)
  })

  it('timeline.insert.rejects-invalid-payload — sale_approved rejects negative amount', async () => {
    await expect(
      emitTimelineEvent({
        ...baseInput,
        kind: 'sale_approved',
        source: 'MOD-TRANSACTION',
        payload: {
          transaction_id: FIXED_ID,
          amount: -50,
          offer_id: FIXED_ID,
        },
      }),
    ).rejects.toThrow(TimelinePayloadError)
  })

  it('timeline.insert.rejects-invalid-payload — contact_merged rejects non-UUID', async () => {
    await expect(
      emitTimelineEvent({
        ...baseInput,
        kind: 'contact_merged',
        source: 'MOD-MERGE',
        payload: {
          merged_into: 'not-a-uuid',
          merged_from: FIXED_ID,
          reason: 'duplicate',
        },
      }),
    ).rejects.toThrow(TimelinePayloadError)
  })
})

// ---------------------------------------------------------------------------
// BR-TIMELINE INV-TIMELINE-02: Actor required
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — actor required (INV-TIMELINE-02)', () => {
  it('timeline.insert.requires-actor — missing actor throws before DB', async () => {
    await expect(
      emitTimelineEvent({
        contactId: baseInput.contactId,
        kind: baseInput.kind,
        source: baseInput.source,
        actorUserId: null,
        actorSystem: null,
        payload: baseInput.payload,
      }),
    ).rejects.toThrow(/actorUserId or actorSystem/)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('timeline.insert.requires-actor — null actor values throw before DB', async () => {
    await expect(
      emitTimelineEvent({
        contactId: baseInput.contactId,
        kind: baseInput.kind,
        source: baseInput.source,
        actorUserId: null,
        actorSystem: null,
        payload: baseInput.payload,
      }),
    ).rejects.toThrow(/actorUserId or actorSystem/)
  })

  it('timeline.insert.actor-system — actorSystem alone is accepted', async () => {
    const result = await emitTimelineEvent({
      contactId: baseInput.contactId,
      kind: baseInput.kind,
      source: baseInput.source,
      actorSystem: 'automation_engine',
      payload: baseInput.payload,
    })
    expect(result).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// BR-TIMELINE INV-TIMELINE-06: occurredAt not in future
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — occurredAt not in future (INV-TIMELINE-06)', () => {
  it('timeline.insert.rejects-future-occurredAt — future date throws before DB', async () => {
    const future = new Date(Date.now() + 60_000)

    await expect(
      emitTimelineEvent({ ...baseInput, occurredAt: future }),
    ).rejects.toThrow(TimelineOccurredAtError)

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('timeline.insert.rejects-future-occurredAt — error message mentions future', async () => {
    const future = new Date(Date.now() + 60_000)

    await expect(
      emitTimelineEvent({ ...baseInput, occurredAt: future }),
    ).rejects.toThrow(/future/)
  })

  it('timeline.insert.accepts-past-occurredAt — past date is accepted', async () => {
    const past = new Date(Date.now() - 60_000)
    const result = await emitTimelineEvent({ ...baseInput, occurredAt: past })
    expect(result).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Happy path — valid inputs reach the DB
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — happy path', () => {
  it('timeline.insert.happy — valid contact_updated calls DB and returns event', async () => {
    const result = await emitTimelineEvent(baseInput)

    expect(mockInsert).toHaveBeenCalledOnce()
    expect(result.kind).toBe('contact_updated')
    expect(result.contactId).toBe(FIXED_CONTACT)
  })

  it('timeline.insert.happy — valid contact_created is accepted', async () => {
    mockReturning.mockResolvedValueOnce([{
      ...happyRow,
      kind: 'contact_created',
      payload: { origin: 'manual' },
    }])

    const result = await emitTimelineEvent({
      ...baseInput,
      kind: 'contact_created',
      payload: { origin: 'manual' },
    })

    expect(result.kind).toBe('contact_created')
  })

  it('timeline.insert.happy — valid contact_tag_added is accepted', async () => {
    mockReturning.mockResolvedValueOnce([{
      ...happyRow,
      kind: 'contact_tag_added',
      payload: { tag: 'vip', source: 'manual' },
    }])

    const result = await emitTimelineEvent({
      ...baseInput,
      kind: 'contact_tag_added',
      payload: { tag: 'vip', source: 'manual' },
    })

    expect(result.kind).toBe('contact_tag_added')
  })

  it('timeline.insert.happy — valid contact_merged is accepted', async () => {
    mockReturning.mockResolvedValueOnce([{
      ...happyRow,
      kind: 'contact_merged',
      source: 'MOD-MERGE',
      payload: {
        merged_into: FIXED_ID,
        merged_from: FIXED_CONTACT,
        reason: 'duplicate contact',
      },
    }])

    const result = await emitTimelineEvent({
      ...baseInput,
      kind: 'contact_merged',
      source: 'MOD-MERGE',
      payload: {
        merged_into: FIXED_ID,
        merged_from: FIXED_CONTACT,
        reason: 'duplicate contact',
      },
    })

    expect(result.kind).toBe('contact_merged')
  })

  it('timeline.insert.happy — valid sale_approved is accepted', async () => {
    mockReturning.mockResolvedValueOnce([{
      ...happyRow,
      kind: 'sale_approved',
      source: 'MOD-TRANSACTION',
      payload: { transaction_id: FIXED_ID, amount: 99.9, offer_id: FIXED_ID },
    }])

    const result = await emitTimelineEvent({
      ...baseInput,
      kind: 'sale_approved',
      source: 'MOD-TRANSACTION',
      payload: { transaction_id: FIXED_ID, amount: 99.9, offer_id: FIXED_ID },
    })

    expect(result.kind).toBe('sale_approved')
  })

  it('timeline.insert.happy — occurredAt defaults to now when omitted', async () => {
    const before = new Date()
    await emitTimelineEvent(baseInput)
    const after = new Date()

    // Extract the occurredAt passed to .values()
    const call = mockValues.mock.calls[0]
    expect(call).toBeDefined()
    const valuesArg = call![0] as { occurredAt: Date }
    expect(valuesArg.occurredAt.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(valuesArg.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})
