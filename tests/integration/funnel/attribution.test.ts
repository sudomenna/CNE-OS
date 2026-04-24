/**
 * Testes de integração — resolveAttribution + applyEntryAttribution (T-5-16)
 *
 * FLOW-14: clique com UTM → entrada em funil com entry_campaign_id/entry_creative_id.
 * docs/20-domain/08-funnel-opportunity.md §10 cases 3, 4
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md §2
 *
 * Estratégia: mockar @/lib/db/schema/campaign e @/lib/db/schema/funnel
 * para isolar lógica de domínio. tx é um objeto mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type {
  UtmSnapshot,
  EntryAttributionInput,
} from '../../../lib/domain/funnel/attribution'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const CAMPAIGN_ID = '00000000-0000-0000-0001-000000000001'
const CREATIVE_ID = '00000000-0000-0000-0001-000000000002'
const LINK_ID = '00000000-0000-0000-0001-000000000003'
const ENTRY_ID = '00000000-0000-0000-0001-000000000004'
const BRAND_ID = '00000000-0000-0000-0001-000000000005'
const FUNNEL_ID = '00000000-0000-0000-0001-000000000006'

// ---------------------------------------------------------------------------
// Fixture: trackable_link row
// ---------------------------------------------------------------------------

const trackableLinkRow = {
  id: LINK_ID,
  campaignId: CAMPAIGN_ID,
  creativeId: CREATIVE_ID,
  brandId: BRAND_ID,
  funnelId: FUNNEL_ID,
  destinationUrl: 'https://example.com/checkout',
  slug: 'abc123',
  utm: {
    utm_source: 'cne',
    utm_medium: 'meta_ads',
    utm_campaign: 'verao-2026',
    utm_content: 'criativo-banner-a',
  },
  createdAt: new Date('2026-04-01T00:00:00Z'),
  updatedAt: new Date('2026-04-01T00:00:00Z'),
}

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

/**
 * Constrói um tx mock para resolveAttribution que retorna o link fornecido.
 */
function buildTxWithLink(link: typeof trackableLinkRow | null) {
  const rows = link ? [{ id: link.id, campaignId: link.campaignId, creativeId: link.creativeId, createdAt: link.createdAt }] : []

  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
    update: vi.fn(),
  }
  return tx
}

/**
 * Constrói um tx mock para applyEntryAttribution (update).
 */
function buildTxForUpdate() {
  const setMock = vi.fn().mockReturnValue({
    where: vi.fn().mockResolvedValue(undefined),
  })
  const tx = {
    update: vi.fn().mockReturnValue({
      set: setMock,
    }),
    select: vi.fn(),
  }
  return { tx, setMock }
}

// ---------------------------------------------------------------------------
// Import dinâmico após setup de fixtures
// ---------------------------------------------------------------------------

const { resolveAttribution, applyEntryAttribution } = await import(
  '../../../lib/domain/funnel/attribution'
)

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-FUNNEL-OPPORTUNITY — resolveAttribution (FLOW-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: UTMs que resolvem para link existente ─────────────────────────

  describe('CT-ATTR-01 — UTMs que resolvem para link existente', () => {
    it(
      'given UTMs que batem com trackable_link existente ' +
        'when resolveAttribution ' +
        'then retorna { campaign_id, creative_id, trackable_link_id }',
      async () => {
        const tx = buildTxWithLink(trackableLinkRow)
        const utmSnapshot: UtmSnapshot = {
          utm_campaign: 'verao-2026',
          utm_source: 'cne',
          utm_content: 'criativo-banner-a',
        }

        const result = await resolveAttribution(
          tx as unknown as Parameters<typeof resolveAttribution>[0],
          utmSnapshot,
        )

        expect(result).not.toBeNull()
        expect(result?.campaign_id).toBe(CAMPAIGN_ID)
        expect(result?.creative_id).toBe(CREATIVE_ID)
        expect(result?.trackable_link_id).toBe(LINK_ID)

        // Verifica que select foi chamado (busca no DB)
        expect(tx.select).toHaveBeenCalledTimes(1)
      },
    )

    it(
      'given UTMs sem utm_content ' +
        'when resolveAttribution ' +
        'then retorna resultado sem filtrar por utm_content',
      async () => {
        const tx = buildTxWithLink(trackableLinkRow)
        const utmSnapshot: UtmSnapshot = {
          utm_campaign: 'verao-2026',
          utm_source: 'cne',
          // sem utm_content
        }

        const result = await resolveAttribution(
          tx as unknown as Parameters<typeof resolveAttribution>[0],
          utmSnapshot,
        )

        expect(result).not.toBeNull()
        expect(result?.campaign_id).toBe(CAMPAIGN_ID)
        expect(result?.trackable_link_id).toBe(LINK_ID)
      },
    )
  })

  // ── Caso 2: UTMs sem match → retorna null ─────────────────────────────────

  describe('CT-ATTR-02 — UTMs sem match', () => {
    it(
      'given UTMs que não batem com nenhum trackable_link ' +
        'when resolveAttribution ' +
        'then retorna null',
      async () => {
        const tx = buildTxWithLink(null)
        const utmSnapshot: UtmSnapshot = {
          utm_campaign: 'campanha-inexistente',
          utm_source: 'fonte-desconhecida',
        }

        const result = await resolveAttribution(
          tx as unknown as Parameters<typeof resolveAttribution>[0],
          utmSnapshot,
        )

        expect(result).toBeNull()
      },
    )

    it(
      'given trackable_link sem campaignId (link órfão) ' +
        'when resolveAttribution ' +
        'then retorna null',
      async () => {
        // Link órfão: campaignId = null (SET NULL quando campaign foi removida)
        const orphanLink = { ...trackableLinkRow, campaignId: null }
        const rows = [{ id: orphanLink.id, campaignId: null, creativeId: orphanLink.creativeId, createdAt: orphanLink.createdAt }]

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        }

        const utmSnapshot: UtmSnapshot = {
          utm_campaign: 'verao-2026',
          utm_source: 'cne',
        }

        const result = await resolveAttribution(
          tx as unknown as Parameters<typeof resolveAttribution>[0],
          utmSnapshot,
        )

        // Deve retornar null porque campaignId é null (link órfão)
        expect(result).toBeNull()
      },
    )
  })

  // ── Caso 3: link sem creative_id ─────────────────────────────────────────

  describe('CT-ATTR-03 — link sem creativeId', () => {
    it(
      'given trackable_link sem creativeId ' +
        'when resolveAttribution ' +
        'then retorna result com creative_id = null',
      async () => {
        const linkWithoutCreative = { ...trackableLinkRow, creativeId: null }
        const rows = [{ id: linkWithoutCreative.id, campaignId: linkWithoutCreative.campaignId, creativeId: null, createdAt: linkWithoutCreative.createdAt }]

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        }

        const utmSnapshot: UtmSnapshot = {
          utm_campaign: 'verao-2026',
          utm_source: 'cne',
        }

        const result = await resolveAttribution(
          tx as unknown as Parameters<typeof resolveAttribution>[0],
          utmSnapshot,
        )

        expect(result).not.toBeNull()
        expect(result?.campaign_id).toBe(CAMPAIGN_ID)
        expect(result?.creative_id).toBeNull()
        expect(result?.trackable_link_id).toBe(LINK_ID)
      },
    )
  })
})

