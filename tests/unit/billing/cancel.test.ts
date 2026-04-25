/**
 * Unit tests — cancelSubscription
 *
 * T-9-08
 * docs/20-domain/13-subscription-billing.md §6.1, §5 (INV-BILL-07)
 * docs/50-business-rules/BR-SUBSCRIPTION.md §Preservação de direitos ao cancelar
 *
 * ADR-10: lança DomainError (SubscriptionNotFoundForCancelError).
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
// select().from().where().limit()  — returns selectRows
// update().set().where().returning() — returns updateReturning
// insert().values()                — no-op
// ---------------------------------------------------------------------------

type MockTxOptions = {
  /** Rows returned by the subscription SELECT query. */
  selectRows?: unknown[]
  /** Rows returned by update().returning(). Defaults to selectRows[0] with cancelled status. */
  updateReturning?: unknown[]
}

function buildMockTx(opts: MockTxOptions = {}) {
  const { selectRows = [], updateReturning } = opts

  // The cancelSubscription function issues exactly one SELECT
  const limit = vi.fn().mockResolvedValue(selectRows)
  const selectWhere = vi.fn().mockReturnValue({ limit })
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere })
  const select = vi.fn().mockReturnValue({ from: selectFrom })

  // update().set().where().returning()
  // Default: return the same subscription row but with status='cancelled'
  const resolvedUpdateReturning =
    updateReturning ??
    (selectRows[0]
      ? [{ ...(selectRows[0] as FakeSubscription), status: 'cancelled', cancelledAt: new Date(), cancelReason: 'test_reason' }]
      : [])

  const returning = vi.fn().mockResolvedValue(resolvedUpdateReturning)
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

const { cancelSubscription, SubscriptionNotFoundForCancelError } = await import(
  '../../../lib/domain/billing/cancel'
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('cancel.happy.active', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given active subscription when cancelSubscription then returns cancelled with cancelled_at and history inserted and TE emitted',
    async () => {
      const sub = makeSub({ status: 'active' })
      const cancelledSub = {
        ...sub,
        status: 'cancelled' as const,
        cancelledAt: new Date(),
        cancelReason: 'admin_cancel',
      }
      const { tx, mocks } = buildMockTx({
        selectRows: [sub],
        updateReturning: [cancelledSub],
      })
      const emit = vi.fn().mockResolvedValue({})

      const result = await cancelSubscription(tx, SUB_ID, 'admin_cancel', emit)

      // Should return the cancelled subscription
      expect(result.status).toBe('cancelled')
      expect(result.cancelledAt).toBeDefined()
      expect(result.cancelReason).toBe('admin_cancel')

      // UPDATE should have been called once
      expect(mocks.update).toHaveBeenCalledTimes(1)

      // INSERT (history) should have been called once
      expect(mocks.insert).toHaveBeenCalledTimes(1)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const historyPayload = mocks.values.mock.calls[0]![0] as Record<string, unknown>
      expect(historyPayload.subscriptionId).toBe(SUB_ID)
      expect(historyPayload.oldStatus).toBe('active')
      expect(historyPayload.newStatus).toBe('cancelled')
      expect(historyPayload.note).toBe('admin_cancel')

      // TE-SUBSCRIPTION-CANCELLED should have been emitted
      expect(emit).toHaveBeenCalledTimes(1)
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const emitPayload = emit.mock.calls[0]![0] as Record<string, unknown>
      expect((emitPayload as { subjectId: string }).subjectId).toBe(SUB_ID)
      expect((emitPayload as { kind: string }).kind).toBe('subscription_cancelled')
      const emitInner = emitPayload.payload as Record<string, unknown>
      expect(emitInner.reason).toBe('admin_cancel')
      expect(emitInner.currentPeriodEnd).toBeDefined()
    },
  )
})

describe('cancel.happy.past-due', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given past_due subscription when cancelSubscription then transitions to cancelled',
    async () => {
      const sub = makeSub({ status: 'past_due' })
      const cancelledSub = {
        ...sub,
        status: 'cancelled' as const,
        cancelledAt: new Date(),
        cancelReason: 'dunning_exhausted',
      }
      const { tx, mocks } = buildMockTx({
        selectRows: [sub],
        updateReturning: [cancelledSub],
      })
      const emit = vi.fn().mockResolvedValue({})

      const result = await cancelSubscription(tx, SUB_ID, 'dunning_exhausted', emit)

      expect(result.status).toBe('cancelled')
      expect(result.cancelReason).toBe('dunning_exhausted')

      // History: oldStatus should be past_due
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const historyPayload = mocks.values.mock.calls[0]![0] as Record<string, unknown>
      expect(historyPayload.oldStatus).toBe('past_due')
      expect(historyPayload.newStatus).toBe('cancelled')

      // TE emitted
      expect(emit).toHaveBeenCalledTimes(1)
    },
  )
})

