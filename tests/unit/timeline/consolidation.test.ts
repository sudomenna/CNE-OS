/**
 * Unit tests — FLOW-08: timeline de consolidação pós-merge (T-13-20)
 *
 * INV-TIMELINE-07: consolidação feita na leitura — eventos históricos do
 *   secundário continuam com contact_id original; a query inclui todos os IDs
 *   da merge tree via busca iterativa em memória.
 *
 * ADR-10: lança ContactNotFoundError quando contato não existe (nunca retorna
 *   resultado parcial silencioso).
 *
 * Testes sem DB real — db mockado via vi.mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ID_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const ID_B = 'bbbbbbbb-0000-0000-0000-000000000002'
const ID_C = 'cccccccc-0000-0000-0000-000000000003'
const ID_BRAND = 'dddddddd-0000-0000-0000-000000000004'
const ID_USER  = 'eeeeeeee-0000-0000-0000-000000000005'

function makeEvent(overrides: Partial<{
  id: string
  contactId: string
  occurredAt: Date
  kind: string
}> = {}) {
  const occurredAt = overrides.occurredAt ?? new Date('2024-06-01T12:00:00.000Z')
  return {
    id: overrides.id ?? 'f0000000-0000-0000-0000-000000000001',
    contactId: overrides.contactId ?? ID_A,
    brandId: ID_BRAND,
    kind: overrides.kind ?? 'contact_updated',
    source: 'MOD-CONTACT',
    actorUserId: ID_USER,
    actorSystem: null,
    subjectKind: null,
    subjectId: null,
    payload: {},
    occurredAt,
    createdAt: occurredAt,
  }
}

// ---------------------------------------------------------------------------
// Mock DB — chainable builder, resultado controlado por fila
// ---------------------------------------------------------------------------

const __dbSelectResults: Array<unknown[]> = []

function drainNextResult(): unknown[] {
  return __dbSelectResults.shift() ?? []
}

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

vi.mock('@/lib/db/schema/contact', () => ({
  contact: { id: 'contact.id', mergedIntoId: 'contact.mergedIntoId' },
}))

vi.mock('@/lib/db/schema/timeline', () => ({
  timelineEvent: {
    contactId: 'te.contactId',
    occurredAt: 'te.occurredAt',
    id: 'te.id',
    kind: 'te.kind',
    brandId: 'te.brandId',
  },
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
// Helpers
// ---------------------------------------------------------------------------

function setupSelectSequence(...results: unknown[][]) {
  __dbSelectResults.length = 0
  __dbSelectResults.push(...results)
  mockSelect.mockImplementation(() => makeSelectChain(drainNextResult()))
}

/**
 * Captura os contact IDs passados ao inArray da query final de eventos.
 * Substitui temporariamente mockSelect para interceptar a condição WHERE.
 */
function setupSelectSequenceCapturingIds(
  ...results: unknown[][]
): { captured: { ids: string[] | null } } {
  const captured = { ids: null as string[] | null }
  __dbSelectResults.length = 0
  __dbSelectResults.push(...results)

  mockSelect.mockImplementation(() => {
    const result = drainNextResult()
    const chain: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
      catch: (reject: (e: unknown) => unknown) => Promise.resolve(result).catch(reject),
      from: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      where: (condition: unknown) => {
        if (condition && typeof condition === 'object') {
          const cond = condition as Record<string, unknown>
          if (cond['op'] === 'and') {
            const args = cond['args'] as Array<Record<string, unknown>>
            const inArrayCond = args[0]
            if (inArrayCond && inArrayCond['op'] === 'inArray') {
              captured.ids = inArrayCond['vals'] as string[]
            }
          }
        }
        return chain
      },
    }
    return chain
  })

  return { captured }
}

beforeEach(() => {
  __dbSelectResults.length = 0
  mockSelect.mockReset()
})

// ---------------------------------------------------------------------------
// describe('FLOW-08.consolidation', ...)
// ---------------------------------------------------------------------------

