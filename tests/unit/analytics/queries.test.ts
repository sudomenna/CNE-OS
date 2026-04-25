/**
 * tests/unit/analytics/queries.test.ts
 * Unit tests para as queries analíticas — db.execute é mockado, sem I/O real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock db antes de importar os módulos que o importam.
// vi.mock é hoisted — a factory NÃO pode referenciar variáveis do módulo.
// Usamos vi.hoisted para criar o mock dentro do escopo hoistado.
// ---------------------------------------------------------------------------
const { mockExecute } = vi.hoisted(() => {
  const mockExecute = vi.fn()
  return { mockExecute }
})

vi.mock('@/lib/db/client', () => ({
  db: { execute: mockExecute },
}))

const mockDb = { execute: mockExecute }

// Importações após mock
import {
  querySalesByDay,
  queryRefundsByDay,
  queryDelinquency,
  queryOverviewKpis,
} from '@/lib/analytics/queries/sales'

import {
  queryFunnelConversion,
  queryInboxDaily,
  queryCampaignAttribution,
} from '@/lib/analytics/queries/ops'

const baseFilters = {
  brandId: 'brand-uuid-1',
  from: new Date('2026-04-01'),
  to: new Date('2026-04-30'),
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// querySalesByDay
// ---------------------------------------------------------------------------
describe('querySalesByDay', () => {
  it('given valid filters when called then returns rows with correct shape', async () => {
    const mockRow = {
      day: '2026-04-01',
      offerId: 'offer-uuid-1',
      offerName: 'Oferta A',
      transactionsCount: 5,
      grossRevenue: 1000,
      avgTicket: 200,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await querySalesByDay(baseFilters, mockDb as never)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      day: '2026-04-01',
      offerId: 'offer-uuid-1',
      offerName: 'Oferta A',
      transactionsCount: 5,
      grossRevenue: 1000,
      avgTicket: 200,
    })
  })

  it('given empty result when called then returns empty array', async () => {
    mockExecute.mockResolvedValueOnce([])

    const result = await querySalesByDay(baseFilters, mockDb as never)

    expect(result).toHaveLength(0)
  })

  it('given offerId filter when called then executes once', async () => {
    mockExecute.mockResolvedValueOnce([])

    await querySalesByDay(
      { ...baseFilters, offerId: 'offer-uuid-2' },
      mockDb as never,
    )

    expect(mockExecute).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// queryRefundsByDay
// ---------------------------------------------------------------------------
describe('queryRefundsByDay', () => {
  it('given valid filters when called then returns refund rows', async () => {
    const mockRow = {
      day: '2026-04-05',
      offerId: 'offer-uuid-1',
      refundsCount: 2,
      refundedAmount: 400,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryRefundsByDay(baseFilters, mockDb as never)

    expect(result).toHaveLength(1)
    expect(result[0]!.refundedAmount).toBe(400)
  })

  it('given empty result when called then returns empty array', async () => {
    mockExecute.mockResolvedValueOnce([])

    const result = await queryRefundsByDay(baseFilters, mockDb as never)

    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// queryDelinquency
// ---------------------------------------------------------------------------
describe('queryDelinquency', () => {
  it('given valid filters when called then returns delinquency rows', async () => {
    const mockRow = {
      id: 'inst-uuid-1',
      subscriptionId: 'sub-uuid-1',
      contactId: 'contact-uuid-1',
      offerId: 'offer-uuid-1',
      dueAt: '2026-03-01',
      amount: 300,
      daysOverdue: 30,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryDelinquency(baseFilters, mockDb as never)

    expect(result).toHaveLength(1)
    expect(result[0]!.daysOverdue).toBe(30)
  })

  it('given no overdue installments when called then returns empty array', async () => {
    mockExecute.mockResolvedValueOnce([])

    const result = await queryDelinquency(baseFilters, mockDb as never)

    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// queryOverviewKpis
// ---------------------------------------------------------------------------
describe('queryOverviewKpis', () => {
  it('given revenue and refunds when called then calculates refundRate correctly', async () => {
    mockExecute
      .mockResolvedValueOnce([{ revenue: 2000, count: 10 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ avg_rt: 15, open_count: 3 }])

    const result = await queryOverviewKpis(baseFilters, mockDb as never)

    expect(result.grossRevenue).toBe(2000)
    expect(result.transactionsCount).toBe(10)
    expect(result.refundRate).toBeCloseTo(0.2)
    expect(result.avgResponseTimeMinutes).toBe(15)
    expect(result.openConversations).toBe(3)
  })

  it('given zero transactions when called then refundRate is 0 (no division by zero)', async () => {
    mockExecute
      .mockResolvedValueOnce([{ revenue: 0, count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ avg_rt: null, open_count: 0 }])

    const result = await queryOverviewKpis(baseFilters, mockDb as never)

    expect(result.refundRate).toBe(0)
    expect(result.avgResponseTimeMinutes).toBeNull()
  })

  it('given null avg_rt when called then avgResponseTimeMinutes is null', async () => {
    mockExecute
      .mockResolvedValueOnce([{ revenue: 500, count: 5 }])
      .mockResolvedValueOnce([{ count: 1 }])
      .mockResolvedValueOnce([{ avg_rt: null, open_count: 2 }])

    const result = await queryOverviewKpis(baseFilters, mockDb as never)

    expect(result.avgResponseTimeMinutes).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// queryFunnelConversion
// ---------------------------------------------------------------------------
describe('queryFunnelConversion', () => {
  it('given valid filters when called then returns funnel rows', async () => {
    const mockRow = {
      funnelId: 'funnel-uuid-1',
      funnelName: 'Funil de Vendas',
      label: 'Qualificado',
      day: '2026-04-10',
      entriesCount: 20,
      avgCycleTimeDays: 3.5,
      avgScore: 7.2,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryFunnelConversion(baseFilters, mockDb as never)

    expect(result).toHaveLength(1)
    expect(result[0]!.funnelName).toBe('Funil de Vendas')
    expect(result[0]!.avgCycleTimeDays).toBe(3.5)
  })

  it('given funnelId filter when called then executes once', async () => {
    mockExecute.mockResolvedValueOnce([])

    await queryFunnelConversion(
      { ...baseFilters, funnelId: 'funnel-uuid-1' },
      mockDb as never,
    )

    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('given null avgScore when called then returns null in row', async () => {
    const mockRow = {
      funnelId: 'funnel-uuid-1',
      funnelName: 'Funil',
      label: 'Lead',
      day: '2026-04-01',
      entriesCount: 5,
      avgCycleTimeDays: null,
      avgScore: null,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryFunnelConversion(baseFilters, mockDb as never)

    expect(result[0]!.avgCycleTimeDays).toBeNull()
    expect(result[0]!.avgScore).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// queryInboxDaily
// ---------------------------------------------------------------------------
describe('queryInboxDaily', () => {
  it('given valid filters when called then returns inbox rows', async () => {
    const mockRow = {
      day: '2026-04-15',
      conversationsCount: 30,
      openCount: 10,
      closedCount: 20,
      avgResponseTimeMinutes: 12.5,
      overdueCount: 3,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryInboxDaily(baseFilters, mockDb as never)

    expect(result).toHaveLength(1)
    expect(result[0]!.closedCount).toBe(20)
    expect(result[0]!.avgResponseTimeMinutes).toBe(12.5)
  })

  it('given null avgResponseTimeMinutes when called then returns null', async () => {
    const mockRow = {
      day: '2026-04-15',
      conversationsCount: 0,
      openCount: 0,
      closedCount: 0,
      avgResponseTimeMinutes: null,
      overdueCount: 0,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryInboxDaily(baseFilters, mockDb as never)

    expect(result[0]!.avgResponseTimeMinutes).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// queryCampaignAttribution
// ---------------------------------------------------------------------------
describe('queryCampaignAttribution', () => {
  it('given valid filters when called then returns attribution rows', async () => {
    const mockRow = {
      campaignId: 'camp-uuid-1',
      campaignName: 'Black Friday',
      funnelId: 'funnel-uuid-1',
      entriesCount: 100,
      conversionsCount: 25,
      conversionRate: 0.25,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryCampaignAttribution(baseFilters, mockDb as never)

    expect(result).toHaveLength(1)
    expect(result[0]!.conversionRate).toBe(0.25)
  })

  it('given campaignId filter when called then executes once', async () => {
    mockExecute.mockResolvedValueOnce([])

    await queryCampaignAttribution(
      { ...baseFilters, campaignId: 'camp-uuid-1' },
      mockDb as never,
    )

    expect(mockExecute).toHaveBeenCalledTimes(1)
  })

  it('given null conversionRate when called then returns null', async () => {
    const mockRow = {
      campaignId: 'camp-uuid-2',
      campaignName: 'Campanha Sem Conversão',
      funnelId: 'funnel-uuid-1',
      entriesCount: 50,
      conversionsCount: 0,
      conversionRate: null,
    }
    mockExecute.mockResolvedValueOnce([mockRow])

    const result = await queryCampaignAttribution(baseFilters, mockDb as never)

    expect(result[0]!.conversionRate).toBeNull()
  })
})
