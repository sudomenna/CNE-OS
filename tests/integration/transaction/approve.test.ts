/**
 * Tests: approveTransaction
 *
 * T-8-11
 * docs/20-domain/11-transaction-snapshot.md §10 (fluxo FLOW-05)
 * BR-OFFER-UNIQUENESS: segunda aprovação para mesmo contact+offer é rejeitada
 * BR-SNAPSHOT-IMMUTABILITY: INSERT snapshot, nunca UPDATE
 *
 * Mock de tx: DbTx — sem DB real.
 * Cobre todos os ramos da BR + rollback implícito (falha antes do UPDATE não chama UPDATE).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import {
  approveTransaction,
  TransactionAlreadyApprovedError,
  InvalidTransactionStatusError,
} from '@/lib/domain/transaction/approve'
import { DuplicateOfferPurchaseError } from '@/lib/domain/transaction/errors'
import type { GrantFn, ReclassifyFn, MarkWonFn } from '@/lib/domain/transaction/approve'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRANSACTION_ID = '00000000-0000-0000-0000-000000000001'
const CONTACT_ID = '00000000-0000-0000-0000-000000000002'
const BRAND_ID = '00000000-0000-0000-0000-000000000003'
const OFFER_ID = '00000000-0000-0000-0000-000000000004'
const OFFER_CONDITION_ID = '00000000-0000-0000-0000-000000000005'
const OFFER_PAYMENT_OPTION_ID = '00000000-0000-0000-0000-000000000006'
const SNAPSHOT_ID = '00000000-0000-0000-0000-000000000010'
const LEGAL_ENTITY_ID = '00000000-0000-0000-0000-000000000020'
const BRAND_SLUG = 'cne'

// ---------------------------------------------------------------------------
// Raw row returned by FOR UPDATE execute()
// ---------------------------------------------------------------------------

function makeRawTrxRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: TRANSACTION_ID,
    contact_id: CONTACT_ID,
    brand_id: BRAND_ID,
    offer_id: OFFER_ID,
    offer_condition_id: OFFER_CONDITION_ID,
    offer_payment_option_id: OFFER_PAYMENT_OPTION_ID,
    status: 'pending',
    amount: '1500.00',
    currency: 'BRL',
    external_provider: null,
    external_id: null,
    snapshot_id: null,
    approved_at: null,
    refused_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Minimal snapshot payload (enough for composeSnapshot mock to return)
// ---------------------------------------------------------------------------

function makeSnapshotPayload() {
  return {
    version: 1,
    captured_at: new Date().toISOString(),
    brand: { id: BRAND_ID, name: 'CNE', slug: BRAND_SLUG },
    legal_entity: { id: LEGAL_ENTITY_ID, cnpj: '00000000000100', company_name: 'CNE Educacao' },
    offer: { id: OFFER_ID, name: 'Oferta Teste', slug: 'oferta-teste', type: 'regular' },
    condition: {
      id: OFFER_CONDITION_ID,
      name: 'Condição Padrão',
      priority: 0,
      advantage_score: 0,
      is_default: true,
      is_public: true,
    },
    rules: { group_id: '', operator: 'and', children: [], evaluation: 'fallback_default', context_snapshot: {} },
    items: [
      {
        condition_item_id: '00000000-0000-0000-0000-000000000030',
        kind: 'main' as const,
        product: { id: '00000000-0000-0000-0000-000000000031', name: 'Produto', slug: 'produto', kind: 'course' },
        quantity: 1,
        access_rule: {},
        vigency_months: 12,
        discount: null,
        responsible_user_id: null,
      },
    ],
    payment_option: { id: OFFER_PAYMENT_OPTION_ID, method: 'pix', price: 1500, installments: null, custom_config: {} },
    source: {} as { provider?: string; external_id?: string; raw_event_id?: string },
  }
}

// ---------------------------------------------------------------------------
// Helpers to build a mock tx
// ---------------------------------------------------------------------------

type BuildTxOptions = {
  /** Raw row returned by FOR UPDATE (passo 1) */
  forUpdateRow?: Record<string, unknown> | null
  /** Rows returned by BR-OFFER-UNIQUENESS check (select approved, ne id) */
  existingApprovedRows?: { id: string }[]
  /** Row returned by the offer_sales_counter UPDATE (incrementSalesCounter) */
  salesCounterRow?: { approvedCount: number } | null
  /** Snapshot payload returned by composeSnapshot mocked calls */
  snapshotPayload?: Record<string, unknown>
  /** Rows returned by snapshot INSERT */
  snapshotInsertRows?: { id: string; transactionId: string; flag: string; payload: unknown; createdAt: Date }[]
  /** Rows returned by transaction UPDATE (passo 8) */
  transactionUpdateRows?: Record<string, unknown>[]
}