// ---------------------------------------------------------------------------
// Testes applyEntryAttribution
// ---------------------------------------------------------------------------

describe('BR-FUNNEL-OPPORTUNITY — applyEntryAttribution (FLOW-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 4: atualiza campos corretos de entrada ───────────────────────────

  describe('CT-ATTR-04 — applyEntryAttribution atualiza campos de entrada', () => {
    it(
      'given attribution com campaign_id e creative_id ' +
        'when applyEntryAttribution ' +
        'then update seta entryCampaignId, entryCreativeId e entryOrigin com link ref',
      async () => {
        const { tx, setMock } = buildTxForUpdate()
        const attribution: EntryAttributionInput = {
          campaign_id: CAMPAIGN_ID,
          creative_id: CREATIVE_ID,
          trackable_link_id: LINK_ID,
        }

        await applyEntryAttribution(
          tx as unknown as Parameters<typeof applyEntryAttribution>[0],
          ENTRY_ID,
          attribution,
        )

        expect(tx.update).toHaveBeenCalledTimes(1)
        expect(setMock).toHaveBeenCalledTimes(1)

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const setArgs = setMock.mock.calls[0]![0]!
        expect(setArgs.entryCampaignId).toBe(CAMPAIGN_ID)
        expect(setArgs.entryCreativeId).toBe(CREATIVE_ID)
        expect(setArgs.entryOrigin).toBe(`trackable_link:${LINK_ID}`)
      },
    )

    it(
      'given attribution com creative_id = null ' +
        'when applyEntryAttribution ' +
        'then update seta entryCreativeId como null',
      async () => {
        const { tx, setMock } = buildTxForUpdate()
        const attribution: EntryAttributionInput = {
          campaign_id: CAMPAIGN_ID,
          creative_id: null,
          trackable_link_id: LINK_ID,
        }

        await applyEntryAttribution(
          tx as unknown as Parameters<typeof applyEntryAttribution>[0],
          ENTRY_ID,
          attribution,
        )

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const setArgs = setMock.mock.calls[0]![0]!
        expect(setArgs.entryCreativeId).toBeNull()
        expect(setArgs.entryCampaignId).toBe(CAMPAIGN_ID)
      },
    )

    it(
      'given ENTRY_ID qualquer ' +
        'when applyEntryAttribution ' +
        'then não toca campos de conversion_* (INV-FUNNEL-06)',
      async () => {
        const { tx, setMock } = buildTxForUpdate()
        const attribution: EntryAttributionInput = {
          campaign_id: CAMPAIGN_ID,
          creative_id: CREATIVE_ID,
          trackable_link_id: LINK_ID,
        }

        await applyEntryAttribution(
          tx as unknown as Parameters<typeof applyEntryAttribution>[0],
          ENTRY_ID,
          attribution,
        )

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const setArgs = setMock.mock.calls[0]![0]!

        // INV-FUNNEL-06: conversion_* não devem ser tocados aqui
        expect(setArgs.conversionCampaignId).toBeUndefined()
        expect(setArgs.conversionCreativeId).toBeUndefined()
        expect(setArgs.conversionOrigin).toBeUndefined()
        expect(setArgs.transactionId).toBeUndefined()
        expect(setArgs.label).toBeUndefined()
      },
    )
  })
})