describe('FLOW-08.consolidation', () => {
  // -------------------------------------------------------------------------
  // Caso 1: contato sem merges
  // -------------------------------------------------------------------------
  describe('given contact with no merges when listTimelineEvents then returns only its own events', () => {
    it('returns events belonging only to the principal contact', async () => {
      const ev1 = makeEvent({ id: 'ev000001-0000-0000-0000-000000000001', contactId: ID_A, occurredAt: new Date('2024-06-01T10:00:00Z') })
      const ev2 = makeEvent({ id: 'ev000002-0000-0000-0000-000000000002', contactId: ID_A, occurredAt: new Date('2024-06-01T09:00:00Z') })

      const { captured } = setupSelectSequenceCapturingIds(
        [{ id: ID_A, mergedIntoId: null }],  // contact lookup — nenhum merged_into_id
        [],                                    // busca de merged contacts (nível 1) — vazia
        [ev1, ev2],                            // eventos
      )

      const page = await listTimelineEvents(ID_A)

      expect(page.events).toHaveLength(2)
      // Apenas o ID_A deve estar no inArray da query de eventos
      expect(captured.ids).not.toBeNull()
      expect(captured.ids).toEqual([ID_A])
    })
  })

  // -------------------------------------------------------------------------
  // Caso 2: contato com 1 merged — retorna eventos dos dois ordenados por data
  // -------------------------------------------------------------------------
  describe('given contact B merged into A when listTimelineEvents(A) then returns events of both ordered by date', () => {
    it('returns events from principal and merged contact, most recent first', async () => {
      const evA = makeEvent({ id: 'ev-a-0001-0000-0000-0000-000000000001', contactId: ID_A, occurredAt: new Date('2024-06-02T10:00:00Z') })
      const evB = makeEvent({ id: 'ev-b-0001-0000-0000-0000-000000000002', contactId: ID_B, occurredAt: new Date('2024-06-01T10:00:00Z') })

      // DB retorna já na ordem DESC (como Drizzle faria com orderBy)
      const { captured } = setupSelectSequenceCapturingIds(
        [{ id: ID_A, mergedIntoId: null }],   // contact lookup principal
        [{ id: ID_B }],                         // B.merged_into_id = A (nível 1)
        [],                                      // nenhum merged no nível 2
        [evA, evB],                              // eventos de ambos
      )

      const page = await listTimelineEvents(ID_A)

      expect(page.events).toHaveLength(2)
      // INV-TIMELINE-07: query inclui ambos os IDs
      expect(captured.ids).toContain(ID_A)
      expect(captured.ids).toContain(ID_B)
      // Ordem DESC: evento mais recente primeiro
      expect(page.events[0]!.occurredAt.getTime()).toBeGreaterThanOrEqual(
        page.events[1]!.occurredAt.getTime(),
      )
    })
  })

  // -------------------------------------------------------------------------
  // Caso 3: merge em cadeia (A ← B ← C): query de A retorna eventos de A, B e C
  // -------------------------------------------------------------------------
  describe('given chain A <- B <- C when listTimelineEvents(A) then returns events of A, B and C', () => {
    it('resolves chain depth-2 and includes all three contact IDs in query', async () => {
      const evA = makeEvent({ id: 'ev-a-0001-0000-0000-0000-000000000001', contactId: ID_A, occurredAt: new Date('2024-06-03T10:00:00Z') })
      const evB = makeEvent({ id: 'ev-b-0001-0000-0000-0000-000000000002', contactId: ID_B, occurredAt: new Date('2024-06-02T10:00:00Z') })
      const evC = makeEvent({ id: 'ev-c-0001-0000-0000-0000-000000000003', contactId: ID_C, occurredAt: new Date('2024-06-01T10:00:00Z') })

      // Iteração: nível 1 → B tem merged_into_id=A; nível 2 → C tem merged_into_id=B
      const { captured } = setupSelectSequenceCapturingIds(
        [{ id: ID_A, mergedIntoId: null }],   // contact lookup principal
        [{ id: ID_B }],                         // nível 1: B merged em A
        [{ id: ID_C }],                         // nível 2: C merged em B
        [],                                      // nível 3: ninguém merged em C
        [evA, evB, evC],                         // eventos dos três
      )

      const page = await listTimelineEvents(ID_A)

      expect(page.events).toHaveLength(3)
      // Todos os três IDs devem estar na query de eventos
      expect(captured.ids).toContain(ID_A)
      expect(captured.ids).toContain(ID_B)
      expect(captured.ids).toContain(ID_C)
    })
  })

  // -------------------------------------------------------------------------
  // Caso 4: contact inexistente — lança ContactNotFoundError (ADR-10)
  // -------------------------------------------------------------------------
  describe('given non-existent contact when listTimelineEvents then throws ContactNotFoundError', () => {
    it('throws ContactNotFoundError — never returns partial or empty array silently', async () => {
      // ADR-10: funções públicas lançam DomainError; nunca retornam silenciosamente
      setupSelectSequence(
        [],  // contact não encontrado
      )

      await expect(listTimelineEvents('00000000-dead-beef-0000-000000000000')).rejects.toThrow(
        ContactNotFoundError,
      )
    })

    it('error message contains the contactId for traceability', async () => {
      const missingId = '00000000-dead-beef-0000-000000000000'
      setupSelectSequence([])

      await expect(listTimelineEvents(missingId)).rejects.toThrow(missingId)
    })
  })
})
