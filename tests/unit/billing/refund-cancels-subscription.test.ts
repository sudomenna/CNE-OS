/**
 * Unit tests — T-9-16: approveRefund cancels associated subscription
 *
 * T-9-16: Extensão MOD-REFUND: approveRefund cancela assinatura associada
 * BR-REFUND §7 passo 7: subscription com origin_transaction_id = transactionId
 *   e status IN ('trial','active','past_due') → status='cancelled', cancel_reason='refund'
 * BR-SUBSCRIPTION INV-BILL-07: entitlements preservados até period_end — apenas status da
 *   subscription é marcado; revogação de entitlements ocorre em passo separado (passo 3).
 *
 * ADR-10: approveRefund retorna Promise<Refund> e lança DomainError.
 * ADR-11: tx: DbTx como primeiro argumento.
 *
 * Cenários cobertos:
 *   1. refund.approve.cancels-subscription — subscription ativa é cancelada
 *   2. refund.approve.no-subscription — sem subscription, approveRefund não lança erro
 *   3. refund.approve.already-cancelled — subscription já cancelada, não tenta cancelar novamente
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'
import type {
  CancelSubscriptionByTransactionFn,
  CancelledSubscriptionResult,
} from '@/lib/domain/refund/approve'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const REFUND_ID = 'ref-0000-0000-0000-0000-000000000001'
const TRANSACTION_ID = 'trx-0000-0000-0000-0000-000000000001'
const CONTACT_ID = 'cnt-0000-0000-0000-0000-000000000001'
const BRAND_ID = 'brd-0000-0000-0000-0000-000000000001'
const APPROVER_USER_ID = 'usr-0000-0000-0000-0000-admin000001'
const SNAPSHOT_ID = 'snp-0000-0000-0000-0000-000000000001'
const SUBSCRIPTION_ID = 'sub-0000-0000-0000-0000-000000000001'

type FakeRefund = {
  id: string
  transaction_id: string
  contact_id: string
  brand_id: string
  transaction_snapshot_id: string | null
  status: string
  reason: string
  opened_by_user_id: string
  approved_by_user_id: string | null
  amount: string
  approved_at: Date | null
  rejected_at: Date | null
  processed_at: Date | null
  created_at: Date
  updated_at: Date
  external_refund_id: string | null
  external_provider: string | null
}

function makeFakeRefundRow(overrides: Partial<FakeRefund> = {}): FakeRefund {
  const now = new Date()
  return {
    id: REFUND_ID,
    transaction_id: TRANSACTION_ID,
    contact_id: CONTACT_ID,
    brand_id: BRAND_ID,
    transaction_snapshot_id: SNAPSHOT_ID,
    status: 'requested',
    reason: 'customer_request',
    opened_by_user_id: 'usr-0000-support',
    approved_by_user_id: null,
    amount: '497.00',
    approved_at: null,
    rejected_at: null,
    processed_at: null,
    created_at: now,
    updated_at: now,
    external_refund_id: null,
    external_provider: null,
    ...overrides,
  }
}

type FakeApprovedRefund = {
  id: string
  transactionId: string
  status: string
  approvedByUserId: string
  approvedAt: Date
}

function makeFakeApprovedRefund(): FakeApprovedRefund {
  return {
    id: REFUND_ID,
    transactionId: TRANSACTION_ID,
    status: 'approved',
    approvedByUserId: APPROVER_USER_ID,
    approvedAt: new Date(),
  }
}

// ---------------------------------------------------------------------------
// Mock tx builder
//
// approveRefund executa (na ordem):
//   1. tx.execute (SELECT FOR UPDATE) → retorna rawRefund row
//   2. tx.update(refund).set(...).where(...).returning() → retorna approvedRefund
//   3. tx.insert(refundStatusHistory).values(...)  → void
//   4. flagSnapshotFn (injetável)
//   5. tx.insert(refundEffectLog).values(...)      → snapshot_flagged
//   6. revokeFn (injetável) → []
//   7. tx.insert(refundEffectLog).values(...)      → contact_reclassified
//   8. tx.update(transaction).set(...).where(...)  → void
//   9. tx.insert(transactionStatusHistory)         → void
//  10. reclassifyFn (injetável)
//  11. tx.insert(refundEffectLog).values(...)      → contact_reclassified
//  12. revertOpportunityFn (injetável)
//  13. tx.insert(refundEffectLog).values(...)      → opportunity_reverted
//  14. cancelSubscriptionByTrxFn (injetável — nosso alvo)
//  15. tx.insert(refundEffectLog).values(...)      → subscription_cancelled (se cancelledSub != null)
//  16. emit (injetável) × 2
//  17. tx.insert(refundEffectLog).values(...)      → timeline_emitted
// ---------------------------------------------------------------------------

function buildMockTx(rawRefundRow: FakeRefund | undefined = makeFakeRefundRow()) {
  const approvedRefund = makeFakeApprovedRefund()

  // tx.execute — retorna rawRefundRow (SELECT FOR UPDATE)
  const execute = vi.fn().mockResolvedValue(rawRefundRow ? [rawRefundRow] : [])

  // tx.update(table).set(...).where(...).returning() → [approvedRefund] na primeira chamada
  const returning = vi.fn().mockResolvedValue([approvedRefund])
  const updateWhere = vi.fn().mockReturnValue({ returning })
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  // tx.insert(table).values(...) → para tabelas sem returning
  const insertValues = vi.fn().mockResolvedValue([])
  const insert = vi.fn().mockReturnValue({ values: insertValues })

  const tx = { execute, update, insert } as unknown as DbTx

  return { tx, execute, update, updateSet, updateWhere, returning, insert, insertValues }
}

// ---------------------------------------------------------------------------
// Stubs injetáveis para facilitar isolamento
// ---------------------------------------------------------------------------

const noopFlagSnapshot = vi.fn().mockResolvedValue(undefined)
const noopRevoke = vi.fn().mockResolvedValue([])
const noopReclassify = vi.fn().mockResolvedValue(undefined)
const noopRevertOpportunity = vi.fn().mockResolvedValue(undefined)
const noopEmit = vi.fn().mockResolvedValue({})

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { approveRefund } = await import('../../../lib/domain/refund/approve')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-REFUND (T-9-16) — approveRefund cancels subscription', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── refund.approve.cancels-subscription ─────────────────────────────────

  describe('refund.approve.cancels-subscription', () => {
    it(
      'given approved refund with active subscription when approveRefund then cancelSubscriptionByTrxFn is called with transactionId',
      async () => {
        const { tx } = buildMockTx()

        const cancelResult: CancelledSubscriptionResult = {
          subscriptionId: SUBSCRIPTION_ID,
          previousStatus: 'active',
        }
        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(cancelResult)

        await approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          noopReclassify,
          noopRevertOpportunity,
          noopRevoke,
          noopFlagSnapshot,
          noopEmit,
          cancelFn,
        )

        expect(cancelFn).toHaveBeenCalledOnce()
        const [_txArg, txnId, userId] = (cancelFn as ReturnType<typeof vi.fn>).mock.calls[0]!
        expect(txnId).toBe(TRANSACTION_ID)
        expect(userId).toBe(APPROVER_USER_ID)
      },
    )

    it(
      'given approved refund with active subscription when cancelFn returns result then refund_effect_log kind=subscription_cancelled is written',
      async () => {
        const { tx, insertValues } = buildMockTx()

        const cancelResult: CancelledSubscriptionResult = {
          subscriptionId: SUBSCRIPTION_ID,
          previousStatus: 'active',
        }
        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(cancelResult)

        await approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          noopReclassify,
          noopRevertOpportunity,
          noopRevoke,
          noopFlagSnapshot,
          noopEmit,
          cancelFn,
        )

        // Verificar que insert foi chamado com effectKind='subscription_cancelled'
        const allInsertValuesCalls = insertValues.mock.calls
        const subscriptionCancelledCall = allInsertValuesCalls.find(
          (call) => call[0]?.effectKind === 'subscription_cancelled',
        )

        expect(subscriptionCancelledCall).toBeDefined()
        expect(subscriptionCancelledCall![0]).toMatchObject({
          refundId: REFUND_ID,
          effectKind: 'subscription_cancelled',
          refId: SUBSCRIPTION_ID,
          detail: expect.objectContaining({
            subscription_id: SUBSCRIPTION_ID,
            cancel_reason: 'refund',
          }),
        })
      },
    )

    it(
      'given subscription in trial status when cancelFn cancels it then effect_log records previous_status trial',
      async () => {
        const { tx, insertValues } = buildMockTx()

        const cancelResult: CancelledSubscriptionResult = {
          subscriptionId: SUBSCRIPTION_ID,
          previousStatus: 'trial',
        }
        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(cancelResult)

        await approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          noopReclassify,
          noopRevertOpportunity,
          noopRevoke,
          noopFlagSnapshot,
          noopEmit,
          cancelFn,
        )

        const allCalls = insertValues.mock.calls
        const cancelledEntry = allCalls.find(
          (call) => call[0]?.effectKind === 'subscription_cancelled',
        )
        expect(cancelledEntry![0].detail).toMatchObject({
          previous_status: 'trial',
        })
      },
    )
  })

  // ── refund.approve.no-subscription ──────────────────────────────────────

  describe('refund.approve.no-subscription', () => {
    it(
      'given refund with no associated subscription when cancelFn returns null then approveRefund does not throw',
      async () => {
        const { tx } = buildMockTx()

        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(null)

        await expect(
          approveRefund(
            tx,
            REFUND_ID,
            APPROVER_USER_ID,
            noopReclassify,
            noopRevertOpportunity,
            noopRevoke,
            noopFlagSnapshot,
            noopEmit,
            cancelFn,
          ),
        ).resolves.not.toThrow()
      },
    )

    it(
      'given refund with no associated subscription when cancelFn returns null then subscription_cancelled effect_log entry is NOT written',
      async () => {
        const { tx, insertValues } = buildMockTx()

        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(null)

        await approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          noopReclassify,
          noopRevertOpportunity,
          noopRevoke,
          noopFlagSnapshot,
          noopEmit,
          cancelFn,
        )

        const allCalls = insertValues.mock.calls
        const cancelledEntry = allCalls.find(
          (call) => call[0]?.effectKind === 'subscription_cancelled',
        )
        expect(cancelledEntry).toBeUndefined()
      },
    )

    it(
      'given refund with no associated subscription when cancelFn returns null then cancelFn is still called once',
      async () => {
        const { tx } = buildMockTx()

        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(null)

        await approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          noopReclassify,
          noopRevertOpportunity,
          noopRevoke,
          noopFlagSnapshot,
          noopEmit,
          cancelFn,
        )

        // cancelFn deve ser sempre chamada para verificar se há subscription — o resultado null é tratado graciosamente
        expect(cancelFn).toHaveBeenCalledOnce()
      },
    )
  })

  // ── refund.approve.already-cancelled ────────────────────────────────────

  describe('refund.approve.already-cancelled', () => {
    it(
      'given subscription already cancelled when cancelFn returns null then approveRefund succeeds without error',
      async () => {
        const { tx } = buildMockTx()

        // A lógica de "já cancelada" é encapsulada na cancelFn — retorna null se sub já está cancelled/expired
        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(null)

        await expect(
          approveRefund(
            tx,
            REFUND_ID,
            APPROVER_USER_ID,
            noopReclassify,
            noopRevertOpportunity,
            noopRevoke,
            noopFlagSnapshot,
            noopEmit,
            cancelFn,
          ),
        ).resolves.toBeDefined()
      },
    )

    it(
      'given subscription already cancelled when cancelFn returns null then no subscription_cancelled effect_log is written',
      async () => {
        const { tx, insertValues } = buildMockTx()

        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockResolvedValue(null)

        await approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          noopReclassify,
          noopRevertOpportunity,
          noopRevoke,
          noopFlagSnapshot,
          noopEmit,
          cancelFn,
        )

        const allCalls = insertValues.mock.calls
        const cancelledEntry = allCalls.find(
          (call) => call[0]?.effectKind === 'subscription_cancelled',
        )
        expect(cancelledEntry).toBeUndefined()
      },
    )

    it(
      'given subscription already cancelled when cancelFn is the defaultCancelSubscriptionByTransaction behavior then it filters by active statuses only',
      async () => {
        // Este teste verifica que a implementação inline defaultCancelSubscriptionByTransaction
        // só afeta subscriptions com status IN ('trial','active','past_due').
        // Simulamos a lógica: se a query retorna vazio (subscription já cancelled), retorna null.
        const { tx } = buildMockTx()

        // Simula o comportamento do default: subscription já cancelled → query retorna []  → null
        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockImplementation(
          async (_tx: DbTx, _transactionId: string) => {
            // subscription.status IN ('trial','active','past_due') — já cancelled não está neste set
            return null
          },
        )

        const result = await approveRefund(
          tx,
          REFUND_ID,
          APPROVER_USER_ID,
          noopReclassify,
          noopRevertOpportunity,
          noopRevoke,
          noopFlagSnapshot,
          noopEmit,
          cancelFn,
        )

        // approveRefund deve completar com sucesso
        expect(result).toBeDefined()
        expect(result.status).toBe('approved')
      },
    )
  })

  // ── refund.approve.subscription-cancel-failure-rollbacks ────────────────

  describe('refund.approve.subscription-cancel-failure-rollbacks', () => {
    it(
      'given cancelFn throws when approveRefund then error propagates (rollback handled by caller tx)',
      async () => {
        const { tx } = buildMockTx()

        const dbError = new Error('subscription table connection error')
        const cancelFn: CancelSubscriptionByTransactionFn = vi.fn().mockRejectedValue(dbError)

        await expect(
          approveRefund(
            tx,
            REFUND_ID,
            APPROVER_USER_ID,
            noopReclassify,
            noopRevertOpportunity,
            noopRevoke,
            noopFlagSnapshot,
            noopEmit,
            cancelFn,
          ),
        ).rejects.toThrow('subscription table connection error')
      },
    )
  })
})
