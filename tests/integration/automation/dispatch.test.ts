/**
 * Tests: dispatchTrigger — Dispatcher de gatilhos de automação (T-11-06)
 *
 * docs/20-domain/15-automation.md §2 (dispatcher)
 * docs/80-roadmap/08-sprint-11-automations.md T-11-06 (6 casos obrigatórios)
 *
 * ADR-10: funções retornam Promise<T>, sem Result<T,E>
 * ADR-11: tx: DbTx como primeiro argumento
 *
 * Zero I/O real: tx mockado via vi.fn().
 * Cobre todos os ramos:
 *   1. Nenhum fluxo ativo para o kind → retorna []
 *   2. Fluxo ativo sem filter → cria execution, retorna executionId
 *   3. Fluxo ativo com filter compatível → cria execution
 *   4. Fluxo ativo com filter incompatível → não cria execution
 *   5. Segundo dispatch com mesmo (flowId, kind, subjectId, minuto) → ignorado, retorna []
 *   6. Dois fluxos ativos para o mesmo kind → cria 2 executions
 *
 * Testes adicionais:
 *   7. computeIdempotencyKey: mesmo minuto → mesma chave; minuto diferente → chave diferente
 *   8. matchesFilter: filter vazio → true; filter com match → true; filter sem match → false
 */

import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import {
  dispatchTrigger,
  computeIdempotencyKey,
  matchesFilter,
} from '@/lib/domain/automation/dispatch'
import type { TriggerSubject } from '@/lib/domain/automation/dispatch'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures — IDs determinísticos
// ---------------------------------------------------------------------------

const FLOW_ID_1 = '00000000-0000-0000-0000-000000000001'
const FLOW_ID_2 = '00000000-0000-0000-0000-000000000002'
const EXEC_ID_1 = '00000000-0000-0000-0000-000000000011'
const EXEC_ID_2 = '00000000-0000-0000-0000-000000000012'
const SUBJECT_ID = '00000000-0000-0000-0000-000000000099'

const DEFAULT_SUBJECT: TriggerSubject = {
  subjectKind: 'funnel_entry',
  subjectId: SUBJECT_ID,
  data: { funnelId: 'funnel-abc', contactId: 'contact-xyz' },
}

// ---------------------------------------------------------------------------
// Factory — mock tx builder
//
// A mock Drizzle transaction precisa simular a query builder chain:
//   tx.select({...}).from(...).innerJoin(...).innerJoin(...).where(...) → rows
//   tx.insert(...).values({...}).returning({...}).onConflictDoNothing() → [row] | []
// ---------------------------------------------------------------------------

function makeTx(options: {
  /** Resultado para .select().from().innerJoin().innerJoin().where() */
  flows?: Array<{ flowId: string; triggerFilter: Record<string, unknown> }>
  /** Resultado para .insert().values().returning().onConflictDoNothing() — por flowId */
  insertResultsMap?: Map<string, { id: string } | undefined>
}): DbTx {
  const { flows = [], insertResultsMap = new Map() } = options

  // Builder chain select
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(flows),
  }

  // Como insert é chamado N vezes (um por flow), precisamos criar uma chain por chamada
  const insertCalls: Array<{ id: string } | undefined>[] = []
  for (const [, result] of insertResultsMap) {
    insertCalls.push(result !== undefined ? [result] : [])
  }
  // Fila de resultados de insert
  let insertCallIndex = 0
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockImplementation(() => {
      const result = insertCalls[insertCallIndex] ?? []
      insertCallIndex++
      return Promise.resolve(result)
    }),
  }

  const tx = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
  } as unknown as DbTx

  return tx
}

// ---------------------------------------------------------------------------
// Testes de utilitários puros
// ---------------------------------------------------------------------------

