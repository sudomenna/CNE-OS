/**
 * Unit tests — installment timeline payload schemas
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Assinatura / Cobrança
 * docs/20-domain/13-subscription-billing.md §9
 * T-9-17
 */
import { describe, it, expect } from 'vitest'
import {
  TeInstallmentPaidSchema,
  TeInstallmentOverdueSchema,
} from '@/lib/timeline/schemas/installment-events'

const UUID_A = '00000000-0000-0000-0000-000000000001'
const UUID_B = '00000000-0000-0000-0000-000000000002'
const DT_1 = '2026-05-15T10:00:00.000Z'

// ── TE-INSTALLMENT-PAID ──────────────────────────────────────────────────────

describe('BR-TIMELINE — TeInstallmentPaidSchema', () => {
  it('given installmentId, amount and paidAt when parsed then success', () => {
    const result = TeInstallmentPaidSchema.safeParse({
      installmentId: UUID_A,
      amount: 99.9,
      paidAt: DT_1,
    })
    expect(result.success).toBe(true)
  })

  it('given all fields including optional subscription and transaction when parsed then success', () => {
    const result = TeInstallmentPaidSchema.safeParse({
      installmentId: UUID_A,
      subscriptionId: UUID_B,
      transactionId: UUID_B,
      amount: 199.0,
      paidAt: DT_1,
    })
    expect(result.success).toBe(true)
  })

  it('given missing paidAt when parsed then fails', () => {
    const result = TeInstallmentPaidSchema.safeParse({
      installmentId: UUID_A,
      amount: 99.9,
    })
    expect(result.success).toBe(false)
  })

  it('given zero amount when parsed then fails', () => {
    const result = TeInstallmentPaidSchema.safeParse({
      installmentId: UUID_A,
      amount: 0,
      paidAt: DT_1,
    })
    expect(result.success).toBe(false)
  })

  it('given negative amount when parsed then fails', () => {
    const result = TeInstallmentPaidSchema.safeParse({
      installmentId: UUID_A,
      amount: -10,
      paidAt: DT_1,
    })
    expect(result.success).toBe(false)
  })

  it('given non-UUID installmentId when parsed then fails', () => {
    const result = TeInstallmentPaidSchema.safeParse({
      installmentId: 'not-a-uuid',
      amount: 99.9,
      paidAt: DT_1,
    })
    expect(result.success).toBe(false)
  })

  it('given invalid datetime paidAt when parsed then fails', () => {
    const result = TeInstallmentPaidSchema.safeParse({
      installmentId: UUID_A,
      amount: 99.9,
      paidAt: 'not-a-date',
    })
    expect(result.success).toBe(false)
  })
})

// ── TE-INSTALLMENT-OVERDUE ───────────────────────────────────────────────────

describe('BR-TIMELINE — TeInstallmentOverdueSchema', () => {
  it('given installmentId, amount and dueAt when parsed then success', () => {
    const result = TeInstallmentOverdueSchema.safeParse({
      installmentId: UUID_A,
      amount: 99.9,
      dueAt: DT_1,
    })
    expect(result.success).toBe(true)
  })

  it('given all fields including optional subscription and transaction when parsed then success', () => {
    const result = TeInstallmentOverdueSchema.safeParse({
      installmentId: UUID_A,
      subscriptionId: UUID_B,
      transactionId: UUID_B,
      amount: 299.0,
      dueAt: DT_1,
    })
    expect(result.success).toBe(true)
  })

  it('given missing dueAt when parsed then fails', () => {
    const result = TeInstallmentOverdueSchema.safeParse({
      installmentId: UUID_A,
      amount: 99.9,
    })
    expect(result.success).toBe(false)
  })

  it('given zero amount when parsed then fails', () => {
    const result = TeInstallmentOverdueSchema.safeParse({
      installmentId: UUID_A,
      amount: 0,
      dueAt: DT_1,
    })
    expect(result.success).toBe(false)
  })

  it('given non-UUID subscriptionId when parsed then fails', () => {
    const result = TeInstallmentOverdueSchema.safeParse({
      installmentId: UUID_A,
      subscriptionId: 'bad-id',
      amount: 99.9,
      dueAt: DT_1,
    })
    expect(result.success).toBe(false)
  })
})