describe('cancel.idempotent.already-cancelled', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given already cancelled subscription when cancelSubscription then returns without UPDATE',
    async () => {
      const sub = makeSub({
        status: 'cancelled',
        cancelledAt: PAST,
        cancelReason: 'previous_reason',
      })
      const { tx, mocks } = buildMockTx({ selectRows: [sub] })
      const emit = vi.fn().mockResolvedValue({})

      const result = await cancelSubscription(tx, SUB_ID, 'new_reason', emit)

      // Returns the existing record unchanged
      expect(result.status).toBe('cancelled')
      expect(result.cancelReason).toBe('previous_reason')

      // No UPDATE, no INSERT, no emit
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )
})

describe('cancel.idempotent.expired', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given expired subscription when cancelSubscription then returns without UPDATE',
    async () => {
      const sub = makeSub({ status: 'expired' })
      const { tx, mocks } = buildMockTx({ selectRows: [sub] })
      const emit = vi.fn().mockResolvedValue({})

      const result = await cancelSubscription(tx, SUB_ID, 'any_reason', emit)

      // Returns the existing record unchanged
      expect(result.status).toBe('expired')

      // No UPDATE, no INSERT, no emit
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )
})

describe('cancel.not-found', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given unknown subscriptionId when cancelSubscription then throws SubscriptionNotFoundForCancelError',
    async () => {
      const { tx } = buildMockTx({ selectRows: [] })
      const emit = vi.fn().mockResolvedValue({})

      await expect(
        cancelSubscription(tx, 'non-existent-id', 'reason', emit),
      ).rejects.toThrow(SubscriptionNotFoundForCancelError)

      // Ensure no side effects
      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given unknown subscriptionId when cancelSubscription then error contains subscriptionId',
    async () => {
      const MISSING_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      const { tx } = buildMockTx({ selectRows: [] })
      const emit = vi.fn().mockResolvedValue({})

      let caught: Error | null = null
      try {
        await cancelSubscription(tx, MISSING_ID, 'reason', emit)
      } catch (err) {
        caught = err as Error
      }

      expect(caught).toBeInstanceOf(SubscriptionNotFoundForCancelError)
      expect((caught as InstanceType<typeof SubscriptionNotFoundForCancelError>).subscriptionId).toBe(MISSING_ID)
    },
  )
})

describe('cancel.preserves-no-entitlement-change', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it(
    'given active subscription when cancelSubscription then no entitlement table is touched (INV-BILL-07)',
    async () => {
      // INV-BILL-07: entitlements ficam ativos até current_period_end.
      // cancelSubscription NÃO deve emitir operações sobre a tabela customer_entitlement.
      // Verificamos que insert foi chamado exatamente 1 vez (somente subscription_status_history)
      // e que update foi chamado exatamente 1 vez (somente subscription).
      const sub = makeSub({ status: 'active' })
      const cancelledSub = { ...sub, status: 'cancelled' as const, cancelledAt: new Date(), cancelReason: 'reason' }
      const { tx, mocks } = buildMockTx({
        selectRows: [sub],
        updateReturning: [cancelledSub],
      })
      const emit = vi.fn().mockResolvedValue({})

      await cancelSubscription(tx, SUB_ID, 'reason', emit)

      // Only 1 UPDATE (subscription), 0 for entitlement
      expect(mocks.update).toHaveBeenCalledTimes(1)

      // Only 1 INSERT (subscription_status_history)
      expect(mocks.insert).toHaveBeenCalledTimes(1)

      // Emit TE-SUBSCRIPTION-CANCELLED once
      expect(emit).toHaveBeenCalledTimes(1)

      // Confirm the single update call received: status='cancelled'
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const setCall = mocks.set.mock.calls[0]![0] as Record<string, unknown>
      expect(setCall.status).toBe('cancelled')
      expect(setCall.cancelledAt).toBeDefined()
    },
  )

  it(
    'given active subscription when cancelSubscription then current_period_end is preserved in TE payload',
    async () => {
      // INV-BILL-07: entitlements ficam ativos até current_period_end.
      // O TE deve incluir current_period_end para o cron de expiração de entitlements.
      const sub = makeSub({ status: 'active', currentPeriodEnd: FUTURE })
      const cancelledSub = { ...sub, status: 'cancelled' as const, cancelledAt: new Date(), cancelReason: 'reason', currentPeriodEnd: FUTURE }
      const { tx } = buildMockTx({
        selectRows: [sub],
        updateReturning: [cancelledSub],
      })
      const emit = vi.fn().mockResolvedValue({})

      await cancelSubscription(tx, SUB_ID, 'reason', emit)

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const emitPayload = emit.mock.calls[0]![0] as { payload: Record<string, unknown> }
      expect(emitPayload.payload.currentPeriodEnd).toBe(FUTURE.toISOString())
    },
  )
})
