/**
 * Unit tests — listTimelineEvents (T-1-13)
 *
 * INV-TIMELINE-07: consolidação feita na leitura, não via UPDATE.
 * ADR-10: lança ContactNotFoundError quando contato não existe.
 *
 * Testes sem DB real — db mockado via vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ID_PRINCIPAL  = 'aaaaaaaa-0000-0000-0000-000000000001'
const ID_SECUNDARIO = 'bbbbbbbb-0000-0000-0000-000000000002'
const ID_BRAND      = 'cccccccc-0000-0000-0000-000000000003'
const ID_USER       = 'dddddddd-0000-0000-0000-000000000004'

function makeEvent(overrides: Partial<{
  id: string
  contactId: string
  occurredAt: Date
  kind: string
}> = {}) {
  const occurredAt = overrides.occurredAt ?? new Date('2024-01-15T10:00:00.000Z')
  return {
    id: overrides.id ?? 'eeeeeeee-0000-0000-0000-000000000001',
    contactId: overrides.contactId ?? ID_PRINCIPAL,
    brandId: ID_BRAND,
    kind: overrides.kind ?? 'contact_updated',
    source: 'MOD-CONTACT',
    actorUserId: ID_USER,
    actorSystem: null,
    subjectKind: null,
    subjectId: null,
    payload: { field: 'full_name', from: 'A', to: 'B' },
    occurredAt,
    createdAt: occurredAt,
  }
}

// ---------------------------------------------------------------------------
// Mock DB — fluent builder that captures calls and returns configurable results
// ---------------------------------------------------------------------------

/**
 * `db.select().from().where().limit().orderBy()...` returns the final resolved
 * value. We mock the full chain by returning an object that always resolves.
 *
 * The mock is controlled by `__dbSelectResults` — a queue of arrays, one per
 * `db.select()` call (in call order).
 */
const __dbSelectResults: Array<unknown[]> = []

function drainNextResult(): unknown[] {
  return __dbSelectResults.shift() ?? []
}

// A chainable query builder that resolves when awaited.
function makeSelectChain(result: unknown[]): Record<string, unknown> {
  const thenable: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    catch: (reject: (e: unknown) => unknown) => Promise.resolve(result).catch(reject),
  }
  const methods = ['from', 'where', 'limit', 'orderBy']
  for (const m of methods) {
    thenable[m] = () => thenable
  }
  return thenable
}

const mockSelect = vi.fn()

vi.mock('@/lib/db/client', () => ({
  db: {
    get select() {
      return mockSelect
    },
  },
}))

// These mocks only need to exist to satisfy imports in read.ts
vi.mock('@/lib/db/schema/contact', () => ({
  contact: { id: 'contact.id', mergedIntoId: 'contact.mergedIntoId' },
}))

vi.mock('@/lib/db/schema/timeline', () => ({
  timelineEvent: { contactId: 'te.contactId', occurredAt: 'te.occurredAt', id: 'te.id', kind: 'te.kind', brandId: 'te.brandId' },
}))

vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (col: unknown) => ({ op: 'desc', col }),
  eq: (col: unknown, val: unknown) => ({ op: 'eq', col, val }),
  inArray: (col: unknown, vals: unknown) => ({ op: 'inArray', col, vals }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  lt: (col: unknown, val: unknown) => ({ op: 'lt', col, val }),
  lte: (col: unknown, val: unknown) => ({ op: 'lte', col, val }),
  gte: (col: unknown, val: unknown) => ({ op: 'gte', col, val }),
}))

// Import AFTER mocks
const { listTimelineEvents, ContactNotFoundError } = await import('@/lib/timeline/read')

// ---------------------------------------------------------------------------
// Helper — configure what each successive db.select() call resolves to
// ---------------------------------------------------------------------------
function setupSelectSequence(...results: unknown[][]) {
  __dbSelectResults.length = 0
  __dbSelectResults.push(...results)
  mockSelect.mockImplementation(() => makeSelectChain(drainNextResult()))
}

