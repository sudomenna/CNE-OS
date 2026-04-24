/**
 * Testes unitários — recomputeScore
 *
 * BR-FUNNEL-OPPORTUNITY §4: score é configurável por funil.
 * INV-FUNNEL-04: toda mudança de score gera linha em funnel_entry_score_history.
 * docs/20-domain/08-funnel-opportunity.md §10 case 5
 *
 * Estratégia: tx mock intercepta a chain Drizzle. Sem DB real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const FUNNEL_ID = '00000000-0000-0000-0000-000000000002'
const STAGE_ID = '00000000-0000-0000-0000-000000000003'
const ENTRY_ID = '00000000-0000-0000-0000-000000000010'
const RULE_A_ID = '00000000-0000-0000-0000-000000000041'
const RULE_B_ID = '00000000-0000-0000-0000-000000000042'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(score: string = '0') {
  return {
    id: ENTRY_ID,
    contactId: CONTACT_ID,
    funnelId: FUNNEL_ID,
    currentStageId: STAGE_ID,
    ownerUserId: null,
    label: 'open',
    score,
    entryDate: new Date('2026-01-01T00:00:00Z'),
    entryOrigin: null,
    entryCampaignId: null,
    entryCreativeId: null,
    conversionOrigin: null,
    conversionCampaignId: null,
    conversionCreativeId: null,
    transactionId: null,
    lostReason: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  }
}

function makeRule(id: string, eventKind: string, delta: string, isActive = true) {
  return {
    id,
    funnelId: FUNNEL_ID,
    name: `Regra ${id.slice(-4)}`,
    eventKind,
    delta,
    isActive,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

// ---------------------------------------------------------------------------
// Import dinâmico (sem mocks de timeline — recomputeScore não emite timeline)
// ---------------------------------------------------------------------------

const { recomputeScore } = await import('../../../lib/domain/funnel/score')
const { FunnelEntryNotFoundError } = await import('../../../lib/domain/funnel/errors')

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

/**
 * Builds a tx mock sequencing: select(entry) → select(rules) → update → insert.
 * recomputeScore usa:
 *   1. tx.select(...).from(funnelEntry).where(...)  → retorna [entry]
 *   2. tx.select(...).from(funnelScoreRule).where(...) → retorna rules
 *   3. tx.update(funnelEntry).set(...).where(...)
 *   4. tx.insert(funnelEntryScoreHistory).values(...)
 */
function buildTxWithRules(
  entry: ReturnType<typeof makeEntry>,
  rules: ReturnType<typeof makeRule>[],
) {
  let selectCallCount = 0

  return {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++
      const idx = selectCallCount

      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(idx === 1 ? [entry] : rules),
        }),
      }
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  }
}

