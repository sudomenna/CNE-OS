/**
 * Unit tests — advanceSubscription
 *
 * T-9-07
 * docs/20-domain/13-subscription-billing.md §6.1 (matriz de transições)
 * docs/50-business-rules/BR-SUBSCRIPTION.md
 *
 * ADR-10: lança DomainError (SubscriptionNotFoundError).
 * ADR-11: tx como primeiro argumento.
 *
 * Naming: Given/When/Then por caso.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB_ID = '00000000-0000-0000-0000-000000000001'
const CONTACT_ID = '00000000-0000-0000-0000-000000000002'
const BRAND_ID = '00000000-0000-0000-0000-000000000003'

type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'

type FakeSubscription = {
  id: string
  contactId: string
  brandId: string
  offerId: string
  offerConditionId: string
  offerPaymentOptionId: string
  originTransactionId: string
  status: SubscriptionStatus
  currentPeriodStart: Date
  currentPeriodEnd: Date
  nextBillingAt: Date | null
  trialEndsAt: Date | null
  cancelledAt: Date | null
  cancelReason: string | null
  externalProvider: null
  externalId: null
  createdAt: Date
  updatedAt: Date
}

const PAST = new Date('2026-01-01T00:00:00.000Z')
const NOW = new Date('2026-04-25T12:00:00.000Z')
const FUTURE = new Date('2026-06-01T00:00:00.000Z')

function makeSub(overrides: Partial<FakeSubscription> = {}): FakeSubscription {
  return {
    id: SUB_ID,
    contactId: CONTACT_ID,
    brandId: BRAND_ID,
    offerId: '00000000-0000-0000-0000-000000000010',
    offerConditionId: '00000000-0000-0000-0000-000000000011',
    offerPaymentOptionId: '00000000-0000-0000-0000-000000000012',
    originTransactionId: '00000000-0000-0000-0000-000000000013',
    status: 'active',
    currentPeriodStart: PAST,
    currentPeriodEnd: FUTURE,
    nextBillingAt: FUTURE,
    trialEndsAt: null,
    cancelledAt: null,
    cancelReason: null,
    externalProvider: null,
    externalId: null,
    createdAt: PAST,
    updatedAt: PAST,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock builder for tx: DbTx
//
// selectCallSequence: array de arrays de rows retornadas por cada chamada select
// (1ª chamada = busca subscription, 2ª chamada = busca installment pago)
// ---------------------------------------------------------------------------

type MockTxOptions = {
  /** Rows returned per sequential select() call. */
  selectCallSequence?: unknown[][]
  /** Rows returned by update().returning() */
  updateReturning?: unknown[]
}

function buildMockTx(opts: MockTxOptions = {}) {
  const { selectCallSequence = [], updateReturning = [{}] } = opts

  let selectCallIndex = 0

  // select().from().where().limit() — each call gets the next entry from selectCallSequence
  const limit = vi.fn().mockImplementation(() => {
    const rows = selectCallSequence[selectCallIndex] ?? []
    selectCallIndex++
    return Promise.resolve(rows)
  })
  const selectWhere = vi.fn().mockReturnValue({ limit })
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere })
  // select without where (for select without where clause)
  const select = vi.fn().mockReturnValue({ from: selectFrom })

  // update().set().where().returning()
  const returning = vi.fn().mockResolvedValue(updateReturning)
  const updateWhere = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })

  // insert().values()
  const values = vi.fn().mockResolvedValue([])
  const insert = vi.fn().mockReturnValue({ values })

  const tx = { select, update, insert } as unknown as DbTx

  return {
    tx,
    mocks: {
      select, selectFrom, selectWhere, limit,
      update, set, updateWhere, returning,
      insert, values,
    },
  }
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { advanceSubscription, SubscriptionNotFoundError } = await import(
  '../../../lib/domain/billing/advance'
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('advance.trial-to-active', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given trial expired and installment paid when advanceSubscription then returns active',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const sub = makeSub({
        status: 'trial',
        trialEndsAt: PAST, // expired
        currentPeriodStart: PAST,
        currentPeriodEnd: FUTURE,
      })

      // select call 1: subscription found; select call 2: installment paid found
      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub], [{ id: 'inst-1' }]],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('active')
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg).toMatchObject({ status: 'active' })
      expect(mocks.insert).toHaveBeenCalledOnce()
      const histArg = mocks.values.mock.calls[0]?.[0]
      expect(histArg).toMatchObject({ oldStatus: 'trial', newStatus: 'active' })
      // No TE emitted for trial → active
      expect(emit).not.toHaveBeenCalled()
    },
  )
})

