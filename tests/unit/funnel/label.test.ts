/**
 * Testes unitários — setOpportunityLabel
 *
 * BR-FUNNEL-OPPORTUNITY §6: etiqueta macro é independente do estágio.
 * docs/20-domain/08-funnel-opportunity.md §6, §8
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
const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000020'

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

const { setOpportunityLabel } = await import('../../../lib/domain/funnel/label')
const { FunnelEntryNotFoundError } = await import('../../../lib/domain/funnel/errors')

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

function buildTxWithEntry(entry: ReturnType<typeof makeEntry>) {
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([entry]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([{ ...entry }]),
      }),
    }),
  }
  return tx
}

function buildTxEntryNotFound() {
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn(),
  }
  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-FUNNEL-OPPORTUNITY — setOpportunityLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: caso feliz — label 'negotiating' aplicada ────────────────────

  describe('CT-LABEL-HAPPY — aplica label e emite evento', () => {
    it(
      'given oportunidade com label=open ' +
        'when setOpportunityLabel para negotiating ' +
        'then UPDATE label, emite opportunity_label_changed',
      async () => {
        const entry = makeEntry('open')
        const tx = buildTxWithEntry(entry)

        await setOpportunityLabel(
          tx as unknown as Parameters<typeof setOpportunityLabel>[0],
          {
            entryId: ENTRY_ID,
            label: 'negotiating',
            actorSystem: 'MOD-FUNNEL',
          },
        )

        // UPDATE chamado
        expect(tx.update).toHaveBeenCalledTimes(1)

        // TE-OPPORTUNITY-LABEL-CHANGED emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'opportunity_label_changed',
            source: 'MOD-FUNNEL',
            subjectKind: 'funnel_entry',
            subjectId: ENTRY_ID,
            payload: expect.objectContaining({
              funnel_id: FUNNEL_ID,
              from_label: 'open',
              to_label: 'negotiating',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: entry não encontrada ─────────────────────────────────────────

  describe('CT-LABEL-NOT-FOUND — entry inexistente lança erro', () => {
    it(
      'given entryId inexistente ' +
        'when setOpportunityLabel ' +
        'then lança FunnelEntryNotFoundError',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          setOpportunityLabel(
            tx as unknown as Parameters<typeof setOpportunityLabel>[0],
            { entryId: ENTRY_ID, label: 'negotiating' },
          ),
        ).rejects.toThrow(FunnelEntryNotFoundError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 3: actorUserId é propagado para o evento de timeline ─────────────

  describe('CT-LABEL-ACTOR-USER — actorUserId propagado para timeline', () => {
    it(
      'given actorUserId fornecido ' +
        'when setOpportunityLabel ' +
        'then evento tem actorUserId e actorSystem=null',
      async () => {
        const entry = makeEntry('open')
        const tx = buildTxWithEntry(entry)

        await setOpportunityLabel(
          tx as unknown as Parameters<typeof setOpportunityLabel>[0],
          {
            entryId: ENTRY_ID,
            label: 'negotiating',
            actorUserId: ACTOR_USER_ID,
          },
        )

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

  // ── Caso 4: actorSystem padrão quando nem actorUserId nem actorSystem fornecidos ──

  describe('CT-LABEL-DEFAULT-ACTOR — actorSystem padrão MOD-FUNNEL', () => {
    it(
      'given nem actorUserId nem actorSystem fornecidos ' +
        'when setOpportunityLabel ' +
        'then evento usa actorSystem=MOD-FUNNEL',
      async () => {
        const entry = makeEntry('open')
        const tx = buildTxWithEntry(entry)

        await setOpportunityLabel(
          tx as unknown as Parameters<typeof setOpportunityLabel>[0],
          {
            entryId: ENTRY_ID,
            label: 'concluded',
          },
        )

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            actorUserId: null,
            actorSystem: 'MOD-FUNNEL',
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 5: from_label captura label anterior corretamente ────────────────

  describe('CT-LABEL-FROM-LABEL — from_label captura label anterior', () => {
    it(
      'given oportunidade com label=negotiating ' +
        'when setOpportunityLabel para concluded ' +
        'then payload.from_label=negotiating',
      async () => {
        const entry = makeEntry('negotiating')
        const tx = buildTxWithEntry(entry)

        await setOpportunityLabel(
          tx as unknown as Parameters<typeof setOpportunityLabel>[0],
          {
            entryId: ENTRY_ID,
            label: 'concluded',
            actorSystem: 'test',
          },
        )

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({
              from_label: 'negotiating',
              to_label: 'concluded',
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 6: label 'reopened' é permitida ─────────────────────────────────

  describe('CT-LABEL-REOPENED — label reopened é válida', () => {
    it(
      'given oportunidade com label=lost ' +
        'when setOpportunityLabel para reopened ' +
        'then UPDATE e evento emitidos sem erro',
      async () => {
        const entry = makeEntry('lost')
        const tx = buildTxWithEntry(entry)

        await expect(
          setOpportunityLabel(
            tx as unknown as Parameters<typeof setOpportunityLabel>[0],
            {
              entryId: ENTRY_ID,
              label: 'reopened',
              actorSystem: 'test',
            },
          ),
        ).resolves.toBeUndefined()

        expect(tx.update).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
      },
    )
  })
})
