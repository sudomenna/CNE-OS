/**
 * Testes unitários — enterFunnel
 *
 * BR-FUNNEL-OPPORTUNITY §1: unicidade de oportunidade ativa por (contact_id, funnel_id).
 * docs/20-domain/08-funnel-opportunity.md §10 case 1, §5 INV-FUNNEL-01, INV-FUNNEL-03
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
const STAGE_ID = '00000000-0000-0000-0000-000000000003'
const ENTRY_ID = '00000000-0000-0000-0000-000000000010'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const activeEntry = {
  id: ENTRY_ID,
  contactId: CONTACT_ID,
  funnelId: FUNNEL_ID,
  currentStageId: STAGE_ID,
  ownerUserId: null,
  label: 'open' as const,
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

const firstStage = {
  id: STAGE_ID,
  funnelId: FUNNEL_ID,
  name: 'Prospecção',
  position: 1,
  isTerminal: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
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

const { enterFunnel } = await import('../../../lib/domain/funnel/enter')
const { FunnelHasNoStagesError } = await import('../../../lib/domain/funnel/errors')

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

/**
 * tx mock para cenário onde NÃO há entrada ativa, mas há estágio disponível.
 * Simula a sequência: select (empty) → select stages (firstStage) → insert entry → insert history.
 */
function buildTxNoActiveEntry() {
  // Precisamos diferenciar as chamadas: 1ª select → [] (sem entrada ativa), 2ª → [firstStage]
  let callIdx = 0

  const tx = {
    select: vi.fn().mockImplementation(() => {
      callIdx++
      const idx = callIdx

      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (idx === 1) {
              // busca entrada ativa → nenhuma
              return Promise.resolve([])
            }
            // busca estágios
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([firstStage]),
              }),
            }
          }),
        }),
      }
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([activeEntry]),
      }),
    }),
  }

  return tx
}

/**
 * tx mock para cenário onde HÁ entrada ativa (idempotente).
 */
function buildTxWithActiveEntry() {
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([activeEntry]),
      }),
    }),
    insert: vi.fn(),
  }
  return tx
}

/**
 * tx mock para cenário onde funil não tem estágios.
 */
function buildTxNoStages() {
  let callIdx = 0

  const tx = {
    select: vi.fn().mockImplementation(() => {
      callIdx++
      const idx = callIdx

      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (idx === 1) {
              return Promise.resolve([]) // sem entrada ativa
            }
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]), // sem estágios
              }),
            }
          }),
        }),
      }
    }),
    insert: vi.fn(),
  }

  return tx
}

/**
 * tx mock para cenário com initialStageId fornecido explicitamente.
 */
