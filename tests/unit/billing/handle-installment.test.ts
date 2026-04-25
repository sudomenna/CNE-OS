/**
 * Unit tests — handleInstallmentPaid + handleInstallmentOverdue
 *
 * T-9-06
 * docs/20-domain/13-subscription-billing.md §6.2, §9
 * ADR-10: lança DomainError (InstallmentNotFoundError, InvalidStatusTransitionError).
 * ADR-11: tx como primeiro argumento.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const INSTALLMENT_ID = '00000000-0000-0000-0000-000000000001'
const SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000002'

type InstallmentStatus = 'scheduled' | 'paid' | 'overdue' | 'refunded' | 'cancelled'

type FakeInstallment = {
  id: string
  subscriptionId: string | null
  transactionId: string | null
  sequence: number
  due_at: Date
  amount: string
  status: InstallmentStatus
  paidAt: Date | null
  externalProvider: null
  externalId: null
  boletoUrl: string | null
  retryCount: number
  lastRetryAt: Date | null
  createdAt: Date
  updatedAt: Date
}

function makeFakeInstallment(overrides: Partial<FakeInstallment> = {}): FakeInstallment {
  const now = new Date()
  return {
    id: INSTALLMENT_ID,
    subscriptionId: SUBSCRIPTION_ID,
    transactionId: null,
    sequence: 1,
    due_at: new Date(now.getTime() - 24 * 60 * 60 * 1000), // yesterday
    amount: '197.00',
    status: 'scheduled',
    paidAt: null,
    externalProvider: null,
    externalId: null,
    boletoUrl: null,
    retryCount: 0,
    lastRetryAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock builder for tx: DbTx
//
// Simula as chamadas encadeadas Drizzle:
//   select().from().where().limit()    — buscar installment
//   update().set().where().returning() — atualizar installment
//   insert().values()                  — inserir installment_status_history
// ---------------------------------------------------------------------------

type MockTxOptions = {
  installmentRow?: FakeInstallment | undefined
  updatedInstallmentRow?: FakeInstallment | undefined
}

function buildMockTx(opts: MockTxOptions = {}) {
  const installmentRow: FakeInstallment | undefined =
    'installmentRow' in opts ? opts.installmentRow : makeFakeInstallment()
  const updatedInstallmentRow = opts.updatedInstallmentRow

  // select chain: select().from().where().limit() → [installmentRow]
  const limit = vi.fn().mockResolvedValue(installmentRow ? [installmentRow] : [])
  const selectWhere = vi.fn().mockReturnValue({ limit })
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere })
  const select = vi.fn().mockReturnValue({ from: selectFrom })

  // update chain: update().set().where().returning() → [updatedInstallmentRow]
  const effectiveUpdated = updatedInstallmentRow ?? (installmentRow ? { ...installmentRow } : undefined)
  const returning = vi.fn().mockResolvedValue(effectiveUpdated ? [effectiveUpdated] : [])
  const updateWhere = vi.fn().mockReturnValue({ returning })
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })

  // insert chain: insert().values() → Promise<[]>
  const values = vi.fn().mockResolvedValue([])
  const insert = vi.fn().mockReturnValue({ values })

  const tx = { select, update, insert } as unknown as DbTx

  return { tx, mocks: { select, selectFrom, selectWhere, limit, update, set, updateWhere, returning, insert, values } }
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const {
  handleInstallmentPaid,
  handleInstallmentOverdue,
  InstallmentNotFoundError,
  InvalidStatusTransitionError,
} = await import('../../../lib/domain/billing/handle-installment')

// ---------------------------------------------------------------------------
// Tests — handleInstallmentPaid
// ---------------------------------------------------------------------------

describe('installment.paid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── installment.paid.happy ──────────────────────────────────────────────────

  it(
    'given scheduled installment when handleInstallmentPaid then status becomes paid and history is inserted',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const base = makeFakeInstallment({ status: 'scheduled' })
      const expectedPaidAt = new Date('2026-04-25T10:00:00.000Z')
      const updated = { ...base, status: 'paid' as const, paidAt: expectedPaidAt }

      const { tx, mocks } = buildMockTx({
        installmentRow: base,
        updatedInstallmentRow: updated,
      })

      const result = await handleInstallmentPaid(tx, INSTALLMENT_ID, expectedPaidAt, emit)

      // status updated to paid
      expect(result.status).toBe('paid')

      // update was called
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg).toMatchObject({ status: 'paid', paidAt: expectedPaidAt })

      // history inserted
      expect(mocks.insert).toHaveBeenCalledOnce()
      const historyArg = mocks.values.mock.calls[0]?.[0]
      expect(historyArg).toMatchObject({
        installmentId: INSTALLMENT_ID,
        oldStatus: 'scheduled',
        newStatus: 'paid',
        note: 'installment_paid',
      })

      // TE-INSTALLMENT-PAID emitted
      expect(emit).toHaveBeenCalledOnce()
      const [emitInput] = emit.mock.calls[0]!
      expect(emitInput).toMatchObject({
        kind: 'installment_paid',
        source: 'MOD-BILLING',
        actorSystem: 'handleInstallmentPaid',
        subjectKind: 'installment',
        subjectId: INSTALLMENT_ID,
      })
      expect(emitInput.payload).toMatchObject({ installmentId: INSTALLMENT_ID })
    },
  )

  // ── installment.paid.overdue-to-paid ───────────────────────────────────────

  it(
    'given overdue installment when handleInstallmentPaid then transition overdue→paid succeeds',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const base = makeFakeInstallment({ status: 'overdue' })
      const updated = { ...base, status: 'paid' as const, paidAt: new Date() }

      const { tx, mocks } = buildMockTx({
        installmentRow: base,
        updatedInstallmentRow: updated,
      })

      const result = await handleInstallmentPaid(tx, INSTALLMENT_ID, undefined, emit)

      expect(result.status).toBe('paid')
      expect(mocks.update).toHaveBeenCalledOnce()

      const historyArg = mocks.values.mock.calls[0]?.[0]
      expect(historyArg).toMatchObject({ oldStatus: 'overdue', newStatus: 'paid' })

      expect(emit).toHaveBeenCalledOnce()
    },
  )

  // ── installment.paid.idempotent ────────────────────────────────────────────

  it(
    'given already-paid installment when handleInstallmentPaid then returns without UPDATE',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const alreadyPaid = makeFakeInstallment({ status: 'paid', paidAt: new Date() })

      const { tx, mocks } = buildMockTx({ installmentRow: alreadyPaid })

      const result = await handleInstallmentPaid(tx, INSTALLMENT_ID, undefined, emit)

      expect(result.status).toBe('paid')

      // must NOT call update or insert
      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )

  // ── installment.paid.invalid-transition ───────────────────────────────────

  it(
    'given refunded installment when handleInstallmentPaid then throws InvalidStatusTransitionError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const refunded = makeFakeInstallment({ status: 'refunded' })

      const { tx } = buildMockTx({ installmentRow: refunded })

      await expect(
        handleInstallmentPaid(tx, INSTALLMENT_ID, undefined, emit),
      ).rejects.toThrow(InvalidStatusTransitionError)

      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given cancelled installment when handleInstallmentPaid then throws InvalidStatusTransitionError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const cancelled = makeFakeInstallment({ status: 'cancelled' })

      const { tx } = buildMockTx({ installmentRow: cancelled })

      await expect(
        handleInstallmentPaid(tx, INSTALLMENT_ID, undefined, emit),
      ).rejects.toThrow(InvalidStatusTransitionError)
    },
  )

  it(
    'given invalid transition when handleInstallmentPaid then error message contains from and to status',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const refunded = makeFakeInstallment({ status: 'refunded' })

      const { tx } = buildMockTx({ installmentRow: refunded })

      await expect(
        handleInstallmentPaid(tx, INSTALLMENT_ID, undefined, emit),
      ).rejects.toThrow(/refunded.*paid/i)
    },
  )

  // ── installment.paid.not-found ─────────────────────────────────────────────

  it(
    'given non-existent installmentId when handleInstallmentPaid then throws InstallmentNotFoundError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})

      const { tx } = buildMockTx({ installmentRow: undefined })

      await expect(
        handleInstallmentPaid(tx, 'non-existent-id', undefined, emit),
      ).rejects.toThrow(InstallmentNotFoundError)

      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given non-existent installmentId when handleInstallmentPaid then update and insert are never called',
    async () => {
      const emit = vi.fn().mockResolvedValue({})

      const { tx, mocks } = buildMockTx({ installmentRow: undefined })

      await expect(
        handleInstallmentPaid(tx, 'non-existent-id', undefined, emit),
      ).rejects.toThrow(InstallmentNotFoundError)

      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
    },
  )
})

// ---------------------------------------------------------------------------
// Tests — handleInstallmentOverdue
// ---------------------------------------------------------------------------

describe('installment.overdue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── installment.overdue.happy ──────────────────────────────────────────────

  it(
    'given scheduled installment when handleInstallmentOverdue then status becomes overdue and history is inserted',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const base = makeFakeInstallment({ status: 'scheduled' })
      const updated = { ...base, status: 'overdue' as const }

      const { tx, mocks } = buildMockTx({
        installmentRow: base,
        updatedInstallmentRow: updated,
      })

      const result = await handleInstallmentOverdue(tx, INSTALLMENT_ID, emit)

      expect(result.status).toBe('overdue')

      // update was called
      expect(mocks.update).toHaveBeenCalledOnce()
      const setArg = mocks.set.mock.calls[0]?.[0]
      expect(setArg).toMatchObject({ status: 'overdue' })
      // paid_at must NOT be set
      expect(setArg?.paidAt).toBeUndefined()

      // history inserted
      expect(mocks.insert).toHaveBeenCalledOnce()
      const historyArg = mocks.values.mock.calls[0]?.[0]
      expect(historyArg).toMatchObject({
        installmentId: INSTALLMENT_ID,
        oldStatus: 'scheduled',
        newStatus: 'overdue',
        note: 'installment_overdue',
      })

      // TE-INSTALLMENT-OVERDUE emitted
      expect(emit).toHaveBeenCalledOnce()
      const [emitInput] = emit.mock.calls[0]!
      expect(emitInput).toMatchObject({
        kind: 'installment_overdue',
        source: 'MOD-BILLING',
        actorSystem: 'handleInstallmentOverdue',
        subjectKind: 'installment',
        subjectId: INSTALLMENT_ID,
      })
      expect(emitInput.payload).toMatchObject({ installmentId: INSTALLMENT_ID })
    },
  )

  // ── installment.overdue.idempotent ────────────────────────────────────────

  it(
    'given already-overdue installment when handleInstallmentOverdue then returns without UPDATE',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const alreadyOverdue = makeFakeInstallment({ status: 'overdue' })

      const { tx, mocks } = buildMockTx({ installmentRow: alreadyOverdue })

      const result = await handleInstallmentOverdue(tx, INSTALLMENT_ID, emit)

      expect(result.status).toBe('overdue')

      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )

  // ── installment.overdue.invalid-transition ────────────────────────────────

  it(
    'given paid installment when handleInstallmentOverdue then throws InvalidStatusTransitionError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const paid = makeFakeInstallment({ status: 'paid', paidAt: new Date() })

      const { tx } = buildMockTx({ installmentRow: paid })

      await expect(
        handleInstallmentOverdue(tx, INSTALLMENT_ID, emit),
      ).rejects.toThrow(InvalidStatusTransitionError)

      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given refunded installment when handleInstallmentOverdue then throws InvalidStatusTransitionError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const refunded = makeFakeInstallment({ status: 'refunded' })

      const { tx } = buildMockTx({ installmentRow: refunded })

      await expect(
        handleInstallmentOverdue(tx, INSTALLMENT_ID, emit),
      ).rejects.toThrow(InvalidStatusTransitionError)
    },
  )

  it(
    'given cancelled installment when handleInstallmentOverdue then throws InvalidStatusTransitionError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const cancelled = makeFakeInstallment({ status: 'cancelled' })

      const { tx } = buildMockTx({ installmentRow: cancelled })

      await expect(
        handleInstallmentOverdue(tx, INSTALLMENT_ID, emit),
      ).rejects.toThrow(InvalidStatusTransitionError)
    },
  )

  it(
    'given invalid transition when handleInstallmentOverdue then error message contains from and to status',
    async () => {
      const emit = vi.fn().mockResolvedValue({})
      const paid = makeFakeInstallment({ status: 'paid', paidAt: new Date() })

      const { tx } = buildMockTx({ installmentRow: paid })

      await expect(
        handleInstallmentOverdue(tx, INSTALLMENT_ID, emit),
      ).rejects.toThrow(/paid.*overdue/i)
    },
  )

  // ── not-found (overdue) ────────────────────────────────────────────────────

  it(
    'given non-existent installmentId when handleInstallmentOverdue then throws InstallmentNotFoundError',
    async () => {
      const emit = vi.fn().mockResolvedValue({})

      const { tx, mocks } = buildMockTx({ installmentRow: undefined })

      await expect(
        handleInstallmentOverdue(tx, 'non-existent-id', emit),
      ).rejects.toThrow(InstallmentNotFoundError)

      expect(mocks.update).not.toHaveBeenCalled()
      expect(mocks.insert).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )
})
