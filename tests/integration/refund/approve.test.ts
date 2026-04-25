/**
 * Tests: approveRefund
 *
 * T-8-18
 * docs/20-domain/14-refund.md §5 invariantes (INV-REFUND-04), §7 efeitos colaterais
 * INV-REFUND-04: aprovação + todos os efeitos em 1 transação; falha = rollback total
 * INV-REFUND-06: não altera transaction_snapshot.payload (BR-SNAPSHOT-IMMUTABILITY)
 *
 * Mock de tx: DbTx — sem DB real.
 * Dado/When/Then (Given/When/Then)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'
import type { CustomerEntitlement } from '@/lib/db/schema/entitlement'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REFUND_ID = '00000000-0000-0000-0000-000000000020'
const TRANSACTION_ID = '00000000-0000-0000-0000-000000000001'
const CONTACT_ID = '00000000-0000-0000-0000-000000000002'
const BRAND_ID = '00000000-0000-0000-0000-000000000003'
const SNAPSHOT_ID = '00000000-0000-0000-0000-000000000004'
const APPROVER_USER_ID = '00000000-0000-0000-0000-000000000010'
const ENTITLEMENT_ID = '00000000-0000-0000-0000-000000000030'

const requestedRefundRow = {
  id: REFUND_ID,
  status: 'requested',
  transaction_id: TRANSACTION_ID,
  contact_id: CONTACT_ID,
  brand_id: BRAND_ID,
  transaction_snapshot_id: SNAPSHOT_ID,
  reason: 'Solicitação cliente',
  opened_by_user_id: '00000000-0000-0000-0000-000000000011',
  amount: '500.00',
}

const approvedRefundRow = {
  id: REFUND_ID,
  transactionId: TRANSACTION_ID,
  openedByUserId: '00000000-0000-0000-0000-000000000011',
  approvedByUserId: APPROVER_USER_ID,
  amount: '500.00',
  reason: 'Solicitação cliente',
  status: 'approved' as const,
  externalRefundId: null,
  externalProvider: null,
  approvedAt: new Date(),
  rejectedAt: null,
  processedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const mockEntitlement: CustomerEntitlement = {
  id: ENTITLEMENT_ID,
  contactId: CONTACT_ID,
  brandId: BRAND_ID,
  kind: 'product_access',
  refId: '00000000-0000-0000-0000-000000000031',
  refKind: 'product',
  originTransactionId: TRANSACTION_ID,
  lastUpdateTransactionId: TRANSACTION_ID,
  status: 'revoked',
  quantity: 1,
  accessRule: {},
  startedAt: new Date(),
  endsAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// Mock tx builder
//
// Sequence of operations in approveRefund:
//   1. execute(sql) → SELECT FOR UPDATE (raw refund + transaction join)
//   2. update().set().where().returning() → UPDATE refund status='approved'
//   3. insert().values() → INSERT refund_status_history
//   4. flagSnapshotFn(tx, snapshotId, refundId) → (injetável)
//   5. insert().values() → INSERT refund_effect_log snapshot_flagged
//   6. revokeFn(tx, transactionId, reason) → (injetável)
//   7. insert().values() × N → INSERT refund_effect_log entitlement_revoked
//   8. update().set().where() → UPDATE transaction status='refunded'
//   9. insert().values() → INSERT transaction_status_history
//   10. reclassifyFn(tx, contactId) → (injetável)
//   11. insert().values() → INSERT refund_effect_log contact_reclassified
//   12. revertOpportunityFn(tx, transactionId) → (injetável)
//   13. insert().values() → INSERT refund_effect_log opportunity_reverted
//   14. emit() × 2 → TE-REFUND-APPROVED + TE-SALE-REFUNDED (injetável)
//   15. insert().values() → INSERT refund_effect_log timeline_emitted
// ---------------------------------------------------------------------------

function buildMockTx({
  refundRow = requestedRefundRow as Record<string, unknown> | null,
  updateRefundReturning = [approvedRefundRow],
}: {
  refundRow?: Record<string, unknown> | null
  updateRefundReturning?: typeof approvedRefundRow[]
} = {}): DbTx {
  // execute() — FOR UPDATE SELECT
  const execute = vi.fn().mockResolvedValue(refundRow ? [refundRow] : [])

  // update() — for refund and transaction
  let updateCallCount = 0
  const update = vi.fn().mockImplementation(() => {
    updateCallCount++
    const set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(
          // first update is refund (returns rows), second is transaction (no returning checked)
          updateCallCount === 1 ? updateRefundReturning : [{ id: TRANSACTION_ID }],
        ),
      }),
    })
    return { set }
  })

  // insert() — multiple inserts in order
  const insert = vi.fn().mockReturnValue({
    values: vi.fn().mockResolvedValue([{ id: 'inserted-id' }]),
  })

  return { execute, update, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const { approveRefund } = await import('../../../lib/domain/refund/approve')
const {
  RefundNotFoundError,
  InvalidRefundStatusError,
} = await import('../../../lib/domain/refund/errors')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-REFUND — approveRefund', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path: todos os 8 efeitos executados ───────────────────

  it(
    'given refund in requested status ' +
      'when approveRefund ' +
      'then executes all 8 effects atomically and returns approved refund',
    async () => {
      const tx = buildMockTx()
      const reclassifyFn = vi.fn().mockResolvedValue(undefined)
      const revertOpportunityFn = vi.fn().mockResolvedValue(undefined)
      const revokeFn = vi.fn().mockResolvedValue([mockEntitlement])
      const flagSnapshotFn = vi.fn().mockResolvedValue(undefined)
      const emit = vi.fn().mockResolvedValue({})

      const result = await approveRefund(
        tx,
        REFUND_ID,
        APPROVER_USER_ID,
        reclassifyFn,
        revertOpportunityFn,
        revokeFn,
        flagSnapshotFn,
        emit,
      )

      // Refund retornado com status approved
      expect(result.status).toBe('approved')
      expect(result.id).toBe(REFUND_ID)
      expect(result.approvedByUserId).toBe(APPROVER_USER_ID)

      // Efeito 2: flagSnapshotFn foi chamado
      expect(flagSnapshotFn).toHaveBeenCalledOnce()
      expect(flagSnapshotFn).toHaveBeenCalledWith(tx, SNAPSHOT_ID, REFUND_ID)

      // Efeito 3: revokeFn foi chamado com transactionId e razão 'refund_revoke'
      expect(revokeFn).toHaveBeenCalledOnce()
      expect(revokeFn).toHaveBeenCalledWith(tx, TRANSACTION_ID, 'refund_revoke')

      // Efeito 6: reclassifyFn foi chamado com contactId
      expect(reclassifyFn).toHaveBeenCalledOnce()
      expect(reclassifyFn).toHaveBeenCalledWith(tx, CONTACT_ID)

      // Efeito 7: revertOpportunityFn foi chamado com transactionId
      expect(revertOpportunityFn).toHaveBeenCalledOnce()
      expect(revertOpportunityFn).toHaveBeenCalledWith(tx, TRANSACTION_ID)

      // Efeito 8: emit foi chamado 2x (TE-REFUND-APPROVED + TE-SALE-REFUNDED)
      expect(emit).toHaveBeenCalledTimes(2)
      const emitCalls = emit.mock.calls.map(
        (c) => (c[0] as { kind: string }).kind,
      )
      expect(emitCalls).toContain('refund_approved')
      expect(emitCalls).toContain('sale_refunded')
    },
  )

  // ── Caso 2 — status inválido ──────────────────────────────────────────────

  it(
    'given refund in approved status ' +
      'when approveRefund ' +
      'then throws InvalidRefundStatusError',
    async () => {
      const alreadyApproved = { ...requestedRefundRow, status: 'approved' }
      const tx = buildMockTx({ refundRow: alreadyApproved })
      const emit = vi.fn()
      const revokeFn = vi.fn()
      const flagSnapshotFn = vi.fn()

      await expect(
        approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          undefined,
          undefined,
          revokeFn,
          flagSnapshotFn,
          emit,
        ),
      ).rejects.toThrow(InvalidRefundStatusError)

      // Nenhum efeito deve ter sido executado
      expect(revokeFn).not.toHaveBeenCalled()
      expect(flagSnapshotFn).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )

  // ── Caso 3 — rollback se passo intermediário falha ────────────────────────

  it(
    'given refund in requested status and revokeFn throws ' +
      'when approveRefund ' +
      'then throws and does not reach emit (rollback implicit via tx)',
    async () => {
      const tx = buildMockTx()
      const revokeError = new Error('DB_ERROR: revoke failed')
      const revokeFn = vi.fn().mockRejectedValue(revokeError)
      const flagSnapshotFn = vi.fn().mockResolvedValue(undefined)
      const reclassifyFn = vi.fn()
      const revertOpportunityFn = vi.fn()
      const emit = vi.fn()

      await expect(
        approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          reclassifyFn,
          revertOpportunityFn,
          revokeFn,
          flagSnapshotFn,
          emit,
        ),
      ).rejects.toThrow('DB_ERROR: revoke failed')

      // Efeitos após revoke não foram executados
      expect(reclassifyFn).not.toHaveBeenCalled()
      expect(emit).not.toHaveBeenCalled()
    },
  )

  // ── Caso 4 — refund não encontrado ────────────────────────────────────────

  it(
    'given non-existent refundId ' +
      'when approveRefund ' +
      'then throws RefundNotFoundError',
    async () => {
      const tx = buildMockTx({ refundRow: null })
      const emit = vi.fn()

      await expect(
        approveRefund(tx, REFUND_ID, APPROVER_USER_ID, undefined, undefined, undefined, undefined, emit),
      ).rejects.toThrow(RefundNotFoundError)

      expect(emit).not.toHaveBeenCalled()
    },
  )

  // ── Caso 5 — emite os TEs corretos ───────────────────────────────────────

  it(
    'given refund in requested status ' +
      'when approveRefund ' +
      'then emits TE-REFUND-APPROVED with correct payload',
    async () => {
      const tx = buildMockTx()
      const revokeFn = vi.fn().mockResolvedValue([mockEntitlement])
      const flagSnapshotFn = vi.fn().mockResolvedValue(undefined)
      const emit = vi.fn().mockResolvedValue({})

      await approveRefund(
        tx,
        REFUND_ID,
        APPROVER_USER_ID,
        undefined,
        undefined,
        revokeFn,
        flagSnapshotFn,
        emit,
      )

      const refundApprovedCall = emit.mock.calls.find(
        (c) => (c[0] as { kind: string }).kind === 'refund_approved',
      )
      expect(refundApprovedCall).toBeDefined()
      const payload = (refundApprovedCall![0] as { payload: Record<string, unknown> }).payload
      expect(payload.refund_id).toBe(REFUND_ID)
      expect(payload.transaction_id).toBe(TRANSACTION_ID)

      const saleRefundedCall = emit.mock.calls.find(
        (c) => (c[0] as { kind: string }).kind === 'sale_refunded',
      )
      expect(saleRefundedCall).toBeDefined()
      const salePayload = (saleRefundedCall![0] as { payload: Record<string, unknown> }).payload
      expect(salePayload.transaction_id).toBe(TRANSACTION_ID)
      expect(salePayload.refund_id).toBe(REFUND_ID)
    },
  )
})
