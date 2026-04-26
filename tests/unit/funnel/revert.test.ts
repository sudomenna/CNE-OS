/**
 * Testes unitários — revertFunnelEntryAfterRefund
 *
 * FLOW-07 (Refund E2E) passo 6: reverter oportunidade no funil após refund.
 * docs/60-flows/07-refund-end-to-end.md §Aprovação passo 6
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
const ENTRY_ID_1 = '00000000-0000-0000-0000-000000000010'
const ENTRY_ID_2 = '00000000-0000-0000-0000-000000000011'
const TRANSACTION_ID = '00000000-0000-0000-0000-000000000020'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeWonEntry(id: string, contactId = CONTACT_ID) {
  return {
    id,
    contactId,
    funnelId: FUNNEL_ID,
    currentStageId: STAGE_ID,
    ownerUserId: null,
    label: 'won' as const,
    score: '0',
    entryDate: new Date('2026-01-01T00:00:00Z'),
    entryOrigin: null,
    entryCampaignId: null,
    entryCreativeId: null,
    conversionOrigin: null,
    conversionCampaignId: null,
    conversionCreativeId: null,
    transactionId: TRANSACTION_ID,
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

const { revertFunnelEntryAfterRefund } = await import(
  '../../../lib/domain/funnel/revert'
)

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

function buildTxWithEntries(entries: ReturnType<typeof makeWonEntry>[]) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(entries),
        }),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
  }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('FLOW-07 passo 6 — revertFunnelEntryAfterRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: happy path — entry won → reopened ──────────────────────────────

  describe('CT-REVERT-HAPPY — entry com label=won é revertida para reopened', () => {
    it(
      'given funnel_entry com label=won vinculada à transação ' +
        'when revertFunnelEntryAfterRefund ' +
        'then UPDATE label=reopened e emite TE-OPPORTUNITY-LABEL-CHANGED',
      async () => {
        const entry = makeWonEntry(ENTRY_ID_1)
        const tx = buildTxWithEntries([entry])

        await revertFunnelEntryAfterRefund(
          tx as unknown as Parameters<typeof revertFunnelEntryAfterRefund>[0],
          TRANSACTION_ID,
        )

        // UPDATE deve ter sido chamado
        expect(tx.update).toHaveBeenCalledTimes(1)

        // TE-OPPORTUNITY-LABEL-CHANGED emitido com payload correto
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'opportunity_label_changed',
            source: 'MOD-FUNNEL',
            actorSystem: 'refund_approve',
            subjectKind: 'funnel_entry',
            subjectId: ENTRY_ID_1,
            payload: {
              entry_id: ENTRY_ID_1,
              from: 'won',
              to: 'reopened',
            },
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: sem entry — retorna silenciosamente ───────────────────────────

  describe('CT-REVERT-NO-ENTRY — transação sem oportunidade retorna sem erro', () => {
    it(
      'given transação sem funnel_entry com label=won ' +
        'when revertFunnelEntryAfterRefund ' +
        'then retorna undefined sem UPDATE nem timeline event',
      async () => {
        const tx = buildTxWithEntries([])

        await expect(
          revertFunnelEntryAfterRefund(
            tx as unknown as Parameters<typeof revertFunnelEntryAfterRefund>[0],
            TRANSACTION_ID,
          ),
        ).resolves.toBeUndefined()

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 3: múltiplas entries won (edge case) ─────────────────────────────

  describe('CT-REVERT-MULTIPLE — múltiplas entries won são todas revertidas', () => {
    it(
      'given duas funnel_entries com label=won vinculadas à mesma transação ' +
        'when revertFunnelEntryAfterRefund ' +
        'then ambas têm UPDATE e dois eventos emitidos',
      async () => {
        const CONTACT_ID_2 = '00000000-0000-0000-0000-000000000099'
        const entry1 = makeWonEntry(ENTRY_ID_1, CONTACT_ID)
        const entry2 = makeWonEntry(ENTRY_ID_2, CONTACT_ID_2)
        const tx = buildTxWithEntries([entry1, entry2])

        await revertFunnelEntryAfterRefund(
          tx as unknown as Parameters<typeof revertFunnelEntryAfterRefund>[0],
          TRANSACTION_ID,
        )

        // UPDATE chamado para cada entry
        expect(tx.update).toHaveBeenCalledTimes(2)

        // Dois eventos de timeline emitidos
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(2)

        // Primeiro evento — entry 1
        expect(emitTimelineEventMock).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            contactId: CONTACT_ID,
            subjectId: ENTRY_ID_1,
            payload: {
              entry_id: ENTRY_ID_1,
              from: 'won',
              to: 'reopened',
            },
          }),
          tx,
        )

        // Segundo evento — entry 2
        expect(emitTimelineEventMock).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            contactId: CONTACT_ID_2,
            subjectId: ENTRY_ID_2,
            payload: {
              entry_id: ENTRY_ID_2,
              from: 'won',
              to: 'reopened',
            },
          }),
          tx,
        )
      },
    )
  })
})