beforeEach(() => {
  __dbSelectResults.length = 0
  mockSelect.mockReset()
})

// ---------------------------------------------------------------------------
// timeline.read.by-contact.ordered
// ---------------------------------------------------------------------------
describe('timeline.read.by-contact.ordered', () => {
  it('given 3 events for a contactId, listTimelineEvents returns them ordered by occurredAt DESC', async () => {
    const e1 = makeEvent({ id: 'e1111111-0000-0000-0000-000000000001', occurredAt: new Date('2024-01-01T10:00:00Z') })
    const e2 = makeEvent({ id: 'e2222222-0000-0000-0000-000000000002', occurredAt: new Date('2024-01-02T10:00:00Z') })
    const e3 = makeEvent({ id: 'e3333333-0000-0000-0000-000000000003', occurredAt: new Date('2024-01-03T10:00:00Z') })

    // DB returns events already ordered DESC (as Drizzle would with orderBy)
    const eventsOrdered = [e3, e2, e1]

    setupSelectSequence(
      [{ id: ID_PRINCIPAL, mergedIntoId: null }],  // contact lookup
      [],                                            // merged contacts level-1 (none)
      eventsOrdered,                                 // timeline_event query
    )

    const page = await listTimelineEvents(ID_PRINCIPAL)

    expect(page.events).toHaveLength(3)
    expect(page.events[0]!.occurredAt.getTime()).toBeGreaterThanOrEqual(page.events[1]!.occurredAt.getTime())
    expect(page.events[1]!.occurredAt.getTime()).toBeGreaterThanOrEqual(page.events[2]!.occurredAt.getTime())
  })
})

// ---------------------------------------------------------------------------
// timeline.read.merged-contact.consolidates
// ---------------------------------------------------------------------------
describe('timeline.read.merged-contact.consolidates', () => {
  it('given a secondary contact merged into principal, listTimelineEvents queries both IDs', async () => {
    const eventPrincipal = makeEvent({ contactId: ID_PRINCIPAL })
    const eventSecundario = makeEvent({ contactId: ID_SECUNDARIO })

    // Capture the inArray call argument to verify both IDs are included
    let capturedContactIds: string[] | null = null

    // We override mockSelect to inspect what is being queried.
    // The chain's .where() receives Drizzle conditions — we check via call count and result.
    setupSelectSequence(
      [{ id: ID_PRINCIPAL, mergedIntoId: null }],         // contact lookup
      [{ id: ID_SECUNDARIO }],                             // merged into principal (level-1)
      [],                                                   // merged into ID_SECUNDARIO (level-2, none)
      [eventPrincipal, eventSecundario],                   // timeline_event query
    )

    // Patch mockSelect to also spy on the inArray argument
    const origImpl = mockSelect.getMockImplementation()
    mockSelect.mockImplementation(function (...args: unknown[]) {
      const chain = origImpl!(...args) as Record<string, unknown>
      const origWhere = chain.where as (...a: unknown[]) => typeof chain
      chain.where = function (condition: unknown) {
        // Detect the final event query by checking the condition structure
        if (
          condition &&
          typeof condition === 'object' &&
          (condition as Record<string, unknown>)['op'] === 'and'
        ) {
          const andArgs = (condition as Record<string, unknown[]>)['args'] as Array<Record<string, unknown>>
          const inArrayCond = andArgs[0]
          if (inArrayCond && inArrayCond['op'] === 'inArray') {
            capturedContactIds = inArrayCond['vals'] as string[]
          }
        }
        return origWhere.call(this, condition)
      }
      return chain
    })

    const page = await listTimelineEvents(ID_PRINCIPAL)

    expect(page.events).toHaveLength(2)
    // Verify the query included both principal and secondary
    expect(capturedContactIds).not.toBeNull()
    expect(capturedContactIds).toContain(ID_PRINCIPAL)
    expect(capturedContactIds).toContain(ID_SECUNDARIO)
  })
})

