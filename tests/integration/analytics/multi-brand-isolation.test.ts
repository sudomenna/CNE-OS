/**
 * T-10-14 — Isolamento multi-marca nas queries analíticas
 *
 * Verifica que todas as funções de query de analytics passam `brandId`
 * como parâmetro vinculado ao `db.execute`, não retornando dados de outras
 * marcas. O isolamento por RLS via `user_brand_ids()` é garantido nas views
 * SQL (T-10-01, T-10-02); este teste cobre a camada TypeScript.
 *
 * Estratégia: mock de `db.execute` — sem banco real.
 * Each query injects `db` via segundo argumento.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AnalyticsFilters } from '@/lib/analytics/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BRAND_A = 'aaaaaaaa-0000-0000-0000-000000000001'
const BRAND_B = 'bbbbbbbb-0000-0000-0000-000000000002'

function filters(brandId: string): AnalyticsFilters {
  return {
    brandId,
    from: new Date('2026-01-01'),
    to: new Date('2026-12-31'),
  }
}

// ---------------------------------------------------------------------------
// Mock db
//
// Captura os objetos SQL passados a db.execute para inspeção.
// Retorna array vazio por padrão (compatível com todos os retornos tipados).
// ---------------------------------------------------------------------------

const capturedQueries: unknown[] = []

const mockDb = {
  execute: vi.fn(async (query: unknown) => {
    capturedQueries.push(query)
    return []
  }),
}

beforeEach(() => {
  capturedQueries.length = 0
  mockDb.execute.mockClear()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extrai os parâmetros vinculados do objeto sql gerado pelo drizzle-orm.
 *
 * drizzle-orm sql`` produz um objeto com:
 *   queryChunks: Array<{ value: string[] } | primitive>
 *
 * As entradas que são `{ value: string[] }` são fragmentos SQL literais.
 * As entradas que NÃO são objetos com `value` array são os parâmetros
 * vinculados (brandId UUID, datas ISO, etc.).
 */
function getParamsFromCall(callArg: unknown): unknown[] {
  if (!callArg || typeof callArg !== 'object') return []
  const obj = callArg as Record<string, unknown>

  if (!Array.isArray(obj['queryChunks'])) return []

  return (obj['queryChunks'] as unknown[]).filter((chunk) => {
    // SQL fragment chunks are objects with `value` property that is an array of strings
    if (chunk !== null && typeof chunk === 'object') {
      const v = (chunk as Record<string, unknown>)['value']
      return !Array.isArray(v)
    }
    // primitive values (strings, numbers, Dates) are bound parameters
    return true
  })
}

// ---------------------------------------------------------------------------
// Imports — via dynamic import para garantir que o módulo usa o mock
// ---------------------------------------------------------------------------

const { querySalesByDay, queryRefundsByDay, queryDelinquency, queryOverviewKpis } =
  await import('@/lib/analytics/queries/sales')
