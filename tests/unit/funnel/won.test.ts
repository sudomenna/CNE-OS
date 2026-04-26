/**
 * Testes unitários — markWon
 *
 * BR-FUNNEL-OPPORTUNITY §2: compra aprovada conclui a oportunidade.
 * INV-FUNNEL-05: label='won' exige transaction_id IS NOT NULL.
 * INV-FUNNEL-06: conversion_* só preenchido quando label transita para 'won'.
 * docs/20-domain/08-funnel-opportunity.md §10 cases 3, 4, 7
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
const TRANSACTION_ID = '00000000-0000-0000-0000-000000000020'
const CAMPAIGN_ID = '00000000-0000-0000-0000-000000000030'
const CREATIVE_ID = '00000000-0000-0000-0000-000000000031'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEntry(label: string, transactionId: string | null = null) {
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
    transactionId,
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

const { markWon } = await import('../../../lib/domain/funnel/won')
const { WonRequiresTransactionError } = await import('../../../lib/domain/funnel/won')
const { FunnelEntryNotFoundError, FunnelEntryTerminalError } = await import(
  '../../../lib/domain/funnel/errors'
)

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

/**
 * tx mock para cenário bem-sucedido.
 * Sequência: select 1 (funnel_entry) → [entry], select 2 (timeline attribution) → [] (sem clique).
 * A 2ª chamada de select acontece apenas quando conversionCampaignId não é fornecido.
 */
