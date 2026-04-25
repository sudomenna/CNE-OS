/**
 * Unit tests — createSubscriptionFromTransaction
 *
 * T-9-04
 * BR-SUBSCRIPTION: ciclo de assinatura — criação, idempotência, not-found.
 * ADR-10: lança TransactionNotFoundError (DomainError) quando transação não existe.
 * ADR-11: tx como primeiro argumento.
 *
 * docs/20-domain/13-subscription-billing.md §6.1, §9, §11
 * docs/50-business-rules/BR-SUBSCRIPTION.md §tabela-de-decisão
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRX_ID = 'trx-0000-0000-0000-0000-000000000001'
const CONTACT_ID = 'cnt-0000-0000-0000-0000-000000000001'
const BRAND_ID = 'brd-0000-0000-0000-0000-000000000001'
const OFFER_ID = 'ofe-0000-0000-0000-0000-000000000001'
const OFFER_CONDITION_ID = 'ofc-0000-0000-0000-0000-000000000001'
const OFFER_PAYMENT_OPTION_ID = 'opo-0000-0000-0000-0000-000000000001'
const SUBSCRIPTION_ID = 'sub-0000-0000-0000-0000-000000000001'

type FakeTransaction = {
  id: string
  contactId: string
  brandId: string
  offerId: string
  offerConditionId: string
  offerPaymentOptionId: string
  status: string
  amount: string
  currency: string
  externalProvider: null
  externalId: null
  externalFee: null
  snapshotId: null
  approvedAt: Date | null
  refusedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

type FakeSubscription = {
  id: string
  contactId: string
  brandId: string
  offerId: string
  offerConditionId: string
  offerPaymentOptionId: string
  originTransactionId: string
  status: 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired'
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

function makeFakeTransaction(overrides: Partial<FakeTransaction> = {}): FakeTransaction {
  const now = new Date()
  return {
    id: TRX_ID,
    contactId: CONTACT_ID,
    brandId: BRAND_ID,
    offerId: OFFER_ID,
    offerConditionId: OFFER_CONDITION_ID,
    offerPaymentOptionId: OFFER_PAYMENT_OPTION_ID,
    status: 'approved',
    amount: '497.00',
    currency: 'BRL',
    externalProvider: null,
    externalId: null,
    externalFee: null,
    snapshotId: null,
    approvedAt: now,
    refusedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeFakeSubscription(overrides: Partial<FakeSubscription> = {}): FakeSubscription {
  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  return {
    id: SUBSCRIPTION_ID,
    contactId: CONTACT_ID,
    brandId: BRAND_ID,
    offerId: OFFER_ID,
    offerConditionId: OFFER_CONDITION_ID,
    offerPaymentOptionId: OFFER_PAYMENT_OPTION_ID,
    originTransactionId: TRX_ID,
    status: 'active',
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    nextBillingAt: null,
    trialEndsAt: null,
    cancelledAt: null,
    cancelReason: null,
    externalProvider: null,
    externalId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock builder for tx: DbTx
//
// Simula as chamadas encadeadas Drizzle:
//   select → from → where → limit  (buscar transaction ou subscription existente)
//   insert → values → returning     (inserir subscription)
//   insert → values                 (inserir subscription_status_history — sem returning)
// ---------------------------------------------------------------------------

type MockTxOptions = {
  transactionRow?: FakeTransaction | undefined
  existingSubscriptionRow?: FakeSubscription | undefined
  insertedSubscriptionRow?: FakeSubscription | undefined
}

function buildMockTx(opts: MockTxOptions = {}): { tx: DbTx; mocks: ReturnType<typeof buildMocks> } {
  const transactionRow: FakeTransaction | undefined =
    'transactionRow' in opts ? opts.transactionRow : makeFakeTransaction()
  const existingSubscriptionRow: FakeSubscription | undefined =
    'existingSubscriptionRow' in opts ? opts.existingSubscriptionRow : undefined
  const insertedSubscriptionRow: FakeSubscription =
    opts.insertedSubscriptionRow ?? makeFakeSubscription()

  const mocks = buildMocks({ transactionRow, existingSubscriptionRow, insertedSubscriptionRow })
  return { tx: mocks.tx, mocks }
}

function buildMocks({
  transactionRow,
  existingSubscriptionRow,
  insertedSubscriptionRow,
}: {
  transactionRow: FakeTransaction | undefined
  existingSubscriptionRow: FakeSubscription | undefined
  insertedSubscriptionRow: FakeSubscription
}) {
  // Contador de chamadas select() para retornar rows corretos:
  // - chamada 1: buscar transaction
  // - chamada 2: buscar subscription existente (idempotência)
  let selectCallCount = 0

  const limit = vi.fn().mockImplementation(() => {
    const callIndex = selectCallCount
    selectCallCount++
    if (callIndex === 0) {
      // busca de transação
      return Promise.resolve(transactionRow ? [transactionRow] : [])
    } else {
      // busca de subscription existente (idempotência)
      return Promise.resolve(existingSubscriptionRow ? [existingSubscriptionRow] : [])
    }
  })
  const selectWhere = vi.fn().mockReturnValue({ limit })
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere })
  const select = vi.fn().mockReturnValue({ from: selectFrom })

  // insert().values() → { returning } (para subscription)
  // insert().values()                 (para subscription_status_history — sem returning)
  let insertCallCount = 0

  const returning = vi.fn().mockResolvedValue([insertedSubscriptionRow])
  const values = vi.fn().mockImplementation(() => {
    const callIndex = insertCallCount
    insertCallCount++
    if (callIndex === 0) {
      // primeira insert: subscription com returning
      return { returning }
    }
    // segunda insert: subscription_status_history sem returning
    return Promise.resolve([])
  })
  const insert = vi.fn().mockReturnValue({ values })

  const tx = { select, insert } as unknown as DbTx

  return { tx, select, selectFrom, selectWhere, limit, insert, values, returning }
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { createSubscriptionFromTransaction, TransactionNotFoundError } = await import(
  '../../../lib/domain/billing/create-subscription'
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-SUBSCRIPTION', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── subscription.create.from-transaction-happy ─────────────────────────────

  it(
    'given approved transaction when createSubscriptionFromTransaction then subscription is created with status active',
    async () => {
      const emitFn = vi.fn().mockResolvedValue({})
      const trx = makeFakeTransaction()
      const sub = makeFakeSubscription({ status: 'active' })

      const { tx } = buildMockTx({
        transactionRow: trx,
        existingSubscriptionRow: undefined,
        insertedSubscriptionRow: sub,
      })

      const result = await createSubscriptionFromTransaction(tx, TRX_ID, emitFn)

      expect(result).toEqual(sub)
      expect(result.status).toBe('active')
      expect(result.originTransactionId).toBe(TRX_ID)
    },
  )

  it(
    'given approved transaction when createSubscriptionFromTransaction then subscription_status_history is inserted with old_status null and new_status active',
    async () => {
      const emitFn = vi.fn().mockResolvedValue({})
      const trx = makeFakeTransaction()
      const sub = makeFakeSubscription({ status: 'active' })

      const { tx, mocks } = buildMockTx({
        transactionRow: trx,
        existingSubscriptionRow: undefined,
        insertedSubscriptionRow: sub,
      })

      await createSubscriptionFromTransaction(tx, TRX_ID, emitFn)

      // insert foi chamado 2x: subscription + subscription_status_history
      expect(mocks.insert).toHaveBeenCalledTimes(2)

      // Segunda chamada insert é subscription_status_history
      const historyValuesArg = mocks.values.mock.calls[1]?.[0]
      expect(historyValuesArg).toMatchObject({
        subscriptionId: sub.id,
        newStatus: 'active',
        note: 'subscription_created',
      })
      // old_status deve ser undefined/null (primeira transição)
      expect(historyValuesArg?.oldStatus).toBeUndefined()
    },
  )

  it(
    'given approved transaction when createSubscriptionFromTransaction then TE-SUBSCRIPTION-STARTED is emitted',
    async () => {
      const emitFn = vi.fn().mockResolvedValue({})
      const trx = makeFakeTransaction()
      const sub = makeFakeSubscription({ status: 'active' })

      const { tx } = buildMockTx({
        transactionRow: trx,
        existingSubscriptionRow: undefined,
        insertedSubscriptionRow: sub,
      })

      await createSubscriptionFromTransaction(tx, TRX_ID, emitFn)

      expect(emitFn).toHaveBeenCalledOnce()
      const [emitInput] = emitFn.mock.calls[0]!
      expect(emitInput).toMatchObject({
        contactId: CONTACT_ID,
        brandId: BRAND_ID,
        source: 'MOD-BILLING',
        actorSystem: 'createSubscriptionFromTransaction',
        subjectKind: 'subscription',
        subjectId: sub.id,
      })
      expect(emitInput.kind).toBe('subscription_started')
      expect(emitInput.payload).toMatchObject({
        subscriptionId: sub.id,
        contactId: CONTACT_ID,
      })
    },
  )

  // ── subscription.create.already-exists-returns-existing ────────────────────

  it(
    'given existing subscription for transactionId when createSubscriptionFromTransaction then existing subscription is returned without inserting',
    async () => {
      const emitFn = vi.fn().mockResolvedValue({})
      const trx = makeFakeTransaction()
      const existing = makeFakeSubscription({ id: 'sub-existing', status: 'active' })

      const { tx, mocks } = buildMockTx({
        transactionRow: trx,
        existingSubscriptionRow: existing,
        insertedSubscriptionRow: makeFakeSubscription(),
      })

      const result = await createSubscriptionFromTransaction(tx, TRX_ID, emitFn)

      // Deve retornar a existente sem inserir nova
      expect(result).toEqual(existing)
      expect(result.id).toBe('sub-existing')

      // insert NÃO deve ser chamado (idempotência)
      expect(mocks.insert).not.toHaveBeenCalled()

      // emit NÃO deve ser chamado (já existe, não reemite)
      expect(emitFn).not.toHaveBeenCalled()
    },
  )

  // ── subscription.create.transaction-not-found-throws ───────────────────────

  it(
    'given non-existent transactionId when createSubscriptionFromTransaction then throws TransactionNotFoundError',
    async () => {
      const emitFn = vi.fn().mockResolvedValue({})

      const { tx } = buildMockTx({
        transactionRow: undefined, // transação não encontrada
        existingSubscriptionRow: undefined,
        insertedSubscriptionRow: makeFakeSubscription(),
      })

      await expect(
        createSubscriptionFromTransaction(tx, 'non-existent-id', emitFn),
      ).rejects.toThrow(TransactionNotFoundError)
    },
  )

  it(
    'given non-existent transactionId when createSubscriptionFromTransaction then error message contains transactionId',
    async () => {
      const emitFn = vi.fn().mockResolvedValue({})

      const { tx } = buildMockTx({
        transactionRow: undefined,
        existingSubscriptionRow: undefined,
        insertedSubscriptionRow: makeFakeSubscription(),
      })

      const missingId = 'non-existent-id'
      await expect(
        createSubscriptionFromTransaction(tx, missingId, emitFn),
      ).rejects.toThrow(missingId)
    },
  )

  it(
    'given non-existent transactionId when createSubscriptionFromTransaction then insert and emit are never called',
    async () => {
      const emitFn = vi.fn().mockResolvedValue({})

      const { tx, mocks } = buildMockTx({
        transactionRow: undefined,
        existingSubscriptionRow: undefined,
        insertedSubscriptionRow: makeFakeSubscription(),
      })

      await expect(
        createSubscriptionFromTransaction(tx, 'non-existent-id', emitFn),
      ).rejects.toThrow(TransactionNotFoundError)

      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emitFn).not.toHaveBeenCalled()
    },
  )
})