describe('advance.trial-to-past-due', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given trial expired and no paid installment when advanceSubscription then returns past_due and emits TE-SUBSCRIPTION-PAST-DUE',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const sub = makeSub({
        status: 'trial',
        trialEndsAt: PAST, // expired
        currentPeriodStart: PAST,
        currentPeriodEnd: FUTURE,
      })

      // select call 1: subscription; select call 2: no paid installment
      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub], []],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('past_due')
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg).toMatchObject({ status: 'past_due' })
      expect(mocks.insert).toHaveBeenCalledOnce()

      // TE-SUBSCRIPTION-PAST-DUE emitted
      expect(emit).toHaveBeenCalledOnce()
      const [emitInput] = emit.mock.calls[0]!
      expect(emitInput).toMatchObject({
        kind: 'subscription_past_due',
        source: 'MOD-BILLING',
        actorSystem: 'advanceSubscription',
        subjectKind: 'subscription',
        subjectId: SUB_ID,
      })
      expect(emitInput.payload).toMatchObject({ subscriptionId: SUB_ID })
    },
  )
})

describe('advance.active-to-past-due', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given active period_end passed and no payment and has next_billing_at when advanceSubscription then returns past_due',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const sub = makeSub({
        status: 'active',
        currentPeriodStart: PAST,
        currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'), // in the past
        nextBillingAt: FUTURE,
      })

      // select call 1: subscription; select call 2: no paid installment
      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub], []],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('past_due')
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg).toMatchObject({ status: 'past_due' })

      // TE-SUBSCRIPTION-PAST-DUE emitted
      expect(emit).toHaveBeenCalledOnce()
      expect(emit.mock.calls[0]![0].kind).toBe('subscription_past_due')
    },
  )
})

describe('advance.active-renewed', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given active period_end passed and installment paid and next_billing_at set when advanceSubscription then advances period and emits TE-SUBSCRIPTION-RENEWED',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const periodEnd = new Date('2026-03-01T00:00:00.000Z') // in the past
      const sub = makeSub({
        status: 'active',
        currentPeriodStart: PAST,
        currentPeriodEnd: periodEnd,
        nextBillingAt: FUTURE,
      })

      // select call 1: subscription; select call 2: paid installment found
      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub], [{ id: 'inst-1' }]],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('active')

      // update called with new period
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg.currentPeriodStart).toEqual(periodEnd)
      expect(setArg.currentPeriodEnd).toBeInstanceOf(Date)
      expect(setArg.currentPeriodEnd.getTime()).toBeGreaterThan(periodEnd.getTime())

      // history inserted with active → active / period_renewed
      expect(mocks.insert).toHaveBeenCalledOnce()
      const histArg = mocks.values.mock.calls[0]?.[0]
      expect(histArg).toMatchObject({ oldStatus: 'active', newStatus: 'active', note: 'period_renewed' })

      // TE-SUBSCRIPTION-RENEWED emitted
      expect(emit).toHaveBeenCalledOnce()
      expect(emit.mock.calls[0]![0].kind).toBe('subscription_renewed')
    },
  )
})