function buildTxWithInitialStageId() {
  let callIdx = 0

  const tx = {
    select: vi.fn().mockImplementation(() => {
      callIdx++
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]), // sem entrada ativa
        }),
      }
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([activeEntry]),
      }),
    }),
  }

  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-FUNNEL-OPPORTUNITY — enterFunnel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: entrada ativa já existe → idempotente ─────────────────────────

  describe('CT-FUNNEL-01 — idempotente quando oportunidade ativa existe', () => {
    it(
      'given oportunidade ativa existente para (contactId, funnelId) ' +
        'when enterFunnel ' +
        'then retorna {entry, created: false} sem INSERT nem evento',
      async () => {
        const tx = buildTxWithActiveEntry()

        const result = await enterFunnel(
          tx as unknown as Parameters<typeof enterFunnel>[0],
          { contactId: CONTACT_ID, funnelId: FUNNEL_ID },
        )

        expect(result.created).toBe(false)
        expect(result.entry.id).toBe(ENTRY_ID)
        expect(result.entry.label).toBe('open')

        // Nenhum INSERT — idempotente
        expect(tx.insert).not.toHaveBeenCalled()

        // Nenhum evento emitido
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 2: sem entrada ativa → cria nova com primeiro estágio ────────────

  describe('CT-FUNNEL-NEW — cria nova oportunidade no primeiro estágio', () => {
    it(
      'given sem oportunidade ativa para (contactId, funnelId) ' +
        'when enterFunnel sem initialStageId ' +
        'then INSERT entry no estágio de menor position, INSERT history, emite funnel_entered',
      async () => {
        const tx = buildTxNoActiveEntry()

        const result = await enterFunnel(
          tx as unknown as Parameters<typeof enterFunnel>[0],
          {
            contactId: CONTACT_ID,
            funnelId: FUNNEL_ID,
            actorSystem: 'MOD-FUNNEL',
          },
        )

        expect(result.created).toBe(true)
        expect(result.entry.id).toBe(ENTRY_ID)

        // INSERT chamado 2 vezes: funnel_entry + funnel_entry_stage_history
        expect(tx.insert).toHaveBeenCalledTimes(2)

        // TE-FUNNEL-ENTERED emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'funnel_entered',
            source: 'MOD-FUNNEL',
            payload: expect.objectContaining({
              funnel_id: FUNNEL_ID,
              initial_stage_id: STAGE_ID,
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 3: initialStageId explícito → não busca estágios ─────────────────

  describe('CT-FUNNEL-INITIAL-STAGE — usa initialStageId fornecido', () => {
    it(
      'given initialStageId fornecido explicitamente ' +
        'when enterFunnel ' +
        'then usa o estágio fornecido sem buscar funnel_stage',
      async () => {
        const CUSTOM_STAGE_ID = '00000000-0000-0000-0000-000000000099'
        const entryWithCustomStage = { ...activeEntry, currentStageId: CUSTOM_STAGE_ID }
        const tx = buildTxWithInitialStageId()

        // Sobrescreve o returning para retornar entry com CUSTOM_STAGE_ID
        tx.insert.mockReturnValue({
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([entryWithCustomStage]),
          }),
        })

        const result = await enterFunnel(
          tx as unknown as Parameters<typeof enterFunnel>[0],
          {
            contactId: CONTACT_ID,
            funnelId: FUNNEL_ID,
            initialStageId: CUSTOM_STAGE_ID,
            actorSystem: 'test',
          },
        )

        expect(result.created).toBe(true)
        expect(result.entry.currentStageId).toBe(CUSTOM_STAGE_ID)

        // INSERT chamado para entry e history
        expect(tx.insert).toHaveBeenCalledTimes(2)

        // Verifica que o payload do evento usa CUSTOM_STAGE_ID
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({
              initial_stage_id: CUSTOM_STAGE_ID,
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 4: funil sem estágios → lança FunnelHasNoStagesError ─────────────

  describe('CT-FUNNEL-NO-STAGES — funil sem estágios lança erro', () => {
    it(
      'given funil sem nenhum funnel_stage ' +
        'when enterFunnel sem initialStageId ' +
        'then lança FunnelHasNoStagesError',
      async () => {
        const tx = buildTxNoStages()

        await expect(
          enterFunnel(
            tx as unknown as Parameters<typeof enterFunnel>[0],
            { contactId: CONTACT_ID, funnelId: FUNNEL_ID },
          ),
        ).rejects.toThrow(FunnelHasNoStagesError)

        // Nenhum INSERT
        expect(tx.insert).not.toHaveBeenCalled()

        // Nenhum evento emitido
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: actorUserId é propagado para o evento de timeline ─────────────

  describe('CT-FUNNEL-ACTOR — actorUserId propagado para timeline', () => {
    it(
      'given actorUserId fornecido ' +
        'when enterFunnel cria nova entrada ' +
        'then evento de timeline tem actorUserId e actorSystem=null',
      async () => {
        const USER_ID = '00000000-0000-0000-0000-000000000099'
        const tx = buildTxWithInitialStageId()

        await enterFunnel(
          tx as unknown as Parameters<typeof enterFunnel>[0],
          {
            contactId: CONTACT_ID,
            funnelId: FUNNEL_ID,
            initialStageId: STAGE_ID,
            actorUserId: USER_ID,
          },
        )

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: USER_ID,
            actorSystem: null,
          }),
          tx,
        )
      },
    )
  })
})
