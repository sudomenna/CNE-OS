/**
 * Testes unitários — moveStage
 *
 * BR-FUNNEL-OPPORTUNITY §5: mudança de estágio é observável.
 * INV-FUNNEL-03: toda mudança de current_stage_id gera linha em funnel_entry_stage_history.
 * docs/20-domain/08-funnel-opportunity.md §10 cases 2, 5
 *
 * Estratégia: mockar @/lib/timeline/emit para isolar lógica de domínio.
 * A tx é um objeto mock que intercepta a chain Drizzle.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const FUNNEL_ID = '00000000-0000-0000-0000-000000000002'
const STAGE_A_ID = '00000000-0000-0000-0000-000000000003'
const STAGE_B_ID = '00000000-0000-0000-0000-000000000004'
const ENTRY_ID = '00000000-0000-0000-0000-000000000010'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(label: string) {
  return {
    id: ENTRY_ID,
    contactId: CONTACT_ID,
    funnelId: FUNNEL_ID,
    currentStageId: STAGE_A_ID,
    ownerUserId: null,
    label,
    score: '0',
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

const stageBSameFunnel = {
  id: STAGE_B_ID,
  funnelId: FUNNEL_ID,
  name: 'Negociação',
  position: 2,
  isTerminal: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

const stageBOtherFunnel = {
  ...stageBSameFunnel,
  funnelId: '00000000-0000-0000-0000-000000000099', // funil diferente
}

// ---------------------------------------------------------------------------
// Mock do emitTimelineEvent
// ---------------------------------------------------------------------------

const emitTimelineEventMock = vi.fn().mockResolvedValue({ id: 'te-1' })

vi.mock('@/lib/timeline/emit', () => ({
  emitTimelineEvent: emitTimelineEventMock,
}))

// ---------------------------------------------------------------------------
// Import dinâmico após mocks declarados
// ---------------------------------------------------------------------------

const { moveStage } = await import('../../../lib/domain/funnel/move-stage')
const {
  FunnelEntryNotFoundError,
  FunnelStageMismatchError,
  FunnelEntryTerminalError,
} = await import('../../../lib/domain/funnel/errors')

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

/**
 * tx mock para cenário de movimentação bem-sucedida.
 * Sequência: select entry → select stage → update → insert history.
 */
function buildTxHappyPath(entry: ReturnType<typeof makeEntry>, targetStage: typeof stageBSameFunnel) {
  let selectCallCount = 0

  const tx = {
    select: vi.fn().mockImplementation(() => {
      selectCallCount++
      const idx = selectCallCount

      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(idx === 1 ? [entry] : [targetStage]),
        }),
      }
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ ...entry, currentStageId: targetStage.id }]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  }

  return tx
}

/**
 * tx mock para cenário onde entry não é encontrada.
 */
