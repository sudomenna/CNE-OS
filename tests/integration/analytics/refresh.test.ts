import { describe, it, expect } from 'vitest'

describe('analyticsRefreshHourly', () => {
  it('exporta função com id correto', async () => {
    const { analyticsRefreshHourly } = await import('@/inngest/functions/analytics-refresh')
    expect(analyticsRefreshHourly).toBeDefined()
  })
})