describe('computeIdempotencyKey', () => {
  it('given same inputs within same minute when called twice then returns same key', () => {
    const t1 = new Date('2026-04-25T10:30:00.000Z')
    const t2 = new Date('2026-04-25T10:30:59.999Z') // mesmo minuto
    const k1 = computeIdempotencyKey(FLOW_ID_1, 'sale_approved', SUBJECT_ID, t1)
    const k2 = computeIdempotencyKey(FLOW_ID_1, 'sale_approved', SUBJECT_ID, t2)
    expect(k1).toBe(k2)
  })

  it('given same inputs but different minute when called then returns different key', () => {
    const t1 = new Date('2026-04-25T10:30:00.000Z')
    const t2 = new Date('2026-04-25T10:31:00.000Z') // minuto diferente
    const k1 = computeIdempotencyKey(FLOW_ID_1, 'sale_approved', SUBJECT_ID, t1)
    const k2 = computeIdempotencyKey(FLOW_ID_1, 'sale_approved', SUBJECT_ID, t2)
    expect(k1).not.toBe(k2)
  })

  it('given different flowId when called then returns different key', () => {
    const t = new Date('2026-04-25T10:30:00.000Z')
    const k1 = computeIdempotencyKey(FLOW_ID_1, 'sale_approved', SUBJECT_ID, t)
    const k2 = computeIdempotencyKey(FLOW_ID_2, 'sale_approved', SUBJECT_ID, t)
    expect(k1).not.toBe(k2)
  })

  it('given different subjectId when called then returns different key', () => {
    const t = new Date('2026-04-25T10:30:00.000Z')
    const k1 = computeIdempotencyKey(FLOW_ID_1, 'sale_approved', 'subject-a', t)
    const k2 = computeIdempotencyKey(FLOW_ID_1, 'sale_approved', 'subject-b', t)
    expect(k1).not.toBe(k2)
  })

  it('given any inputs when called then returns 64-char hex string', () => {
    const t = new Date()
    const k = computeIdempotencyKey(FLOW_ID_1, 'funnel_enter', SUBJECT_ID, t)
    expect(k).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('matchesFilter', () => {
  it('given empty filter when called then returns true for any subject data', () => {
    expect(matchesFilter({}, {})).toBe(true)
    expect(matchesFilter({}, { funnelId: 'abc' })).toBe(true)
    expect(matchesFilter({}, { anything: 'x' })).toBe(true)
  })

  it('given filter with matching key when called then returns true', () => {
    expect(matchesFilter({ funnelId: 'funnel-abc' }, { funnelId: 'funnel-abc' })).toBe(true)
  })

  it('given filter with non-matching key when called then returns false', () => {
    expect(matchesFilter({ funnelId: 'funnel-abc' }, { funnelId: 'funnel-xyz' })).toBe(false)
  })

  it('given filter with multiple keys all matching when called then returns true', () => {
    expect(
      matchesFilter(
        { funnelId: 'funnel-abc', brandId: 'brand-1' },
        { funnelId: 'funnel-abc', brandId: 'brand-1', extra: 'ignored' },
      ),
    ).toBe(true)
  })

  it('given filter with multiple keys one not matching when called then returns false', () => {
    expect(
      matchesFilter(
        { funnelId: 'funnel-abc', brandId: 'brand-1' },
        { funnelId: 'funnel-abc', brandId: 'brand-2' },
      ),
    ).toBe(false)
  })

  it('given filter with key absent in subject when called then returns false', () => {
    expect(matchesFilter({ funnelId: 'funnel-abc' }, {})).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Testes de dispatchTrigger (integração com mock tx)
// ---------------------------------------------------------------------------

describe('dispatchTrigger', () => {
  it('given no active flows for kind when dispatch then returns empty array', async () => {
    // INV-AUTOMATION: nenhum fluxo ativo → array vazio
    const tx = makeTx({ flows: [] })

    const result = await dispatchTrigger('sale_approved', DEFAULT_SUBJECT, tx)

    expect(result).toEqual([])
  })

  it('given active flow with empty filter when dispatch then creates execution and returns executionId', async () => {
    // Fluxo sem filter → captura todos os subjects do kind
    const tx = makeTx({
      flows: [{ flowId: FLOW_ID_1, triggerFilter: {} }],
      insertResultsMap: new Map([[FLOW_ID_1, { id: EXEC_ID_1 }]]),
    })

    const result = await dispatchTrigger('funnel_enter', DEFAULT_SUBJECT, tx)

    expect(result).toEqual([EXEC_ID_1])
  })

  it('given active flow with compatible filter when dispatch then creates execution', async () => {
    // Fluxo com filter.funnelId que bate com subject.data.funnelId
    const tx = makeTx({
      flows: [{ flowId: FLOW_ID_1, triggerFilter: { funnelId: 'funnel-abc' } }],
      insertResultsMap: new Map([[FLOW_ID_1, { id: EXEC_ID_1 }]]),
    })

    const subject: TriggerSubject = {
      subjectKind: 'funnel_entry',
      subjectId: SUBJECT_ID,
      data: { funnelId: 'funnel-abc', contactId: 'contact-xyz' },
    }

    const result = await dispatchTrigger('funnel_enter', subject, tx)

    expect(result).toEqual([EXEC_ID_1])
  })

  it('given active flow with incompatible filter when dispatch then does not create execution', async () => {
    // Fluxo com filter.funnelId diferente do subject.data.funnelId → filter não casa
    const tx = makeTx({
      flows: [{ flowId: FLOW_ID_1, triggerFilter: { funnelId: 'funnel-OTHER' } }],
      insertResultsMap: new Map(), // insert não deve ser chamado
    })

    const subject: TriggerSubject = {
      subjectKind: 'funnel_entry',
      subjectId: SUBJECT_ID,
      data: { funnelId: 'funnel-abc' },
    }

    const result = await dispatchTrigger('funnel_enter', subject, tx)

    expect(result).toEqual([])
    // Verifica que insert não foi chamado (filter falhou)
    expect((tx.insert as Mock).mock.calls.length).toBe(0)
  })

  it('given duplicate dispatch within same minute when second dispatch then returns empty array (idempotency)', async () => {
    // INV-AUTOMATION-03: onConflictDoNothing → insert retorna [] (sem linha inserida)
    const tx = makeTx({
      flows: [{ flowId: FLOW_ID_1, triggerFilter: {} }],
      insertResultsMap: new Map([[FLOW_ID_1, undefined]]), // undefined = conflito → skip
    })

    const result = await dispatchTrigger('sale_approved', DEFAULT_SUBJECT, tx)

    // Conflito de idempotência → executionId não retornado
    expect(result).toEqual([])
  })

  it('given two active flows for same kind when dispatch then creates two executions', async () => {
    // Dois fluxos ativos → 2 executions criadas
    // Mock: select retorna 2 flows; insert retorna EXEC_ID_1 na 1ª call e EXEC_ID_2 na 2ª
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([
        { flowId: FLOW_ID_1, triggerFilter: {} },
        { flowId: FLOW_ID_2, triggerFilter: {} },
      ]),
    }

    let insertCallCount = 0
    const insertResults = [[{ id: EXEC_ID_1 }], [{ id: EXEC_ID_2 }]]
    const insertChain = {
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockImplementation(() => {
        const result = insertResults[insertCallCount] ?? []
        insertCallCount++
        return Promise.resolve(result)
      }),
    }

    const tx = {
      select: vi.fn().mockReturnValue(selectChain),
      insert: vi.fn().mockReturnValue(insertChain),
    } as unknown as DbTx

    const result = await dispatchTrigger('new_message', DEFAULT_SUBJECT, tx)

    expect(result).toHaveLength(2)
    expect(result).toContain(EXEC_ID_1)
    expect(result).toContain(EXEC_ID_2)
    expect((tx.insert as Mock).mock.calls.length).toBe(2)
  })

  it('given active flow with null filter (DB default) when dispatch then creates execution', async () => {
    // Edge case: triggerFilter pode vir como null do DB (default JSON é {})
    const tx = makeTx({
      flows: [{ flowId: FLOW_ID_1, triggerFilter: null as unknown as Record<string, unknown> }],
      insertResultsMap: new Map([[FLOW_ID_1, { id: EXEC_ID_1 }]]),
    })

    const result = await dispatchTrigger('ticket_opened', DEFAULT_SUBJECT, tx)

    expect(result).toEqual([EXEC_ID_1])
  })

  it('given flow with partially matching filter when dispatch then does not create execution', async () => {
    // Filter tem duas chaves; só uma bate → não deve criar
    const tx = makeTx({
      flows: [
        {
          flowId: FLOW_ID_1,
          triggerFilter: { funnelId: 'funnel-abc', brandId: 'brand-99' },
        },
      ],
      insertResultsMap: new Map(),
    })

    const subject: TriggerSubject = {
      subjectKind: 'funnel_entry',
      subjectId: SUBJECT_ID,
      data: { funnelId: 'funnel-abc', brandId: 'brand-1' }, // brandId não bate
    }

    const result = await dispatchTrigger('funnel_stage_change', subject, tx)

    expect(result).toEqual([])
    expect((tx.insert as Mock).mock.calls.length).toBe(0)
  })
})
