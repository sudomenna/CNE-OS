/**
 * Testes unitários — markLost
 *
 * BR-FUNNEL-OPPORTUNITY §1: won e lost são terminais.
 * INV-FUNNEL-05: label='lost' exige lost_reason IS NOT NULL.
 * docs/20-domain/08-funnel-opportunity.md §10 case 4
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

function makeEntry(label: string) {
  return {
    id: ENTRY_ID,
    contactId: CONTACT_ID,
    funnelId: FUNNEL_ID,
    currentStageId: STAGE_ID,
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

const { markLost } = await import('../../../lib/domain/funnel/lost')
const { LostRequiresReasonError } = await import('../../../lib/domain/funnel/lost')
const { FunnelEntryNotFoundError, FunnelEntryTerminalError } = await import(
  '../../../lib/domain/funnel/errors'
)

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

/** tx mock para cenário bem-sucedido. */
function buildTxHappyPath(entry: ReturnType<typeof makeEntry>) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([entry]),
      }),
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

/** tx mock para cenário onde entry não é encontrada. */
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

describe('BR-FUNNEL-OPPORTUNITY — markLost', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: caso feliz — oportunidade ativa marcada como lost ─────────────

  describe('CT-FUNNEL-LOST-HAPPY — oportunidade ativa marcada como lost', () => {
    it(
      'given oportunidade ativa com label=open ' +
        'when markLost com reason válido ' +
        'then UPDATE label=lost e lost_reason, emite opportunity_lost',
      async () => {
        const entry = makeEntry('open')
        const tx = buildTxHappyPath(entry)

        await markLost(tx as unknown as Parameters<typeof markLost>[0], {
          entryId: ENTRY_ID,
          reason: 'Contato não respondeu',
        })

        // UPDATE chamado
        expect(tx.update).toHaveBeenCalledTimes(1)

        // TE-OPPORTUNITY-LOST emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'opportunity_lost',
            source: 'MOD-FUNNEL',
            subjectKind: 'funnel_entry',
            subjectId: ENTRY_ID,
            payload: expect.objectContaining({
              funnel_id: FUNNEL_ID,
              funnel_entry_id: ENTRY_ID,
              lost_reason: 'Contato não respondeu',
            }),
          }),
          tx,
        )
      },
    )

    it(
      'given oportunidade com label=negotiating ' +
        'when markLost com reason ' +
        'then UPDATE label=lost com sucesso',
      async () => {
        const entry = makeEntry('negotiating')
        const tx = buildTxHappyPath(entry)

        await expect(
          markLost(tx as unknown as Parameters<typeof markLost>[0], {
            entryId: ENTRY_ID,
            reason: 'Optou por concorrente',
          }),
        ).resolves.toBeUndefined()

        expect(tx.update).toHaveBeenCalledTimes(1)
      },
    )
  })

  // ── Caso 2: reason vazio → LostRequiresReasonError ────────────────────────

  describe('CT-FUNNEL-04 — markLost sem reason é rejeitado', () => {
    it(
      'given reason vazio "" ' +
        'when markLost ' +
        'then lança LostRequiresReasonError antes de qualquer query',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          markLost(tx as unknown as Parameters<typeof markLost>[0], {
            entryId: ENTRY_ID,
            reason: '',
          }),
        ).rejects.toThrow(LostRequiresReasonError)

        // Nenhuma query executada — validação antes do DB
        expect(tx.select).not.toHaveBeenCalled()
        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )

    it(
      'given reason com apenas espaços ' +
        'when markLost ' +
        'then lança LostRequiresReasonError',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          markLost(tx as unknown as Parameters<typeof markLost>[0], {
            entryId: ENTRY_ID,
            reason: '   ',
          }),
        ).rejects.toThrow(LostRequiresReasonError)
      },
    )
  })

  // ── Caso 3: entry não encontrada ─────────────────────────────────────────

  describe('CT-FUNNEL-ENTRY-NOT-FOUND — entry inexistente lança erro', () => {
    it(
      'given entryId inexistente ' +
        'when markLost ' +
        'then lança FunnelEntryNotFoundError',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          markLost(tx as unknown as Parameters<typeof markLost>[0], {
            entryId: ENTRY_ID,
            reason: 'Motivo qualquer',
          }),
        ).rejects.toThrow(FunnelEntryNotFoundError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 4: entry já won → FunnelEntryTerminalError ───────────────────────

  describe('CT-FUNNEL-TERMINAL-WON — entry com label=won rejeita markLost', () => {
    it(
      'given oportunidade com label=won (terminal) ' +
        'when markLost ' +
        'then lança FunnelEntryTerminalError',
      async () => {
        const wonEntry = makeEntry('won')
        const tx = buildTxHappyPath(wonEntry)

        await expect(
          markLost(tx as unknown as Parameters<typeof markLost>[0], {
            entryId: ENTRY_ID,
            reason: 'Motivo qualquer',
          }),
        ).rejects.toThrow(FunnelEntryTerminalError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: entry já lost → FunnelEntryTerminalError ─────────────────────

  describe('CT-FUNNEL-TERMINAL-LOST — entry com label=lost rejeita markLost novamente', () => {
    it(
      'given oportunidade com label=lost (terminal) ' +
        'when markLost novamente ' +
        'then lança FunnelEntryTerminalError',
      async () => {
        const lostEntry = makeEntry('lost')
        const tx = buildTxHappyPath(lostEntry)

        await expect(
          markLost(tx as unknown as Parameters<typeof markLost>[0], {
            entryId: ENTRY_ID,
            reason: 'Outro motivo',
          }),
        ).rejects.toThrow(FunnelEntryTerminalError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 6: actor propagado corretamente no evento ────────────────────────

  describe('CT-FUNNEL-LOST-ACTOR — actorUserId propagado para o evento', () => {
    it(
      'given markLost com actorUserId ' +
        'when markLost ' +
        'then evento emitido com actorUserId e actorSystem=null',
      async () => {
        const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000050'
        const entry = makeEntry('open')
        const tx = buildTxHappyPath(entry)

        await markLost(tx as unknown as Parameters<typeof markLost>[0], {
          entryId: ENTRY_ID,
          reason: 'Cliente escolheu outro produto',
          actorUserId: ACTOR_USER_ID,
        })

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: ACTOR_USER_ID,
            actorSystem: null,
          }),
          tx,
        )
      },
    )
  })
})
