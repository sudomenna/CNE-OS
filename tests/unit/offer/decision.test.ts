/**
 * Unit tests for selectCondition (lib/domain/offer/decision.ts)
 *
 * T-6-14
 * BR-OFFER-DECISION
 * docs/20-domain/10-offer-engine.md §11
 */

import { describe, it, expect } from 'vitest'
import {
  selectCondition,
  type EligibleCondition,
} from '../../../lib/domain/offer/decision'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCondition(
  overrides: Partial<EligibleCondition> & { id: string },
): EligibleCondition {
  return {
    priority: 0,
    advantageScore: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    isDefault: false,
    ...overrides,
  }
}

const T0 = new Date('2026-01-01T00:00:00Z')
const T1 = new Date('2026-03-01T00:00:00Z')
const T2 = new Date('2026-06-01T00:00:00Z')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-OFFER-DECISION selectCondition', () => {
  // Test 1 — fallback default when no non-default eligible conditions
  it('given no eligible non-default conditions when selectCondition then returns kind:default', () => {
    const defaultCond = makeCondition({ id: 'default-1', isDefault: true })

    const result = selectCondition([defaultCond])

    expect(result.kind).toBe('default')
    expect((result as { kind: 'default'; conditionId: string }).conditionId).toBe(
      'default-1',
    )
  })

  // Test 2 — priority wins over score
  it('given conditionA priority=10 score=1 and conditionB priority=5 score=100 when selectCondition then conditionA wins', () => {
    const a = makeCondition({ id: 'A', priority: 10, advantageScore: 1 })
    const b = makeCondition({ id: 'B', priority: 5, advantageScore: 100 })

    const result = selectCondition([a, b])

    expect(result.kind).toBe('selected')
    expect((result as { kind: 'selected'; conditionId: string }).conditionId).toBe('A')
  })

  // Test 3 — score tiebreak when priority is equal
  it('given same priority and conditionA score=5 conditionB score=8 when selectCondition then conditionB wins', () => {
    const a = makeCondition({ id: 'A', priority: 10, advantageScore: 5 })
    const b = makeCondition({ id: 'B', priority: 10, advantageScore: 8 })

    const result = selectCondition([a, b])

    expect(result.kind).toBe('selected')
    expect((result as { kind: 'selected'; conditionId: string }).conditionId).toBe('B')
  })

  // Test 4 — timestamp tiebreak: newer condition wins (createdAt DESC, BR-OFFER-DECISION §Tabela linha 4)
  it('given same priority and score when conditionB newer than conditionA then conditionB wins', () => {
    const a = makeCondition({
      id: 'A',
      priority: 10,
      advantageScore: 5,
      createdAt: T0, // 2026-01-01 — older
    })
    const b = makeCondition({
      id: 'B',
      priority: 10,
      advantageScore: 5,
      createdAt: T1, // 2026-03-01 — newer
    })

    const result = selectCondition([a, b])

    expect(result.kind).toBe('selected')
    // BR-OFFER-DECISION step 4: createdAt DESC — newer wins (T1 > T0 → B wins)
    expect((result as { kind: 'selected'; conditionId: string }).conditionId).toBe('B')
  })

  // Test 5 — conflict when 2+ conditions share all three tiebreak criteria
  it('given two conditions with same priority+score+createdAt when selectCondition then returns kind:conflict', () => {
    const a = makeCondition({
      id: 'A',
      priority: 10,
      advantageScore: 5,
      createdAt: T0,
    })
    const b = makeCondition({
      id: 'B',
      priority: 10,
      advantageScore: 5,
      createdAt: T0,
    })

    const result = selectCondition([a, b])

    expect(result.kind).toBe('conflict')
  })

  // Test 6 — conflict returns all tied IDs
  it('given three-way tie when selectCondition then conflict contains all conflicting IDs', () => {
    const a = makeCondition({
      id: 'A',
      priority: 5,
      advantageScore: 3,
      createdAt: T2,
    })
    const b = makeCondition({
      id: 'B',
      priority: 5,
      advantageScore: 3,
      createdAt: T2,
    })
    const c = makeCondition({
      id: 'C',
      priority: 5,
      advantageScore: 3,
      createdAt: T2,
    })
    const d = makeCondition({
      id: 'D',
      priority: 1,
      advantageScore: 100,
      createdAt: T0,
    })

    const result = selectCondition([a, b, c, d])

    expect(result.kind).toBe('conflict')
    const ids = (result as { kind: 'conflict'; conditionIds: string[] })
      .conditionIds
    expect(ids).toHaveLength(3)
    expect(ids).toContain('A')
    expect(ids).toContain('B')
    expect(ids).toContain('C')
    expect(ids).not.toContain('D')
  })

  // Test 7 — kind:none when no eligible conditions and no default
  it('given empty conditions list when selectCondition then returns kind:none', () => {
    const result = selectCondition([])

    expect(result.kind).toBe('none')
  })

  // Test 8 — single eligible condition returns selected
  it('given single non-default eligible condition when selectCondition then returns kind:selected with that conditionId', () => {
    const a = makeCondition({ id: 'solo', priority: 5, advantageScore: 10 })

    const result = selectCondition([a])

    expect(result.kind).toBe('selected')
    expect((result as { kind: 'selected'; conditionId: string }).conditionId).toBe(
      'solo',
    )
  })

  // Bonus: default is bypassed when non-default eligible conditions exist
  it('given eligible non-default condition and default condition when selectCondition then non-default wins', () => {
    const eligible = makeCondition({
      id: 'eligible',
      priority: 0,
      advantageScore: 0,
      isDefault: false,
    })
    const defaultCond = makeCondition({ id: 'default', isDefault: true })

    const result = selectCondition([eligible, defaultCond])

    expect(result.kind).toBe('selected')
    expect(
      (result as { kind: 'selected'; conditionId: string }).conditionId,
    ).toBe('eligible')
  })

  // Edge: kind:none — no eligible non-default AND no default (even when array has only defaults removed)
  it('given only non-default conditions that yield empty candidates and no default when selectCondition then none', () => {
    // Simulates caller passing zero conditions after filtering ineligible ones
    const result = selectCondition([])

    expect(result.kind).toBe('none')
  })
})