function buildTxEntryNotFound() {
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn(),
    insert: vi.fn(),
  }
  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-FUNNEL-OPPORTUNITY — moveStage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: movimentação bem-sucedida ─────────────────────────────────────

  describe('CT-FUNNEL-05 — mudança de estágio emite evento e persiste histórico', () => {
    it(
      'given oportunidade ativa em stage_a ' +
        'when moveStage para stage_b do mesmo funil ' +
        'then UPDATE current_stage_id, INSERT history, emite funnel_stage_changed',
      async () => {
        const entry = makeEntry('open')
        const tx = buildTxHappyPath(entry, stageBSameFunnel)

        await moveStage(
          tx as unknown as Parameters<typeof moveStage>[0],
          ENTRY_ID,
          STAGE_B_ID,
          'Avançou para negociação',
        )

        // UPDATE chamado
        expect(tx.update).toHaveBeenCalledTimes(1)

        // INSERT chamado para history
        expect(tx.insert).toHaveBeenCalledTimes(1)

        // TE-FUNNEL-STAGE-CHANGED emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'funnel_stage_changed',
            source: 'MOD-FUNNEL',
            subjectKind: 'funnel_entry',
            subjectId: ENTRY_ID,
            payload: expect.objectContaining({
              funnel_id: FUNNEL_ID,
              from_stage_id: STAGE_A_ID,
              to_stage_id: STAGE_B_ID,
              reason: 'Avançou para negociação',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: entry não encontrada ─────────────────────────────────────────

  describe('CT-FUNNEL-ENTRY-NOT-FOUND — entry inexistente lança erro', () => {
    it(
      'given entryId inexistente ' +
        'when moveStage ' +
        'then lança FunnelEntryNotFoundError',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          moveStage(
            tx as unknown as Parameters<typeof moveStage>[0],
            ENTRY_ID,
            STAGE_B_ID,
          ),
        ).rejects.toThrow(FunnelEntryNotFoundError)

        // Nenhum UPDATE nem INSERT
        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 3: label terminal 'won' → rejeita moveStage ─────────────────────

  describe('CT-FUNNEL-TERMINAL-WON — entry com label=won rejeita movimentação', () => {
    it(
      'given oportunidade com label=won (terminal) ' +
        'when moveStage ' +
        'then lança FunnelEntryTerminalError',
      async () => {
        const wonEntry = makeEntry('won')
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([wonEntry]),
            }),
          }),
          update: vi.fn(),
          insert: vi.fn(),
        }

        await expect(
          moveStage(
            tx as unknown as Parameters<typeof moveStage>[0],
            ENTRY_ID,
            STAGE_B_ID,
          ),
        ).rejects.toThrow(FunnelEntryTerminalError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 4: label terminal 'lost' → rejeita moveStage ────────────────────

  describe('CT-FUNNEL-TERMINAL-LOST — entry com label=lost rejeita movimentação', () => {
    it(
      'given oportunidade com label=lost (terminal) ' +
        'when moveStage ' +
        'then lança FunnelEntryTerminalError',
      async () => {
        const lostEntry = makeEntry('lost')
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([lostEntry]),
            }),
          }),
          update: vi.fn(),
          insert: vi.fn(),
        }

        await expect(
          moveStage(
            tx as unknown as Parameters<typeof moveStage>[0],
            ENTRY_ID,
            STAGE_B_ID,
          ),
        ).rejects.toThrow(FunnelEntryTerminalError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: stage_id de outro funil → rejeita com mismatch ───────────────

  describe('CT-FUNNEL-STAGE-MISMATCH — stage de outro funil rejeita movimentação', () => {
    it(
      'given target_stage_id pertencente a funil diferente ' +
        'when moveStage ' +
        'then lança FunnelStageMismatchError',
      async () => {
        const entry = makeEntry('open')
        const tx = buildTxHappyPath(entry, stageBOtherFunnel)

        await expect(
          moveStage(
            tx as unknown as Parameters<typeof moveStage>[0],
            ENTRY_ID,
            STAGE_B_ID,
          ),
        ).rejects.toThrow(FunnelStageMismatchError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 6: stage_id inexistente → rejeita com mismatch ──────────────────

  describe('CT-FUNNEL-STAGE-NOT-FOUND — stage inexistente rejeita movimentação', () => {
    it(
      'given toStageId que não existe no banco ' +
        'when moveStage ' +
        'then lança FunnelStageMismatchError',
      async () => {
        const entry = makeEntry('open')
        let selectCallCount = 0

        const tx = {
          select: vi.fn().mockImplementation(() => {
            selectCallCount++
            const idx = selectCallCount

            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockResolvedValue(
                  idx === 1 ? [entry] : [], // 1ª: entry; 2ª: stage não encontrado
                ),
              }),
            }
          }),
          update: vi.fn(),
          insert: vi.fn(),
        }

        await expect(
          moveStage(
            tx as unknown as Parameters<typeof moveStage>[0],
            ENTRY_ID,
            '00000000-0000-0000-0000-000000000099',
          ),
        ).rejects.toThrow(FunnelStageMismatchError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 7: reason opcional é propagado para history e evento ────────────

  describe('CT-FUNNEL-REASON — reason opcional é propagado', () => {
    it(
      'given moveStage sem reason ' +
        'when moveStage ' +
        'then reason=null no payload do evento',
      async () => {
        const entry = makeEntry('negotiating')
        const tx = buildTxHappyPath(entry, stageBSameFunnel)

        await moveStage(
          tx as unknown as Parameters<typeof moveStage>[0],
          ENTRY_ID,
          STAGE_B_ID,
          // sem reason
        )

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({
              reason: null,
            }),
          }),
          tx,
        )
      },
    )
  })
})