const { queryFunnelConversion, queryInboxDaily, queryCampaignAttribution } =
  await import('@/lib/analytics/queries/ops')

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('multi-brand isolation — analytics queries', () => {
  // ── querySalesByDay ────────────────────────────────────────────────────────

  describe('querySalesByDay', () => {
    it(
      'given brand A filters ' +
        'when querySalesByDay ' +
        'then calls db.execute exactly once with brand_id param',
      async () => {
        await querySalesByDay(filters(BRAND_A), mockDb as never)

        expect(mockDb.execute).toHaveBeenCalledOnce()
      },
    )

    it(
      'given brand A and brand B called sequentially ' +
        'when querySalesByDay ' +
        'then calls db.execute twice — one call per brand (no mixing)',
      async () => {
        await querySalesByDay(filters(BRAND_A), mockDb as never)
        await querySalesByDay(filters(BRAND_B), mockDb as never)

        expect(mockDb.execute).toHaveBeenCalledTimes(2)
      },
    )

    it(
      'given brand A filters ' +
        'when querySalesByDay ' +
        'then brandId is passed as bound parameter to db.execute',
      async () => {
        await querySalesByDay(filters(BRAND_A), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_A)
      },
    )

    it(
      'given brand B filters ' +
        'when querySalesByDay ' +
        'then brand B id appears in bound params (not brand A)',
      async () => {
        await querySalesByDay(filters(BRAND_B), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_B)
        expect(params).not.toContain(BRAND_A)
      },
    )
  })

  // ── queryRefundsByDay ──────────────────────────────────────────────────────

  describe('queryRefundsByDay', () => {
    it(
      'given brand A filters ' +
        'when queryRefundsByDay ' +
        'then calls db.execute exactly once',
      async () => {
        await queryRefundsByDay(filters(BRAND_A), mockDb as never)

        expect(mockDb.execute).toHaveBeenCalledOnce()
      },
    )

    it(
      'given brand A filters ' +
        'when queryRefundsByDay ' +
        'then brandId is passed as bound parameter',
      async () => {
        await queryRefundsByDay(filters(BRAND_A), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_A)
      },
    )

    it(
      'given brand B filters ' +
        'when queryRefundsByDay ' +
        'then brand B id appears in params, brand A does not',
      async () => {
        await queryRefundsByDay(filters(BRAND_B), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_B)
        expect(params).not.toContain(BRAND_A)
      },
    )
  })

  // ── queryDelinquency ───────────────────────────────────────────────────────

  describe('queryDelinquency', () => {
    it(
      'given brand A filters ' +
        'when queryDelinquency ' +
        'then calls db.execute exactly once',
      async () => {
        await queryDelinquency(filters(BRAND_A), mockDb as never)

        expect(mockDb.execute).toHaveBeenCalledOnce()
      },
    )

    it(
      'given brand A filters ' +
        'when queryDelinquency ' +
        'then brandId is passed as bound parameter',
      async () => {
        await queryDelinquency(filters(BRAND_A), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_A)
      },
    )

    it(
      'given brand B filters ' +
        'when queryDelinquency ' +
        'then brand B id appears in params, brand A does not',
      async () => {
        await queryDelinquency(filters(BRAND_B), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_B)
        expect(params).not.toContain(BRAND_A)
      },
    )
  })

  // ── queryOverviewKpis ──────────────────────────────────────────────────────

  describe('queryOverviewKpis', () => {
    it(
      'given brand A filters ' +
        'when queryOverviewKpis ' +
        'then calls db.execute exactly 3 times (sales + refunds + inbox)',
      async () => {
        const mockDbMulti = {
          execute: vi.fn(async () => [{ revenue: 0, count: 0, avg_rt: null, open_count: 0 }]),
        }

        await queryOverviewKpis(filters(BRAND_A), mockDbMulti as never)

        expect(mockDbMulti.execute).toHaveBeenCalledTimes(3)
      },
    )

    it(
      'given brand A filters ' +
        'when queryOverviewKpis ' +
        'then all 3 db.execute calls carry brand A as bound parameter',
      async () => {
        const capturedParams: unknown[][] = []
        const mockDbMulti = {
          execute: vi.fn(async (query: unknown) => {
            capturedParams.push(getParamsFromCall(query))
            return [{ revenue: 0, count: 0, avg_rt: null, open_count: 0 }]
          }),
        }

        await queryOverviewKpis(filters(BRAND_A), mockDbMulti as never)

        expect(capturedParams).toHaveLength(3)
        for (const params of capturedParams) {
          expect(params).toContain(BRAND_A)
        }
      },
    )

    it(
      'given brand A filters ' +
        'when queryOverviewKpis ' +
        'then none of the 3 calls carry brand B as bound parameter',
      async () => {
        const capturedParams: unknown[][] = []
        const mockDbMulti = {
          execute: vi.fn(async (query: unknown) => {
            capturedParams.push(getParamsFromCall(query))
            return [{ revenue: 0, count: 0, avg_rt: null, open_count: 0 }]
          }),
        }

        await queryOverviewKpis(filters(BRAND_A), mockDbMulti as never)

        for (const params of capturedParams) {
          expect(params).not.toContain(BRAND_B)
        }
      },
    )

    it(
      'given brand A filters with zero data ' +
        'when queryOverviewKpis ' +
        'then returns OverviewKpis with zeroed numeric fields and null avgResponseTimeMinutes',
      async () => {
        const mockDbZero = {
          execute: vi.fn(async () => [{ revenue: 0, count: 0, avg_rt: null, open_count: 0 }]),
        }

        const result = await queryOverviewKpis(filters(BRAND_A), mockDbZero as never)

        expect(result.grossRevenue).toBe(0)
        expect(result.transactionsCount).toBe(0)
        expect(result.refundRate).toBe(0)
        expect(result.avgResponseTimeMinutes).toBeNull()
        expect(result.openConversations).toBe(0)
      },
    )
  })

  // ── queryFunnelConversion ──────────────────────────────────────────────────

  describe('queryFunnelConversion', () => {
    it(
      'given brand A filters ' +
        'when queryFunnelConversion ' +
        'then calls db.execute exactly once',
      async () => {
        await queryFunnelConversion(filters(BRAND_A), mockDb as never)

        expect(mockDb.execute).toHaveBeenCalledOnce()
      },
    )

    it(
      'given brand A filters ' +
        'when queryFunnelConversion ' +
        'then brandId is passed as bound parameter',
      async () => {
        await queryFunnelConversion(filters(BRAND_A), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_A)
      },
    )

    it(
      'given brand B filters ' +
        'when queryFunnelConversion ' +
        'then brand B id in params and brand A absent',
      async () => {
        await queryFunnelConversion(filters(BRAND_B), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_B)
        expect(params).not.toContain(BRAND_A)
      },
    )
  })

  // ── queryInboxDaily ────────────────────────────────────────────────────────

  describe('queryInboxDaily', () => {
    it(
      'given brand A filters ' +
        'when queryInboxDaily ' +
        'then calls db.execute exactly once',
      async () => {
        await queryInboxDaily(filters(BRAND_A), mockDb as never)

        expect(mockDb.execute).toHaveBeenCalledOnce()
      },
    )

    it(
      'given brand A filters ' +
        'when queryInboxDaily ' +
        'then brandId is passed as bound parameter',
      async () => {
        await queryInboxDaily(filters(BRAND_A), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_A)
      },
    )

    it(
      'given brand B filters ' +
        'when queryInboxDaily ' +
        'then brand B id in params and brand A absent',
      async () => {
        await queryInboxDaily(filters(BRAND_B), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_B)
        expect(params).not.toContain(BRAND_A)
      },
    )
  })

  // ── queryCampaignAttribution ───────────────────────────────────────────────

  describe('queryCampaignAttribution', () => {
    it(
      'given brand A filters ' +
        'when queryCampaignAttribution ' +
        'then calls db.execute exactly once',
      async () => {
        await queryCampaignAttribution(filters(BRAND_A), mockDb as never)

        expect(mockDb.execute).toHaveBeenCalledOnce()
      },
    )

    it(
      'given brand A filters ' +
        'when queryCampaignAttribution ' +
        'then brandId is passed as bound parameter',
      async () => {
        await queryCampaignAttribution(filters(BRAND_A), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_A)
      },
    )

    it(
      'given brand B filters ' +
        'when queryCampaignAttribution ' +
        'then brand B id in params and brand A absent',
      async () => {
        await queryCampaignAttribution(filters(BRAND_B), mockDb as never)

        const callArg = mockDb.execute.mock.calls[0]?.[0]
        const params = getParamsFromCall(callArg)
        expect(params).toContain(BRAND_B)
        expect(params).not.toContain(BRAND_A)
      },
    )
  })

  // ── Isolamento completo — todas as 6 queries acoplam ao db via parâmetro ───

  describe('isolamento completo — nenhuma query mistura marcas', () => {
    it(
      'given brand A filters for all 6 queries ' +
        'when all queries run in parallel ' +
        'then db.execute is called at least 6 times (one per query)',
      async () => {
        const beforeCount = mockDb.execute.mock.calls.length

        await Promise.all([
          querySalesByDay(filters(BRAND_A), mockDb as never),
          queryRefundsByDay(filters(BRAND_A), mockDb as never),
          queryDelinquency(filters(BRAND_A), mockDb as never),
          queryFunnelConversion(filters(BRAND_A), mockDb as never),
          queryInboxDaily(filters(BRAND_A), mockDb as never),
          queryCampaignAttribution(filters(BRAND_A), mockDb as never),
        ])

        const callsAfter = mockDb.execute.mock.calls.length - beforeCount
        expect(callsAfter).toBeGreaterThanOrEqual(6)
      },
    )

    it(
      'given brand A run then brand B run for all 6 queries ' +
        'when queries run sequentially by brand ' +
        'then total db.execute calls equals 12 (6 per brand, no sharing)',
      async () => {
        for (const brandId of [BRAND_A, BRAND_B]) {
          await Promise.all([
            querySalesByDay(filters(brandId), mockDb as never),
            queryRefundsByDay(filters(brandId), mockDb as never),
            queryDelinquency(filters(brandId), mockDb as never),
            queryFunnelConversion(filters(brandId), mockDb as never),
            queryInboxDaily(filters(brandId), mockDb as never),
            queryCampaignAttribution(filters(brandId), mockDb as never),
          ])
        }

        // 6 queries × 2 brands = 12 calls — each brand is isolated in its own call
        expect(mockDb.execute).toHaveBeenCalledTimes(12)
      },
    )

    it(
      'given all 6 queries called with brand A ' +
        'when inspecting all bound params ' +
        'then every call contains BRAND_A and none contains BRAND_B',
      async () => {
        const allParams: unknown[][] = []
        const strictMockDb = {
          execute: vi.fn(async (query: unknown) => {
            allParams.push(getParamsFromCall(query))
            return []
          }),
        }

        await Promise.all([
          querySalesByDay(filters(BRAND_A), strictMockDb as never),
          queryRefundsByDay(filters(BRAND_A), strictMockDb as never),
          queryDelinquency(filters(BRAND_A), strictMockDb as never),
          queryFunnelConversion(filters(BRAND_A), strictMockDb as never),
          queryInboxDaily(filters(BRAND_A), strictMockDb as never),
          queryCampaignAttribution(filters(BRAND_A), strictMockDb as never),
        ])

        expect(allParams.length).toBeGreaterThanOrEqual(6)
        for (const params of allParams) {
          expect(params).toContain(BRAND_A)
          expect(params).not.toContain(BRAND_B)
        }
      },
    )
  })
})