/** tx mock onde entry não é encontrada. */
function buildTxEntryNotFound() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn(),
    insert: vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-FUNNEL-OPPORTUNITY — recomputeScore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: caso feliz — regra de score bate e delta é aplicado ───────────

  describe('CT-FUNNEL-06 — score atualizado por regra ativa', () => {
    it(
      'given regra ativa event_kind=message_inbound delta=+5 ' +
        'when recomputeScore com eventKinds=[message_inbound] ' +
        'then score aumenta em 5, registra em history, retorna novo score',
      async () => {
        const entry = makeEntry('0')
        const rules = [makeRule(RULE_A_ID, 'message_inbound', '5')]
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['message_inbound'],
        })

        expect(result).toBe(5)

        // UPDATE chamado com novo score
        expect(tx.update).toHaveBeenCalledTimes(1)

        // INSERT em score_history
        expect(tx.insert).toHaveBeenCalledTimes(1)
        expect(tx.insert().values).toHaveBeenCalledWith(
          expect.objectContaining({
            funnelEntryId: ENTRY_ID,
            fromScore: '0',
            toScore: '5',
          }),
        )
      },
    )

    it(
      'given score atual=10 e regra delta=-3 ' +
        'when recomputeScore ' +
        'then retorna 7',
      async () => {
        const entry = makeEntry('10')
        const rules = [makeRule(RULE_A_ID, 'click', '-3')]
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['click'],
        })

        expect(result).toBe(7)
      },
    )
  })

  // ── Caso 2: múltiplas regras com event_kinds diferentes ───────────────────

  describe('CT-FUNNEL-SCORE-MULTI-RULE — múltiplas regras acumuladas', () => {
    it(
      'given duas regras ativas com event_kinds distintos ' +
        'when recomputeScore com ambos os event_kinds ' +
        'then deltas são somados',
      async () => {
        const entry = makeEntry('0')
        const rules = [
          makeRule(RULE_A_ID, 'message_inbound', '5'),
          makeRule(RULE_B_ID, 'click', '3'),
        ]
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['message_inbound', 'click'],
        })

        expect(result).toBe(8)
        expect(tx.update).toHaveBeenCalledTimes(1)
      },
    )

    it(
      'given duas regras mas apenas um event_kind informado ' +
        'when recomputeScore ' +
        'then apenas o delta da regra correspondente é aplicado',
      async () => {
        const entry = makeEntry('0')
        const rules = [
          makeRule(RULE_A_ID, 'message_inbound', '5'),
          makeRule(RULE_B_ID, 'click', '3'),
        ]
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['message_inbound'], // só 1 dos 2 kinds
        })

        expect(result).toBe(5) // apenas regra A aplicada
      },
    )
  })

  // ── Caso 3: nenhuma regra bate → sem mutação, retorna score atual ──────────

  describe('CT-FUNNEL-SCORE-NO-MATCH — nenhuma regra corresponde', () => {
    it(
      'given regra ativa mas event_kind não está em eventKinds ' +
        'when recomputeScore ' +
        'then score não muda, sem UPDATE, sem INSERT em history',
      async () => {
        const entry = makeEntry('10')
        const rules = [makeRule(RULE_A_ID, 'message_inbound', '5')]
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['click'], // diferente de message_inbound
        })

        expect(result).toBe(10)
        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
      },
    )

    it(
      'given funil sem regras ativas ' +
        'when recomputeScore ' +
        'then retorna score atual sem mutação',
      async () => {
        const entry = makeEntry('7')
        const rules: ReturnType<typeof makeRule>[] = [] // sem regras
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['message_inbound'],
        })

        expect(result).toBe(7)
        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
      },
    )

    it(
      'given eventKinds vazio ' +
        'when recomputeScore ' +
        'then retorna score atual sem mutação',
      async () => {
        const entry = makeEntry('3')
        const rules = [makeRule(RULE_A_ID, 'message_inbound', '5')]
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: [],
        })

        expect(result).toBe(3)
        expect(tx.update).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 4: entry não encontrada → FunnelEntryNotFoundError ───────────────

  describe('CT-FUNNEL-ENTRY-NOT-FOUND — entry inexistente lança erro', () => {
    it(
      'given entryId inexistente ' +
        'when recomputeScore ' +
        'then lança FunnelEntryNotFoundError',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
            entryId: ENTRY_ID,
            eventKinds: ['message_inbound'],
          }),
        ).rejects.toThrow(FunnelEntryNotFoundError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: regra inativa não é aplicada ──────────────────────────────────

  describe('CT-FUNNEL-SCORE-INACTIVE — regra inativa não gera delta', () => {
    it(
      'given regra com is_active=false ' +
        'when recomputeScore com event_kind correspondente ' +
        'then regra não é aplicada (filtro is_active=true no DB)',
      async () => {
        const entry = makeEntry('0')
        // A query do tx mock para rules retorna array vazio quando is_active=false
        // (filtro eq(funnelScoreRule.isActive, true) aplicado na query)
        const rules: ReturnType<typeof makeRule>[] = [] // DB filtra is_active=true
        const tx = buildTxWithRules(entry, rules)

        const result = await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['message_inbound'],
        })

        expect(result).toBe(0)
        expect(tx.update).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 6: reason custom propagado para history ──────────────────────────

  describe('CT-FUNNEL-SCORE-REASON — reason custom propagado para history', () => {
    it(
      'given reason custom informado ' +
        'when recomputeScore ' +
        'then INSERT em history com o reason fornecido',
      async () => {
        const entry = makeEntry('0')
        const rules = [makeRule(RULE_A_ID, 'message_inbound', '5')]
        const tx = buildTxWithRules(entry, rules)

        await recomputeScore(tx as unknown as Parameters<typeof recomputeScore>[0], {
          entryId: ENTRY_ID,
          eventKinds: ['message_inbound'],
          reason: 'Mensagem WhatsApp recebida',
        })

        expect(tx.insert().values).toHaveBeenCalledWith(
          expect.objectContaining({
            reason: 'Mensagem WhatsApp recebida',
          }),
        )
      },
    )
  })
})
