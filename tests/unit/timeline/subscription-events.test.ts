/**
 * Unit tests — subscription timeline payload schemas
 *
 * docs/30-contracts/03-timeline-event-catalog.md §Assinatura / Cobrança
 * docs/20-domain/13-subscription-billing.md §9
 * T-9-17
 */
import { describe, it, expect } from 'vitest'
import {
  TeSubscriptionStartedSchema,
  TeSubscriptionRenewedSchema,
  TeSubscriptionPastDueSchema,
  TeSubscriptionCancelledSchema,
} from '@/lib/timeline/schemas/subscription-events'

const UUID_A = '00000000-0000-0000-0000-000000000001'
const UUID_B = '00000000-0000-0000-0000-000000000002'
const UUID_C = '00000000-0000-0000-0000-000000000003'
const DT_1 = '2026-05-01T00:00:00.000Z'
const DT_2 = '2026-06-01T00:00:00.000Z'

// ── TE-SUBSCRIPTION-STARTED ──────────────────────────────────────────────────

describe('BR-TIMELINE — TeSubscriptionStartedSchema', () => {
  it('given active status without trial when parsed then success', () => {
    const result = TeSubscriptionStartedSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      offerId: UUID_C,
      status: 'active',
    })
    expect(result.success).toBe(true)
  })

  it('given trial status with trialEndsAt when parsed then success', () => {
    const result = TeSubscriptionStartedSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      offerId: UUID_C,
      status: 'trial',
      trialEndsAt: DT_1,
    })
    expect(result.success).toBe(true)
  })

  it('given invalid status enum when parsed then fails', () => {
    const result = TeSubscriptionStartedSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      offerId: UUID_C,
      status: 'past_due',
    })
    expect(result.success).toBe(false)
  })

  it('given missing offerId when parsed then fails', () => {
    const result = TeSubscriptionStartedSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      status: 'active',
    })
    expect(result.success).toBe(false)
  })

  it('given non-UUID subscriptionId when parsed then fails', () => {
    const result = TeSubscriptionStartedSchema.safeParse({
      subscriptionId: 'not-a-uuid',
      contactId: UUID_B,
      offerId: UUID_C,
      status: 'active',
    })
    expect(result.success).toBe(false)
  })
})

// ── TE-SUBSCRIPTION-RENEWED ──────────────────────────────────────────────────

describe('BR-TIMELINE — TeSubscriptionRenewedSchema', () => {
  it('given valid subscription and period dates when parsed then success', () => {
    const result = TeSubscriptionRenewedSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      newPeriodStart: DT_1,
      newPeriodEnd: DT_2,
    })
    expect(result.success).toBe(true)
  })

  it('given missing newPeriodEnd when parsed then fails', () => {
    const result = TeSubscriptionRenewedSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      newPeriodStart: DT_1,
    })
    expect(result.success).toBe(false)
  })

  it('given invalid datetime for newPeriodStart when parsed then fails', () => {
    const result = TeSubscriptionRenewedSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      newPeriodStart: 'not-a-date',
      newPeriodEnd: DT_2,
    })
    expect(result.success).toBe(false)
  })
})

// ── TE-SUBSCRIPTION-PAST-DUE ─────────────────────────────────────────────────

describe('BR-TIMELINE — TeSubscriptionPastDueSchema', () => {
  it('given valid subscription, contact and installment when parsed then success', () => {
    const result = TeSubscriptionPastDueSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      installmentId: UUID_C,
    })
    expect(result.success).toBe(true)
  })

  it('given missing installmentId when parsed then succeeds (installmentId is optional)', () => {
    const result = TeSubscriptionPastDueSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
    })
    expect(result.success).toBe(true)
  })

  it('given non-UUID contactId when parsed then fails', () => {
    const result = TeSubscriptionPastDueSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: 'bad-id',
      installmentId: UUID_C,
    })
    expect(result.success).toBe(false)
  })
})

// ── TE-SUBSCRIPTION-CANCELLED ────────────────────────────────────────────────

describe('BR-TIMELINE — TeSubscriptionCancelledSchema', () => {
  it('given valid subscription, contact, reason and period end when parsed then success', () => {
    const result = TeSubscriptionCancelledSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      reason: 'customer request',
      currentPeriodEnd: DT_2,
    })
    expect(result.success).toBe(true)
  })

  it('given empty reason when parsed then fails', () => {
    const result = TeSubscriptionCancelledSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      reason: '',
      currentPeriodEnd: DT_2,
    })
    expect(result.success).toBe(false)
  })

  it('given missing currentPeriodEnd when parsed then fails', () => {
    const result = TeSubscriptionCancelledSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      reason: 'dunning failure',
    })
    expect(result.success).toBe(false)
  })

  it('given invalid datetime for currentPeriodEnd when parsed then fails', () => {
    const result = TeSubscriptionCancelledSchema.safeParse({
      subscriptionId: UUID_A,
      contactId: UUID_B,
      reason: 'admin cancel',
      currentPeriodEnd: '2026-99-99',
    })
    expect(result.success).toBe(false)
  })
})