// We mock `composeSnapshot`, `incrementSalesCounter` and `emitTimelineEvent` at
// the module level, and build a tx mock that covers:
//   execute()         → FOR UPDATE result
//   select()...       → BR-OFFER-UNIQUENESS check (select approved, ne id)
//   update()...       → incrementSalesCounter + transaction UPDATE
//   insert()...       → snapshot INSERT, item INSERT, status_history INSERT
//
// All DB interactions go through the tx mock.

function buildTxMock(opts: BuildTxOptions): {
  tx: DbTx
  executeMock: Mock
  selectMock: Mock
  insertMock: Mock
  updateMock: Mock
} {
  const executeMock = vi.fn()
  const selectMock = vi.fn()
  const insertMock = vi.fn()
  const updateMock = vi.fn()

  // execute() → FOR UPDATE
  executeMock.mockResolvedValue(
    opts.forUpdateRow != null ? [opts.forUpdateRow] : [],
  )

  // select() chain — covers:
  //   1st call: BR-OFFER-UNIQUENESS check (existingApproved)
  let selectCallCount = 0
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // BR-OFFER-UNIQUENESS check: existing approved with ne(id)
        return Promise.resolve(opts.existingApprovedRows ?? [])
      }
      // Subsequent selects (e.g., composeSnapshot internals — but those are mocked separately)
      return Promise.resolve([])
    }),
  }
  selectMock.mockReturnValue(selectChain)

  // update() chain — covers only:
  //   UPDATE transaction (status, snapshot_id, approved_at) at passo 8
  //
  // Note: incrementSalesCounter is mocked at module level (vi.mock), so it does NOT
  // call tx.update — it's a no-op mock returning directly. The only tx.update call
  // that reaches this mock is for the transaction UPDATE at passo 8.
  const updateReturningMock = vi.fn().mockImplementation(() => {
    return Promise.resolve(
      opts.transactionUpdateRows ?? [
        {
          id: TRANSACTION_ID,
          contactId: CONTACT_ID,
          brandId: BRAND_ID,
          offerId: OFFER_ID,
          offerConditionId: OFFER_CONDITION_ID,
          offerPaymentOptionId: OFFER_PAYMENT_OPTION_ID,
          status: 'approved',
          amount: '1500.00',
          currency: 'BRL',
          externalProvider: null,
          externalId: null,
          externalFee: null,
          snapshotId: SNAPSHOT_ID,
          approvedAt: new Date(),
          refusedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    )
  })

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: updateReturningMock,
  }
  updateMock.mockReturnValue(updateChain)

  // insert() chain — covers: snapshot, item(s), status_history
  let insertCallCount = 0
  const insertValuesReturningMock = vi.fn().mockImplementation(() => {
    return Promise.resolve(
      opts.snapshotInsertRows ?? [
        {
          id: SNAPSHOT_ID,
          transactionId: TRANSACTION_ID,
          flag: 'normal',
          payload: opts.snapshotPayload ?? makeSnapshotPayload(),
          createdAt: new Date(),
        },
      ],
    )
  })

  const insertChain = {
    values: vi.fn().mockImplementation(() => {
      insertCallCount++
      return {
        returning: insertValuesReturningMock,
      }
    }),
  }
  insertMock.mockReturnValue(insertChain)

  const tx = {
    execute: executeMock,
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  } as unknown as DbTx

  return { tx, executeMock, selectMock, insertMock, updateMock }
}

// ---------------------------------------------------------------------------
// Mock composeSnapshot at module level (it does many DB reads internally)
// We replace it with a simple mock that returns a fixed payload.
// ---------------------------------------------------------------------------

vi.mock('@/lib/domain/transaction/snapshot', () => ({
  composeSnapshot: vi.fn(),
}))

vi.mock('@/lib/domain/offer/sales-counter', () => ({
  incrementSalesCounter: vi.fn(),
}))

vi.mock('@/lib/timeline/emit', () => ({
  emitTimelineEvent: vi.fn().mockResolvedValue({ id: 'te-1' }),
}))