// ---------------------------------------------------------------------------
// timeline.read.pagination.returns-cursor
// ---------------------------------------------------------------------------
describe('timeline.read.pagination.returns-cursor', () => {
  it('given pageSize=2 and 2 events returned, nextCursor is not null and hasMore is true', async () => {
    const e1 = makeEvent({ id: 'f1111111-0000-0000-0000-000000000001', occurredAt: new Date('2024-01-02T10:00:00.000Z') })
    const e2 = makeEvent({ id: 'f2222222-0000-0000-0000-000000000002', occurredAt: new Date('2024-01-01T10:00:00.000Z') })

    setupSelectSequence(
      [{ id: ID_PRINCIPAL, mergedIntoId: null }],
      [],
      [e1, e2],
    )

    const page = await listTimelineEvents(ID_PRINCIPAL, undefined, null, 2)

    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).not.toBeNull()
    // cursor format: ISO_uuid
    expect(page.nextCursor).toBe(`${e2.occurredAt.toISOString()}_${e2.id}`)
  })
})

// ---------------------------------------------------------------------------
// timeline.read.pagination.no-cursor-when-empty-page
// ---------------------------------------------------------------------------
describe('timeline.read.pagination.no-cursor-when-empty-page', () => {
  it('given 0 events (empty second page), nextCursor is null and hasMore is false', async () => {
    setupSelectSequence(
      [{ id: ID_PRINCIPAL, mergedIntoId: null }],
      [],
      [],
    )

    const page = await listTimelineEvents(ID_PRINCIPAL, undefined, null, 50)

    expect(page.events).toHaveLength(0)
    expect(page.hasMore).toBe(false)
    expect(page.nextCursor).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// timeline.read.filter.by-kind
// ---------------------------------------------------------------------------
describe('timeline.read.filter.by-kind', () => {
  it('given kinds filter, the query conditions include an inArray on kind', async () => {
    const event = makeEvent({ kind: 'contact_updated' })

    let kindFilterApplied = false

    // Intercept .where() on the events query to detect kind inArray condition
    let selectCallCount = 0
    mockSelect.mockImplementation(() => {
      selectCallCount++
      const callIndex = selectCallCount
      const result = callIndex === 1
        ? [{ id: ID_PRINCIPAL, mergedIntoId: null }]
        : callIndex === 2
          ? []           // no merged contacts
          : [event]      // events

      const thenable: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
        catch: (reject: (e: unknown) => unknown) => Promise.resolve(result).catch(reject),
      }

      function makeChain(): typeof thenable {
        return {
          ...thenable,
          from: () => makeChain(),
          where: (condition: unknown) => {
            // For the events query (call 3+), inspect conditions for kind filter
            if (callIndex >= 3 && condition && typeof condition === 'object') {
              const cond = condition as Record<string, unknown>
              if (cond['op'] === 'and') {
                const args = cond['args'] as Array<Record<string, unknown>>
                for (const arg of args) {
                  if (arg['op'] === 'inArray' && String(arg['col']).includes('kind')) {
                    kindFilterApplied = true
                  }
                }
              }
            }
            return makeChain()
          },
          limit: () => makeChain(),
          orderBy: () => makeChain(),
        }
      }

      return makeChain()
    })

    await listTimelineEvents(ID_PRINCIPAL, { kinds: ['contact_updated'] })

    expect(kindFilterApplied).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// timeline.read.contact-not-found
// ---------------------------------------------------------------------------
describe('timeline.read.contact-not-found', () => {
  it('given contact query returns empty array, throws ContactNotFoundError', async () => {
    setupSelectSequence(
      [],  // contact not found
    )

    await expect(listTimelineEvents('nonexistent-uuid')).rejects.toThrow(ContactNotFoundError)
  })

  it('given contact query returns empty array, error message contains contactId', async () => {
    setupSelectSequence(
      [],
    )

    await expect(listTimelineEvents('nonexistent-uuid')).rejects.toThrow('nonexistent-uuid')
  })
})