describe('advance.active-to-expired', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given active period_end passed and no payment and no next_billing_at when advanceSubscription then returns expired',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const sub = makeSub({
        status: 'active',
        currentPeriodStart: PAST,
        currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'), // past
        nextBillingAt: null, // no automatic renewal
      })

      // select call 1: subscription; select call 2: no paid installment
      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub], []],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('expired')
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg).toMatchObject({ status: 'expired' })
      // No TE emitted for active → expired
      expect(emit).not.toHaveBeenCalled()
    },
  )
})

describe('advance.past-due-to-active', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given past_due and paid installment after entry into past_due when advanceSubscription then returns active',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const sub = makeSub({
        status: 'past_due',
        currentPeriodStart: PAST,
        currentPeriodEnd: new Date('2026-03-01T00:00:00.000Z'),
        updatedAt: new Date('2026-03-02T00:00:00.000Z'), // when it went past_due
      })

      // select call 1: subscription; select call 2: paid installment found since updatedAt
      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub], [{ id: 'inst-paid' }]],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('active')
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg).toMatchObject({ status: 'active' })

      // history inserted
      expect(mocks.insert).toHaveBeenCalledOnce()
      const histArg = mocks.values.mock.calls[0]?.[0]
      expect(histArg).toMatchObject({ oldStatus: 'past_due', newStatus: 'active' })

      // No TE emitted for past_due → active (covered by installment events)
      expect(emit).not.toHaveBeenCalled()
    },
  )
})

describe('advance.cancelled-noop', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given cancelled subscription when advanceSubscription then returns cancelled without any UPDATE',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const sub = makeSub({
        status: 'cancelled',
        cancelledAt: PAST,
      })

      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub]],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('cancelled')
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )
})

describe('advance.expired-noop', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given expired subscription when advanceSubscription then returns expired without any UPDATE',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const sub = makeSub({ status: 'expired' })

      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub]],
      })

      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('expired')
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )
})

describe('advance.not-found', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given non-existent subscriptionId when advanceSubscription then throws SubscriptionNotFoundError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})

      const { tx } = buildMockTx({
        selectCallSequence: [[]], // empty: subscription not found
      })

      await expect(
        advanceSubscription(tx, 'non-existent-id', NOW, emit),
      ).rejects.toThrow(SubscriptionNotFoundError)

      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given non-existent subscriptionId when advanceSubscription then error message contains subscriptionId',
    async () => {
      const emit = vi.fn().mockResolvedValue({})

      const { tx } = buildMockTx({
        selectCallSequence: [[]],
      })

      await expect(
        advanceSubscription(tx, 'non-existent-id', NOW, emit),
      ).rejects.toThrow(/non-existent-id/)
    },
  )
})

describe('advance.injects-now', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given trial subscription and injected now before trial_ends_at when advanceSubscription then trial remains active (noop)',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const trialEndsAt = new Date('2026-05-01T00:00:00.000Z') // future relative to NOW
      const sub = makeSub({
        status: 'trial',
        trialEndsAt,
        currentPeriodStart: PAST,
        currentPeriodEnd: FUTURE,
      })

      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub]],
      })

      // inject NOW which is before trialEndsAt
      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('trial')
      expect(mocks.update).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given trial subscription and injected now after trial_ends_at and paid when advanceSubscription then transitions to active',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const trialEndsAt = new Date('2026-04-20T00:00:00.000Z') // past relative to NOW
      const sub = makeSub({
        status: 'trial',
        trialEndsAt,
        currentPeriodStart: PAST,
        currentPeriodEnd: FUTURE,
      })

      const { tx, mocks } = buildMockTx({
        selectCallSequence: [[sub], [{ id: 'inst-paid' }]],
      })

      // NOW is after trialEndsAt
      const result = await advanceSubscription(tx, SUB_ID, NOW, emit)

      expect(result).toBe('active')
      expect(mocks.update).toHaveBeenCalledOnce()
    },
  )
})