import { composeSnapshot } from '@/lib/domain/transaction/snapshot'
import { incrementSalesCounter } from '@/lib/domain/offer/sales-counter'
import { emitTimelineEvent } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('approveTransaction', () => {
  let mockGrant: Mock & GrantFn
  let mockReclassify: Mock & ReclassifyFn
  let mockMarkWon: Mock & MarkWonFn

  beforeEach(() => {
    vi.clearAllMocks()

    mockGrant = vi.fn().mockResolvedValue([]) as Mock & GrantFn
    mockReclassify = vi.fn().mockResolvedValue(undefined) as Mock & ReclassifyFn
    mockMarkWon = vi.fn().mockResolvedValue(undefined) as Mock & MarkWonFn

    // Default: composeSnapshot returns a valid payload
    ;(composeSnapshot as Mock).mockResolvedValue(makeSnapshotPayload())

    // Default: incrementSalesCounter returns 1
    ;(incrementSalesCounter as Mock).mockResolvedValue(1)
  })

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('BR-APPROVE — happy path', () => {
    it('given pending transaction when approve then returns approved transaction with all 12 steps called', async () => {
      // Given
      const { tx, updateMock, insertMock } = buildTxMock({
        forUpdateRow: makeRawTrxRow({ status: 'pending' }),
        existingApprovedRows: [],
      })

      // When
      const result = await approveTransaction(
        tx,
        TRANSACTION_ID,
        undefined,
        mockGrant,
        mockReclassify,
        mockMarkWon,
      )

      // Then — returned transaction is approved
      expect(result.status).toBe('approved')
      expect(result.snapshotId).toBe(SNAPSHOT_ID)

      // Step 4: incrementSalesCounter called with correct offerId
      expect(incrementSalesCounter).toHaveBeenCalledWith(tx, OFFER_ID)

      // Step 5: composeSnapshot called
      expect(composeSnapshot).toHaveBeenCalledWith(tx, TRANSACTION_ID)

      // Step 6: INSERT transaction_snapshot called
      expect(insertMock).toHaveBeenCalled()

      // Step 8: UPDATE transaction called
      expect(updateMock).toHaveBeenCalled()

      // Step 10: grantFromTransaction called
      expect(mockGrant).toHaveBeenCalledWith(tx, TRANSACTION_ID)

      // Step 11: reclassifyContact called with contactId
      expect(mockReclassify).toHaveBeenCalledWith(tx, CONTACT_ID)

      // Step 12: markWon called with contactId + transactionId
      expect(mockMarkWon).toHaveBeenCalledWith(tx, CONTACT_ID, TRANSACTION_ID)

      // Step 13: TE-SALE-APPROVED emitted
      expect(emitTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'sale_approved',
          source: 'MOD-TRANSACTION',
          contactId: CONTACT_ID,
          payload: expect.objectContaining({
            transaction_id: TRANSACTION_ID,
            offer_id: OFFER_ID,
            snapshot_id: SNAPSHOT_ID,
          }),
        }),
        tx,
      )
    })
  })

  // -------------------------------------------------------------------------
  // Rollback: falha no passo 6 (INSERT snapshot) — UPDATE transaction não deve ser chamado
  // -------------------------------------------------------------------------

  describe('BR-ROLLBACK — falha no INSERT snapshot não chama UPDATE transaction', () => {
    it('given pending transaction when INSERT snapshot fails then UPDATE transaction is not called', async () => {
      // Given
      const executeMock = vi.fn().mockResolvedValue([makeRawTrxRow({ status: 'pending' })])
      const selectMock = vi.fn()
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]), // no existing approved
      }
      selectMock.mockReturnValue(selectChain)

      // incrementSalesCounter is mocked at module level — tx.update is only called
      // for the transaction UPDATE at passo 8. Since the snapshot INSERT fails BEFORE
      // that UPDATE, the updateMock.returning should NEVER be called.
      const updateReturningMock = vi.fn().mockResolvedValue([
        {
          id: TRANSACTION_ID,
          status: 'approved',
          snapshotId: SNAPSHOT_ID,
          contactId: CONTACT_ID,
          brandId: BRAND_ID,
          offerId: OFFER_ID,
          offerConditionId: OFFER_CONDITION_ID,
          offerPaymentOptionId: OFFER_PAYMENT_OPTION_ID,
          amount: '1500.00',
          currency: 'BRL',
          externalProvider: null,
          externalId: null,
          externalFee: null,
          approvedAt: new Date(),
          refusedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])

      const updateMock = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: updateReturningMock,
      })

      // INSERT snapshot throws — simulates DB error at passo 6
      const insertMock = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(new Error('DB error: snapshot insert failed')),
        }),
      })

      const tx = { execute: executeMock, select: selectMock, insert: insertMock, update: updateMock } as unknown as DbTx

      // When / Then
      await expect(
        approveTransaction(tx, TRANSACTION_ID, undefined, mockGrant, mockReclassify, mockMarkWon),
      ).rejects.toThrow('DB error: snapshot insert failed')

      // UPDATE transaction should NOT have been called (failure happened at passo 6, before passo 8)
      expect(updateReturningMock).not.toHaveBeenCalled()
      expect(mockGrant).not.toHaveBeenCalled()
      expect(mockMarkWon).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Idempotência: transação já approved → lança TransactionAlreadyApprovedError
  // -------------------------------------------------------------------------

  describe('BR-IDEMPOTENCY — transação já aprovada', () => {
    it('given already approved transaction when approve then throws TransactionAlreadyApprovedError', async () => {
      // Given
      const { tx } = buildTxMock({
        forUpdateRow: makeRawTrxRow({ status: 'approved', snapshot_id: SNAPSHOT_ID }),
      })

      // When / Then
      await expect(
        approveTransaction(tx, TRANSACTION_ID, undefined, mockGrant, mockReclassify, mockMarkWon),
      ).rejects.toThrow(TransactionAlreadyApprovedError)

      // Side effects: none
      expect(incrementSalesCounter).not.toHaveBeenCalled()
      expect(composeSnapshot).not.toHaveBeenCalled()
      expect(mockGrant).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Status inválido: transação em refused → lança InvalidTransactionStatusError
  // -------------------------------------------------------------------------

  describe('BR-STATUS — transação em status inválido', () => {
    it('given refused transaction when approve then throws InvalidTransactionStatusError', async () => {
      // Given
      const { tx } = buildTxMock({
        forUpdateRow: makeRawTrxRow({ status: 'refused' }),
      })

      // When / Then
      await expect(
        approveTransaction(tx, TRANSACTION_ID, undefined, mockGrant, mockReclassify, mockMarkWon),
      ).rejects.toThrow(InvalidTransactionStatusError)

      expect(composeSnapshot).not.toHaveBeenCalled()
    })

    it('given cancelled transaction when approve then throws InvalidTransactionStatusError', async () => {
      const { tx } = buildTxMock({
        forUpdateRow: makeRawTrxRow({ status: 'cancelled' }),
      })

      await expect(
        approveTransaction(tx, TRANSACTION_ID, undefined, mockGrant, mockReclassify, mockMarkWon),
      ).rejects.toThrow(InvalidTransactionStatusError)
    })
  })

  // -------------------------------------------------------------------------
  // BR-OFFER-UNIQUENESS: já existe approved para mesmo contact+offer
  // -------------------------------------------------------------------------

  describe('BR-OFFER-UNIQUENESS — contato já tem compra aprovada da mesma oferta', () => {
    it('given existing approved transaction for same contact+offer when approve then throws DuplicateOfferPurchaseError', async () => {
      // Given
      const { tx } = buildTxMock({
        forUpdateRow: makeRawTrxRow({ status: 'pending' }),
        existingApprovedRows: [{ id: '00000000-0000-0000-0000-000000000099' }], // outra transação approved
      })

      // When / Then
      await expect(
        approveTransaction(tx, TRANSACTION_ID, undefined, mockGrant, mockReclassify, mockMarkWon),
      ).rejects.toThrow(DuplicateOfferPurchaseError)

      // Steps 4+ should not be reached
      expect(incrementSalesCounter).not.toHaveBeenCalled()
      expect(composeSnapshot).not.toHaveBeenCalled()
      expect(mockGrant).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Transaction not found
  // -------------------------------------------------------------------------

  describe('BR-NOT-FOUND — transação não existe', () => {
    it('given non-existent transactionId when approve then throws TransactionNotFoundError', async () => {
      // Given
      const { tx } = buildTxMock({
        forUpdateRow: null, // FOR UPDATE returns empty
      })

      // When / Then
      const { TransactionNotFoundError } = await import('@/lib/domain/transaction/errors')
      await expect(
        approveTransaction(tx, TRANSACTION_ID, undefined, mockGrant, mockReclassify, mockMarkWon),
      ).rejects.toThrow(TransactionNotFoundError)
    })
  })

  // -------------------------------------------------------------------------
  // externalRef enriches source
  // -------------------------------------------------------------------------

  describe('BR-EXTERNAL-REF — externalRef popula payload source', () => {
    it('given externalRef when approve then composeSnapshot result is enriched with external_id', async () => {
      // Given
      const payload = makeSnapshotPayload()
      ;(composeSnapshot as Mock).mockResolvedValue(payload)

      const { tx } = buildTxMock({
        forUpdateRow: makeRawTrxRow({ status: 'pending' }),
        existingApprovedRows: [],
      })

      const EXTERNAL_REF = 'dg-sale-12345'

      // When
      await approveTransaction(
        tx,
        TRANSACTION_ID,
        EXTERNAL_REF,
        mockGrant,
        mockReclassify,
        mockMarkWon,
      )

      // Then — the enriched payload should have been passed to the snapshot INSERT
      expect(payload.source.external_id).toBe(EXTERNAL_REF)
    })
  })
})
