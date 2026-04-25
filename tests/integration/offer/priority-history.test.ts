/**
 * T-6-25 — priority-history integration tests
 *
 * INV-OFFER-02: toda mudança em offer_condition.priority ou advantage_score
 * deve registrar linha em offer_condition_priority_history.
 *
 * docs/20-domain/10-offer-engine.md §3.8, INV-OFFER-02
 * ADR-10: lança NoPriorityChangeError (subtipo de OfferDomainError) quando sem-op
 * ADR-11: tx como primeiro argumento
 *
 * Padrão de teste: mock de `tx` (igual a tests/integration/offer/sales-counter.test.ts).
 * A tabela offer_condition_priority_history é append-only por trigger Supabase;
 * aqui verificamos o comportamento da função de domínio (insert payload correto).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { recordPriorityChange, NoPriorityChangeError } from '@/lib/domain/offer/priority-history'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

/**
 * Constrói um mock de `tx` que captura chamadas a tx.insert(...).values(...)
 * e retorna `returnedRows` (ou undefined para simular void).
 */
function makeTxInsertMock(capturedValues: unknown[]): DbTx {
  const valuesFn = vi.fn().mockImplementation((row: unknown) => {
    capturedValues.push(row)
    return Promise.resolve(undefined)
  })
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn })
  return { insert: insertFn } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONDITION_ID = '00000000-0000-0000-0000-000000000042'
const USER_ID = '00000000-0000-0000-0000-000000000099'

// ---------------------------------------------------------------------------
// describe: recordPriorityChange
// ---------------------------------------------------------------------------

describe('recordPriorityChange', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── 1. Priority changed (score unchanged) ────────────────────────────────

  describe('given previous priority != new priority', () => {
    it('when recordPriorityChange then inserts row in history table', async () => {
      const captured: unknown[] = []
      const tx = makeTxInsertMock(captured)

      await recordPriorityChange(tx, {
        conditionId: CONDITION_ID,
        previousPriority: 5,
        newPriority: 10,
        previousAdvantageScore: 0,
        newAdvantageScore: 0,
        changedByUserId: USER_ID,
      })

      // insert must have been called once
      expect((tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert).toHaveBeenCalledOnce()

      // values must have been called with the correct payload
      const row = captured[0] as Record<string, unknown>
      expect(row['offerConditionId']).toBe(CONDITION_ID)
      expect(row['fromPriority']).toBe(5)
      expect(row['toPriority']).toBe(10)
      expect(row['changedByUserId']).toBe(USER_ID)
    })
  })

  // ── 2. Only score changed (priority unchanged) ───────────────────────────

  describe('given only advantageScore changed', () => {
    it('when recordPriorityChange then inserts row', async () => {
      const captured: unknown[] = []
      const tx = makeTxInsertMock(captured)

      await recordPriorityChange(tx, {
        conditionId: CONDITION_ID,
        previousPriority: 0,
        newPriority: 0,
        previousAdvantageScore: 10.5,
        newAdvantageScore: 20.0,
        changedByUserId: USER_ID,
      })

      expect((tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert).toHaveBeenCalledOnce()

      const row = captured[0] as Record<string, unknown>
      expect(row['offerConditionId']).toBe(CONDITION_ID)
      expect(row['fromPriority']).toBe(0)
      expect(row['toPriority']).toBe(0)
      expect(row['fromAdvantageScore']).toBe('10.5')
      expect(row['toAdvantageScore']).toBe('20')
    })
  })

  // ── 3. No change at all ───────────────────────────────────────────────────

  describe('given no change at all (priority and score identical)', () => {
    it('when recordPriorityChange then throws NoPriorityChangeError', async () => {
      const captured: unknown[] = []
      const tx = makeTxInsertMock(captured)

      await expect(
        recordPriorityChange(tx, {
          conditionId: CONDITION_ID,
          previousPriority: 5,
          newPriority: 5,
          previousAdvantageScore: 100,
          newAdvantageScore: 100,
          changedByUserId: USER_ID,
        }),
      ).rejects.toThrow(NoPriorityChangeError)

      // Must NOT have inserted any row
      expect((tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled()
    })

    it('when recordPriorityChange then error contains conditionId', async () => {
      const captured: unknown[] = []
      const tx = makeTxInsertMock(captured)

      await expect(
        recordPriorityChange(tx, {
          conditionId: CONDITION_ID,
          previousPriority: 0,
          newPriority: 0,
          previousAdvantageScore: 0,
          newAdvantageScore: 0,
          changedByUserId: USER_ID,
        }),
      ).rejects.toMatchObject({
        name: 'NoPriorityChangeError',
        conditionId: CONDITION_ID,
      })
    })
  })

  // ── 4. Multiple calls append multiple rows ────────────────────────────────

  describe('given multiple calls (append-only)', () => {
    it('when recordPriorityChange called twice then two rows are inserted', async () => {
      const captured1: unknown[] = []
      const tx1 = makeTxInsertMock(captured1)

      await recordPriorityChange(tx1, {
        conditionId: CONDITION_ID,
        previousPriority: 0,
        newPriority: 5,
        previousAdvantageScore: 0,
        newAdvantageScore: 0,
        changedByUserId: USER_ID,
      })

      const captured2: unknown[] = []
      const tx2 = makeTxInsertMock(captured2)

      await recordPriorityChange(tx2, {
        conditionId: CONDITION_ID,
        previousPriority: 5,
        newPriority: 10,
        previousAdvantageScore: 0,
        newAdvantageScore: 0,
        changedByUserId: USER_ID,
      })

      // Each call inserts exactly 1 row — append-only pattern
      expect(captured1).toHaveLength(1)
      expect(captured2).toHaveLength(1)

      const row1 = captured1[0] as Record<string, unknown>
      const row2 = captured2[0] as Record<string, unknown>

      // First row: 0 → 5
      expect(row1['fromPriority']).toBe(0)
      expect(row1['toPriority']).toBe(5)

      // Second row: 5 → 10 (append — does not overwrite first)
      expect(row2['fromPriority']).toBe(5)
      expect(row2['toPriority']).toBe(10)
    })
  })

  // ── 5. Both priority and score changed ───────────────────────────────────

  describe('given both priority and score changed', () => {
    it('when recordPriorityChange then row contains all four values correctly', async () => {
      const captured: unknown[] = []
      const tx = makeTxInsertMock(captured)

      await recordPriorityChange(tx, {
        conditionId: CONDITION_ID,
        previousPriority: -5,
        newPriority: 100,
        previousAdvantageScore: 50.25,
        newAdvantageScore: 99.99,
        changedByUserId: USER_ID,
      })

      const row = captured[0] as Record<string, unknown>
      expect(row['fromPriority']).toBe(-5)
      expect(row['toPriority']).toBe(100)
      expect(row['fromAdvantageScore']).toBe('50.25')
      expect(row['toAdvantageScore']).toBe('99.99')
      expect(row['changedByUserId']).toBe(USER_ID)
    })
  })
})
