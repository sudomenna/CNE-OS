/**
 * Unit tests — refuseTransaction
 *
 * T-8-12
 * docs/20-domain/11-transaction-snapshot.md §2, §6 transição pending→refused
 * ADR-10: funções lançam DomainError
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRX_ID = '00000000-0000-0000-0000-000000000002'

function makeTrx(overrides: Record<string, unknown> = {}) {
  return {
    id: TRX_ID,
    contactId: 'c1-uuid',
    brandId: 'b1-uuid',
    offerId: 'o1-uuid',
    offerConditionId: 'cd-uuid',
    offerPaymentOptionId: 'po-uuid',
    status: 'pending' as const,
    amount: '1500.00',
    currency: 'BRL',
    externalProvider: null,
    externalId: null,
    externalFee: null,
    snapshotId: null,
    approvedAt: null,
    refusedAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock tx builder
//
// Sequence of operations in refuseTransaction:
//   1. select().from().where().limit()    → find transaction
//   2. update().set().where().returning() → update status
//   3. insert().values()                  → insert status_history
// ---------------------------------------------------------------------------

function buildMockTx({
  selectRows = [makeTrx()] as ReturnType<typeof makeTrx>[],
  updateRows = [makeTrx({ status: 'refused', refusedAt: new Date() })] as ReturnType<typeof makeTrx>[],
} = {}): DbTx {
  const limit = vi.fn().mockResolvedValue(selectRows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  const updateReturning = vi.fn().mockResolvedValue(updateRows)
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning })
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })

  const historyInsertValues = vi.fn().mockResolvedValue([{ id: 'hist-id' }])
  const insert = vi.fn().mockReturnValue({ values: historyInsertValues })

  return { select, update, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const { refuseTransaction } = await import('../../../lib/domain/transaction/refuse')
const {
  TransactionNotFoundError,
  InvalidTransactionStatusForRefusalError,
} = await import('../../../lib/domain/transaction/errors')

describe('refuseTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path (pending → refused) ──────────────────────────────

  it(
    'given pending transaction ' +
      'when refuseTransaction ' +
      'then updates status to refused and inserts status_history',
    async () => {
      const refusedTrx = makeTrx({ status: 'refused', refusedAt: new Date() })
      const tx = buildMockTx({
        selectRows: [makeTrx()],
        updateRows: [refusedTrx],
      })

      const result = await refuseTransaction(tx, TRX_ID, 'payment_declined')

      expect(result.status).toBe('refused')
      expect(result.refusedAt).toBeDefined()

      // Verify history insert was called
      expect((tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert).toHaveBeenCalledOnce()
    },
  )

  // ── Caso 2 — NotFoundError quando transação não existe ──────────────────

  it(
    'given non-existent transactionId ' +
      'when refuseTransaction ' +
      'then throws TransactionNotFoundError',
    async () => {
      const tx = buildMockTx({ selectRows: [] })

      await expect(refuseTransaction(tx, TRX_ID)).rejects.toThrow(
        TransactionNotFoundError,
      )
    },
  )

  // ── Caso 3 — BusinessRuleViolation: approved não pode ser recusado ───────

  it(
    'given approved transaction ' +
      'when refuseTransaction ' +
      'then throws InvalidTransactionStatusForRefusalError',
    async () => {
      const approvedTrx = makeTrx({
        status: 'approved',
        approvedAt: new Date(),
        snapshotId: 'snap-uuid',
      })
      const tx = buildMockTx({ selectRows: [approvedTrx] })

      await expect(refuseTransaction(tx, TRX_ID)).rejects.toThrow(
        InvalidTransactionStatusForRefusalError,
      )
    },
  )

  // ── Caso 4 — BusinessRuleViolation: refunded não pode ser recusado ───────

  it(
    'given refunded transaction ' +
      'when refuseTransaction ' +
      'then throws InvalidTransactionStatusForRefusalError',
    async () => {
      const refundedTrx = makeTrx({ status: 'refunded' })
      const tx = buildMockTx({ selectRows: [refundedTrx] })

      await expect(refuseTransaction(tx, TRX_ID)).rejects.toThrow(
        InvalidTransactionStatusForRefusalError,
      )
    },
  )

  // ── Caso 5 — error message contém status atual e transactionId ───────────

  it(
    'given approved transaction ' +
      'when refuseTransaction ' +
      'then error message references current status',
    async () => {
      const approvedTrx = makeTrx({ status: 'approved', approvedAt: new Date(), snapshotId: 'snap-uuid' })
      const tx = buildMockTx({ selectRows: [approvedTrx] })

      await expect(refuseTransaction(tx, TRX_ID)).rejects.toThrow('approved')
    },
  )

  // ── Caso 6 — UPDATE não é chamado quando transação não existe ────────────

  it(
    'given non-existent transactionId ' +
      'when refuseTransaction ' +
      'then DB update is never called',
    async () => {
      const tx = buildMockTx({ selectRows: [] })

      await expect(refuseTransaction(tx, TRX_ID)).rejects.toThrow()

      expect((tx as unknown as { update: ReturnType<typeof vi.fn> }).update).not.toHaveBeenCalled()
    },
  )
})
