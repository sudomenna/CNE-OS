/**
 * Tests: openRefund
 *
 * T-8-18
 * docs/20-domain/14-refund.md §5 invariantes, §6 transições
 * INV-REFUND-01: não pode haver refund ativo (requested|approved) para mesma transaction
 *
 * Mock de tx: DbTx — sem DB real.
 * Dado/When/Then (Given/When/Then)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRANSACTION_ID = '00000000-0000-0000-0000-000000000001'
const CONTACT_ID = '00000000-0000-0000-0000-000000000002'
const BRAND_ID = '00000000-0000-0000-0000-000000000003'
const USER_ID = '00000000-0000-0000-0000-000000000010'
const REFUND_ID = '00000000-0000-0000-0000-000000000020'
const AMOUNT = '500.00'
const REASON = 'Produto não entregue'

const approvedTransaction = {
  id: TRANSACTION_ID,
  status: 'approved',
  contactId: CONTACT_ID,
  brandId: BRAND_ID,
}

const newRefund = {
  id: REFUND_ID,
  transactionId: TRANSACTION_ID,
  openedByUserId: USER_ID,
  amount: AMOUNT,
  reason: REASON,
  status: 'requested',
  approvedByUserId: null,
  externalRefundId: null,
  externalProvider: null,
  approvedAt: null,
  rejectedAt: null,
  processedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// Mock tx builder
//
// Sequence of operations in openRefund:
//   1. select().from().where().limit()  → busca transaction
//   2. select().from().where().limit()  → busca active refund (INV-REFUND-01)
//   3. insert().values().returning()    → INSERT refund
//   4. insert().values()                → INSERT refund_status_history
//   5. emit()                            → TE-REFUND-OPENED (injetável, não via tx)
// ---------------------------------------------------------------------------

function buildMockTx({
  transactionRows = [approvedTransaction],
  activeRefundRows = [] as { id: string }[],
  insertRefundRows = [newRefund],
  insertHistoryRows = [{ id: 'hist-1' }],
}: {
  transactionRows?: typeof approvedTransaction[]
  activeRefundRows?: { id: string }[]
  insertRefundRows?: typeof newRefund[]
  insertHistoryRows?: { id: string }[]
} = {}): DbTx {
  // select mock — first call = transaction, second call = active refund check
  let selectCallCount = 0
  const selectResults = [transactionRows, activeRefundRows]

  const limit = vi.fn().mockImplementation(() => {
    return Promise.resolve(selectResults[selectCallCount - 1] ?? [])
  })
  const where = vi.fn().mockReturnValue({ limit })
  const innerJoin = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) })
  const from = vi.fn().mockReturnValue({ where, innerJoin })
  const select = vi.fn().mockImplementation(() => {
    selectCallCount++
    return { from }
  })

  // insert mock — first call = refund (with returning), second = status_history
  let insertCallCount = 0
  const insert = vi.fn().mockImplementation(() => {
    insertCallCount++
    if (insertCallCount === 1) {
      // INSERT refund — has .returning()
      const returning = vi.fn().mockResolvedValue(insertRefundRows)
      const values = vi.fn().mockReturnValue({ returning })
      return { values }
    } else {
      // INSERT refund_status_history — no returning
      const values = vi.fn().mockResolvedValue(insertHistoryRows)
      return { values }
    }
  })

  return { select, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const { openRefund } = await import('../../../lib/domain/refund/open')
const {
  RefundTransactionNotFoundError,
  TransactionNotApprovedError,
  ActiveRefundExistsError,
} = await import('../../../lib/domain/refund/errors')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-REFUND — openRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path ───────────────────────────────────────────────────

  it(
    'given approved transaction with no active refund ' +
      'when openRefund ' +
      'then inserts refund with status requested and emits TE-REFUND-OPENED',
    async () => {
      const tx = buildMockTx()
      const emit = vi.fn().mockResolvedValue({})

      const result = await openRefund(tx, TRANSACTION_ID, USER_ID, AMOUNT, REASON, emit)

      expect(result.status).toBe('requested')
      expect(result.id).toBe(REFUND_ID)
      expect(result.transactionId).toBe(TRANSACTION_ID)
      expect(result.openedByUserId).toBe(USER_ID)

      // emit deve ter sido chamado com kind='refund_opened'
      expect(emit).toHaveBeenCalledOnce()
      const emitCall = emit.mock.calls[0]?.[0] as { kind: string; payload: Record<string, unknown> }
      expect(emitCall.kind).toBe('refund_opened')
      expect(emitCall.payload.refund_id).toBe(REFUND_ID)
      expect(emitCall.payload.transaction_id).toBe(TRANSACTION_ID)
    },
  )

  // ── Caso 2 — transação não aprovada ──────────────────────────────────────

  it(
    'given transaction with status pending ' +
      'when openRefund ' +
      'then throws TransactionNotApprovedError',
    async () => {
      const pendingTransaction = { ...approvedTransaction, status: 'pending' }
      const tx = buildMockTx({ transactionRows: [pendingTransaction] })
      const emit = vi.fn()

      await expect(
        openRefund(tx, TRANSACTION_ID, USER_ID, AMOUNT, REASON, emit),
      ).rejects.toThrow(TransactionNotApprovedError)

      // emit não deve ter sido chamado
      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given non-existent transactionId ' +
      'when openRefund ' +
      'then throws RefundTransactionNotFoundError',
    async () => {
      const tx = buildMockTx({ transactionRows: [] })
      const emit = vi.fn()

      await expect(
        openRefund(tx, TRANSACTION_ID, USER_ID, AMOUNT, REASON, emit),
      ).rejects.toThrow(RefundTransactionNotFoundError)
    },
  )

  // ── Caso 3 — INV-REFUND-01: refund ativo já existe ───────────────────────

  it(
    'given approved transaction with existing active refund (requested) ' +
      'when openRefund ' +
      'then throws ActiveRefundExistsError (INV-REFUND-01)',
    async () => {
      const existingActiveRefund = { id: '00000000-0000-0000-0000-000000000099' }
      const tx = buildMockTx({ activeRefundRows: [existingActiveRefund] })
      const emit = vi.fn()

      await expect(
        openRefund(tx, TRANSACTION_ID, USER_ID, AMOUNT, REASON, emit),
      ).rejects.toThrow(ActiveRefundExistsError)

      // insert não deve ter sido chamado (nenhum refund criado)
      const txMock = tx as unknown as { insert: Mock }
      expect(txMock.insert).not.toHaveBeenCalled()

      // emit não deve ter sido chamado
      expect(emit).not.toHaveBeenCalled()
    },
  )
})