function buildTxHappyPath(entry: ReturnType<typeof makeEntry>) {
  let callIdx = 0

  return {
    select: vi.fn().mockImplementation(() => {
      callIdx++
      const idx = callIdx

      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockImplementation(() => {
            if (idx === 1) {
              // busca funnel_entry → entry
              return Promise.resolve([entry])
            }
            // idx 2: timeline attribution → sem clique (retorna via orderBy/limit)
            return {
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue([]),
              }),
            }
          }),
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

describe('BR-FUNNEL-OPPORTUNITY — markWon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: caso feliz — oportunidade ativa marcada como won ──────────────

  describe('CT-FUNNEL-02 — compra fechando oportunidade ativa', () => {
    it(
      'given oportunidade ativa com label=open ' +
        'when markWon com transactionId válido ' +
        'then UPDATE label=won e conversão, emite opportunity_won',
      async () => {
        const entry = makeEntry('open')
        const tx = buildTxHappyPath(entry)

        await markWon(tx as unknown as Parameters<typeof markWon>[0], {
          entryId: ENTRY_ID,
          transactionId: TRANSACTION_ID,
          conversionOrigin: 'campaign',
          conversionCampaignId: CAMPAIGN_ID,
          conversionCreativeId: CREATIVE_ID,
        })

        // UPDATE chamado
        expect(tx.update).toHaveBeenCalledTimes(1)

        // TE-OPPORTUNITY-WON emitido
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(1)
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'opportunity_won',
            source: 'MOD-FUNNEL',
            subjectKind: 'funnel_entry',
            subjectId: ENTRY_ID,
            payload: expect.objectContaining({
              funnel_id: FUNNEL_ID,
              funnel_entry_id: ENTRY_ID,
              transaction_id: TRANSACTION_ID,
              conversion_origin: 'campaign',
              conversion_campaign_id: CAMPAIGN_ID,
              conversion_creative_id: CREATIVE_ID,
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: markWon sem transactionId → WonRequiresTransactionError ────────

  describe('CT-FUNNEL-04 — markWon sem transactionId é rejeitado', () => {
    it(
      'given entryId e transactionId vazio ' +
        'when markWon ' +
        'then lança WonRequiresTransactionError antes de qualquer query',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          markWon(tx as unknown as Parameters<typeof markWon>[0], {
            entryId: ENTRY_ID,
            transactionId: '',
          }),
        ).rejects.toThrow(WonRequiresTransactionError)

        // Nenhuma query executada — validação antes do DB
        expect(tx.select).not.toHaveBeenCalled()
        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )

    it(
      'given transactionId com apenas espaços ' +
        'when markWon ' +
        'then lança WonRequiresTransactionError',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          markWon(tx as unknown as Parameters<typeof markWon>[0], {
            entryId: ENTRY_ID,
            transactionId: '   ',
          }),
        ).rejects.toThrow(WonRequiresTransactionError)
      },
    )
  })

  // ── Caso 3: entry não encontrada ─────────────────────────────────────────

  describe('CT-FUNNEL-ENTRY-NOT-FOUND — entry inexistente lança erro', () => {
    it(
      'given entryId inexistente ' +
        'when markWon ' +
        'then lança FunnelEntryNotFoundError',
      async () => {
        const tx = buildTxEntryNotFound()

        await expect(
          markWon(tx as unknown as Parameters<typeof markWon>[0], {
            entryId: ENTRY_ID,
            transactionId: TRANSACTION_ID,
          }),
        ).rejects.toThrow(FunnelEntryNotFoundError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 4: entry já lost → FunnelEntryTerminalError ─────────────────────

  describe('CT-FUNNEL-TERMINAL-LOST — entry com label=lost rejeita markWon', () => {
    it(
      'given oportunidade com label=lost (terminal) ' +
        'when markWon ' +
        'then lança FunnelEntryTerminalError',
      async () => {
        const lostEntry = makeEntry('lost')
        const tx = buildTxHappyPath(lostEntry)

        await expect(
          markWon(tx as unknown as Parameters<typeof markWon>[0], {
            entryId: ENTRY_ID,
            transactionId: TRANSACTION_ID,
          }),
        ).rejects.toThrow(FunnelEntryTerminalError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: entry já won com transactionId diferente → FunnelEntryTerminalError

  describe('CT-FUNNEL-TERMINAL-WON — entry com label=won e tx diferente rejeita', () => {
    it(
      'given oportunidade com label=won com transactionId diferente ' +
        'when markWon com outro transactionId ' +
        'then lança FunnelEntryTerminalError',
      async () => {
        const wonEntry = makeEntry('won', TRANSACTION_ID)
        const tx = buildTxHappyPath(wonEntry)

        const OTHER_TRANSACTION_ID = '00000000-0000-0000-0000-000000000099'

        await expect(
          markWon(tx as unknown as Parameters<typeof markWon>[0], {
            entryId: ENTRY_ID,
            transactionId: OTHER_TRANSACTION_ID,
          }),
        ).rejects.toThrow(FunnelEntryTerminalError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 6: idempotência — entry já won com mesmo transactionId → no-op ───

  describe('CT-FUNNEL-IDEMPOTENT-WON — markWon idempotente com mesmo transactionId', () => {
    it(
      'given oportunidade com label=won e mesmo transactionId ' +
        'when markWon novamente ' +
        'then retorna sem efeitos (no-op)',
      async () => {
        const wonEntry = makeEntry('won', TRANSACTION_ID)
        const tx = buildTxHappyPath(wonEntry)

        // Deve retornar sem erro
        await expect(
          markWon(tx as unknown as Parameters<typeof markWon>[0], {
            entryId: ENTRY_ID,
            transactionId: TRANSACTION_ID,
          }),
        ).resolves.toBeUndefined()

        // Nenhum UPDATE executado
        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 7: conversion_* opcionais e sem clique → direct origin ──────────

  describe('CT-FUNNEL-WON-NO-CONVERSION — conversão sem atributos e sem clique → direct', () => {
    it(
      'given markWon sem conversionCampaignId e sem clique na janela ' +
        'when markWon ' +
        'then conversion_origin=direct, conversion_campaign_id e conversion_creative_id são null',
      async () => {
        const entry = makeEntry('negotiating')
        const tx = buildTxHappyPath(entry)

        await markWon(tx as unknown as Parameters<typeof markWon>[0], {
          entryId: ENTRY_ID,
          transactionId: TRANSACTION_ID,
        })

        // FLOW-14 §4: sem clique na janela → conversion_origin='direct'
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({
              conversion_origin: 'direct',
              conversion_campaign_id: null,
              conversion_creative_id: null,
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 8: FLOW-14 auto-discovery de conversão com clique recente ──────────

  describe('FLOW-14 — auto-discovery de conversion attribution por last-click', () => {
    it(
      'given markWon sem conversionCampaignId e clique recente em campaign_link_clicked ' +
        'when markWon ' +
        'then conversion_campaign_id e conversion_creative_id preenchidos automaticamente',
      async () => {
        const entry = makeEntry('open')
        let callIdx = 0

        const tx = {
          select: vi.fn().mockImplementation(() => {
            callIdx++
            const idx = callIdx

            return {
              from: vi.fn().mockReturnValue({
                where: vi.fn().mockImplementation(() => {
                  if (idx === 1) {
                    // busca funnel_entry → entry
                    return Promise.resolve([entry])
                  }
                  // idx 2: timeline attribution → clique encontrado
                  return {
                    orderBy: vi.fn().mockReturnValue({
                      limit: vi.fn().mockResolvedValue([
                        {
                          id: '00000000-0000-0000-0000-000000000050',
                          payload: {
                            campaign_id: CAMPAIGN_ID,
                            creative_id: CREATIVE_ID,
                            trackable_link_id: '00000000-0000-0000-0000-000000000032',
                          },
                        },
                      ]),
                    }),
                  }
                }),
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

        await markWon(tx as unknown as Parameters<typeof markWon>[0], {
          entryId: ENTRY_ID,
          transactionId: TRANSACTION_ID,
        })

        // FLOW-14 §4: clique encontrado → conversion_origin='campaign'
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({
              conversion_origin: 'campaign',
              conversion_campaign_id: CAMPAIGN_ID,
              conversion_creative_id: CREATIVE_ID,
            }),
          }),
          tx,
        )

        // UPDATE deve ter sido chamado com os campos corretos
        expect(tx.update).toHaveBeenCalledTimes(1)
      },
    )
  })

  // ── Caso 9: conversionCampaignId explícito bypassa auto-discovery ──────────

  describe('FLOW-14 — conversionCampaignId explícito bypassa auto-discovery', () => {
    it(
      'given conversionCampaignId fornecido explicitamente ' +
        'when markWon ' +
        'then não chama auto-discovery e usa valor fornecido',
      async () => {
        const entry = makeEntry('open')
        // tx com apenas 1 select (funnel_entry load) — sem attribution call
        const tx = {
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

        await markWon(tx as unknown as Parameters<typeof markWon>[0], {
          entryId: ENTRY_ID,
          transactionId: TRANSACTION_ID,
          conversionCampaignId: CAMPAIGN_ID,
          conversionCreativeId: CREATIVE_ID,
          conversionOrigin: 'campaign',
        })

        // select chamado apenas 1 vez (funnel_entry load, sem attribution)
        expect(tx.select).toHaveBeenCalledTimes(1)

        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: expect.objectContaining({
              conversion_origin: 'campaign',
              conversion_campaign_id: CAMPAIGN_ID,
              conversion_creative_id: CREATIVE_ID,
            }),
          }),
          tx,
        )
      },
    )
  })
})
