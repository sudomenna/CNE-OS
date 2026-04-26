/**
 * Testes unitários — resolveAttributionForContact
 *
 * FLOW-14 §3/§4: auto-discovery de atribuição de campanha por last-click.
 * BR-FUNNEL-OPPORTUNITY §2: last-click na janela de 30 dias.
 * docs/60-flows/14-campaign-attribution.md passos 3 e 4.
 *
 * Estratégia: tx mockado para simular timeline_event.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const CAMPAIGN_ID = '00000000-0000-0000-0000-000000000010'
const CREATIVE_ID = '00000000-0000-0000-0000-000000000011'
const LINK_ID = '00000000-0000-0000-0000-000000000012'
const TE_ID = '00000000-0000-0000-0000-000000000020'

// ---------------------------------------------------------------------------
// Import dinâmico
// ---------------------------------------------------------------------------

const { resolveAttributionForContact } = await import(
  '../../../lib/domain/funnel/attribution'
)

// ---------------------------------------------------------------------------
// Helpers de tx mock
// ---------------------------------------------------------------------------

/**
 * Constrói tx que retorna um timeline_event de campaign_link_clicked
 * com payload completo.
 */
function buildTxWithClick(payload: Record<string, unknown>) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: TE_ID,
                payload,
              },
            ]),
          }),
        }),
      }),
    }),
  }
}

/**
 * Constrói tx que retorna zero eventos (sem clique na janela).
 */
function buildTxNoClick() {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    }),
  }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('FLOW-14 — resolveAttributionForContact', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: clique recente com payload completo → retorna AttributionResult ─

  describe('dado clique recente com campaign_id e trackable_link_id', () => {
    it(
      'given campaign_link_clicked na janela com payload completo ' +
        'when resolveAttributionForContact ' +
        'then retorna AttributionResult com campaign_id, creative_id, trackable_link_id',
      async () => {
        const tx = buildTxWithClick({
          campaign_id: CAMPAIGN_ID,
          creative_id: CREATIVE_ID,
          trackable_link_id: LINK_ID,
        })

        const result = await resolveAttributionForContact(
          tx as unknown as Parameters<typeof resolveAttributionForContact>[0],
          CONTACT_ID,
          30,
        )

        expect(result).not.toBeNull()
        expect(result?.campaign_id).toBe(CAMPAIGN_ID)
        expect(result?.creative_id).toBe(CREATIVE_ID)
        expect(result?.trackable_link_id).toBe(LINK_ID)
      },
    )
  })

  // ── Caso 2: sem clique na janela → retorna null ───────────────────────────

  describe('FLOW-14 E-04 — sem clique na janela', () => {
    it(
      'given nenhum campaign_link_clicked na janela de windowDays ' +
        'when resolveAttributionForContact ' +
        'then retorna null',
      async () => {
        const tx = buildTxNoClick()

        const result = await resolveAttributionForContact(
          tx as unknown as Parameters<typeof resolveAttributionForContact>[0],
          CONTACT_ID,
          30,
        )

        expect(result).toBeNull()
      },
    )
  })

  // ── Caso 3: payload sem campaign_id → retorna null (link órfão) ───────────

  describe('dado payload sem campaign_id (link órfão)', () => {
    it(
      'given campaign_link_clicked com payload sem campaign_id ' +
        'when resolveAttributionForContact ' +
        'then retorna null (sem atribuição)',
      async () => {
        const tx = buildTxWithClick({
          // campaign_id ausente — link órfão (campanha arquivada / SET NULL)
          trackable_link_id: LINK_ID,
        })

        const result = await resolveAttributionForContact(
          tx as unknown as Parameters<typeof resolveAttributionForContact>[0],
          CONTACT_ID,
          30,
        )

        expect(result).toBeNull()
      },
    )
  })

  // ── Caso 4: payload sem trackable_link_id → retorna null ─────────────────

  describe('dado payload sem trackable_link_id', () => {
    it(
      'given campaign_link_clicked com payload sem trackable_link_id ' +
        'when resolveAttributionForContact ' +
        'then retorna null (payload incompleto)',
      async () => {
        const tx = buildTxWithClick({
          campaign_id: CAMPAIGN_ID,
          // trackable_link_id ausente
        })

        const result = await resolveAttributionForContact(
          tx as unknown as Parameters<typeof resolveAttributionForContact>[0],
          CONTACT_ID,
          30,
        )

        expect(result).toBeNull()
      },
    )
  })

  // ── Caso 5: clique com creative_id null → creative_id=null no resultado ───

  describe('dado clique com creative_id ausente', () => {
    it(
      'given campaign_link_clicked sem creative_id no payload ' +
        'when resolveAttributionForContact ' +
        'then retorna AttributionResult com creative_id=null',
      async () => {
        const tx = buildTxWithClick({
          campaign_id: CAMPAIGN_ID,
          trackable_link_id: LINK_ID,
          // creative_id ausente
        })

        const result = await resolveAttributionForContact(
          tx as unknown as Parameters<typeof resolveAttributionForContact>[0],
          CONTACT_ID,
          30,
        )

        expect(result).not.toBeNull()
        expect(result?.campaign_id).toBe(CAMPAIGN_ID)
        expect(result?.creative_id).toBeNull()
        expect(result?.trackable_link_id).toBe(LINK_ID)
      },
    )
  })

  // ── Caso 6: windowDays personalizado passa o valor correto na query ────────

  describe('dado windowDays personalizado', () => {
    it(
      'given windowDays=7 ' +
        'when resolveAttributionForContact ' +
        'then realiza query e retorna resultado',
      async () => {
        const tx = buildTxWithClick({
          campaign_id: CAMPAIGN_ID,
          trackable_link_id: LINK_ID,
        })

        const result = await resolveAttributionForContact(
          tx as unknown as Parameters<typeof resolveAttributionForContact>[0],
          CONTACT_ID,
          7,
        )

        expect(result).not.toBeNull()
        // Verifica que select foi chamado (query foi realizada)
        expect(tx.select).toHaveBeenCalledTimes(1)
      },
    )
  })
})
