/**
 * Tests: rejectRefund
 *
 * T-8-18
 * docs/20-domain/14-refund.md §6 transições
 * BR-REFUND: rejeição de solicitação de reembolso
 *
 * Mock de tx: DbTx — sem DB real.
 * Dado/When/Then (Given/When/Then)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REFUND_ID = '00000000-0000-0000-0000-000000000020'
const TRANSACTION_ID = '00000000-0000-0000-0000-000000000001'
const CONTACT_ID = '00000000-0000-0000-0000-000000000002'
const BRAND_ID = '00000000-0000-0000-0000-000000000003'
const APPROVER_USER_ID = '00000000-0000-0000-0000-000000000010'
const REJECTION_REASON = 'Solicitação fora do prazo'

const requestedRefundSelectRow = {
  refundId: REFUND_ID,
  refundStatus: 'requested' as string,
  transactionId: TRANSACTION_ID,
  contactId: CONTACT_ID,
  brandId: BRAND_ID,
}

const rejectedRefundRow = {
  id: REFUND_ID,
  transactionId: TRANSACTION_ID,
  openedByUserId: '00000000-0000-0000-0000-000000000011',
  approvedByUserId: APPROVER_USER_ID,
  amount: '500.00',
  reason: 'Produto não entregue',
  status: 'rejected' as const,
  externalRefundId: null,
  externalProvider: null,
  approvedAt: null,
  rejectedAt: new Date(),
  processedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// Mock tx builder
//
// Sequence of operations in rejectRefund:
//   1. select().from().innerJoin().where().limit() → busca refund + transaction
//   2. update().set().where().returning()           → UPDATE refund status='rejected'
//   3. insert().values()                            → INSERT refund_status_history
//   4. emit()                                       → TE-REFUND-REJECTED (injetável)
// ---------------------------------------------------------------------------

function buildMockTx({
  selectRows = [requestedRefundSelectRow] as { refundId: string; refundStatus: string; transactionId: string; contactId: string; brandId: string }[],
  updateReturning = [rejectedRefundRow],
}: {
  selectRows?: { refundId: string; refundStatus: string; transactionId: string; contactId: string; brandId: string }[]
  updateReturning?: typeof rejectedRefundRow[]
} = {}): DbTx {
  const limit = vi.fn().mockResolvedValue(selectRows)
  const selectWhere = vi.fn().mockReturnValue({ limit })
  const innerJoin = vi.fn().mockReturnValue({ where: selectWhere })
  const from = vi.fn().mockReturnValue({ where: selectWhere, innerJoin })
  const select = vi.fn().mockReturnValue({ from })

  const updateReturningMock = vi.fn().mockResolvedValue(updateReturning)
  const updateWhere = vi.fn().mockReturnValue({ returning: updateReturningMock })
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  const insertValues = vi.fn().mockResolvedValue([{ id: 'hist-1' }])
  const insert = vi.fn().mockReturnValue({ values: insertValues })

  return { select, update, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const { rejectRefund } = await import('../../../lib/domain/refund/reject')
const {
  RefundNotFoundError,
  InvalidRefundStatusError,
} = await import('../../../lib/domain/refund/errors')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-REFUND — rejectRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path ───────────────────────────────────────────────────

  it(
    'given refund in requested status ' +
      'when rejectRefund ' +
      'then returns rejected refund with rejected_at set',
    async () => {
      const tx = buildMockTx()
      const emit = vi.fn().mockResolvedValue({})

      const result = await rejectRefund(tx, REFUND_ID, APPROVER_USER_ID, REJECTION_REASON, emit)

      expect(result.status).toBe('rejected')
      expect(result.id).toBe(REFUND_ID)
      expect(result.rejectedAt).toBeDefined()
      expect(result.approvedByUserId).toBe(APPROVER_USER_ID)
    },
  )

  // ── Caso 2 — status inválido (approved) ──────────────────────────────────

  it(
    'given refund in approved status ' +
      'when rejectRefund ' +
      'then throws InvalidRefundStatusError',
    async () => {
      const alreadyApprovedRow = {
        ...requestedRefundSelectRow,
        refundStatus: 'approved',
      }
      const tx = buildMockTx({ selectRows: [alreadyApprovedRow] })
      const emit = vi.fn()

      await expect(
        rejectRefund(tx, REFUND_ID, APPROVER_USER_ID, REJECTION_REASON, emit),
      ).rejects.toThrow(InvalidRefundStatusError)

      expect(emit).not.toHaveBeenCalled()
    },
  )

  it(
    'given refund in processed status ' +
      'when rejectRefund ' +
      'then throws InvalidRefundStatusError',
    async () => {
      const processedRow = {
        ...requestedRefundSelectRow,
        refundStatus: 'processed',
      }
      const tx = buildMockTx({ selectRows: [processedRow] })
      const emit = vi.fn()

      await expect(
        rejectRefund(tx, REFUND_ID, APPROVER_USER_ID, REJECTION_REASON, emit),
      ).rejects.toThrow(InvalidRefundStatusError)
    },
  )

  // ── Caso 3 — emite TE-REFUND-REJECTED ────────────────────────────────────

  it(
    'given refund in requested status ' +
      'when rejectRefund ' +
      'then emits TE-REFUND-REJECTED with correct payload',
    async () => {
      const tx = buildMockTx()
      const emit = vi.fn().mockResolvedValue({})

      await rejectRefund(tx, REFUND_ID, APPROVER_USER_ID, REJECTION_REASON, emit)

      expect(emit).toHaveBeenCalledOnce()
      const emitArg = emit.mock.calls[0]?.[0] as {
        kind: string
        payload: Record<string, unknown>
        actorUserId: string
      }
      expect(emitArg.kind).toBe('refund_rejected')
      expect(emitArg.payload.refund_id).toBe(REFUND_ID)
      expect(emitArg.payload.transaction_id).toBe(TRANSACTION_ID)
      expect(emitArg.payload.reason).toBe(REJECTION_REASON)
      expect(emitArg.actorUserId).toBe(APPROVER_USER_ID)
    },
  )

  // ── Caso 4 — refund não encontrado ────────────────────────────────────────

  it(
    'given non-existent refundId ' +
      'when rejectRefund ' +
      'then throws RefundNotFoundError',
    async () => {
      const tx = buildMockTx({ selectRows: [] })
      const emit = vi.fn()

      await expect(
        rejectRefund(tx, REFUND_ID, APPROVER_USER_ID, REJECTION_REASON, emit),
      ).rejects.toThrow(RefundNotFoundError)

      expect(emit).not.toHaveBeenCalled()
    },
  )
})
