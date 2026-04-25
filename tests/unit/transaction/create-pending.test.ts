/**
 * Unit tests — createPendingTransaction
 *
 * T-8-12
 * BR-OFFER-UNIQUENESS: verifica que segunda compra approved é bloqueada
 * docs/20-domain/11-transaction-snapshot.md §2, §6
 * ADR-10: funções lançam DomainError
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRX_ID = '00000000-0000-0000-0000-000000000001'
const CONTACT_ID = 'c1-uuid-0000-0000-0000-000000000001'
const BRAND_ID = 'b1-uuid-0000-0000-0000-000000000001'
const OFFER_ID = 'o1-uuid-0000-0000-0000-000000000001'
const CONDITION_ID = 'cd-uuid-0000-0000-0000-000000000001'
const PAYMENT_OPTION_ID = 'po-uuid-0000-0000-0000-000000000001'

const pendingTrx = {
  id: TRX_ID,
  contactId: CONTACT_ID,
  brandId: BRAND_ID,
  offerId: OFFER_ID,
  offerConditionId: CONDITION_ID,
  offerPaymentOptionId: PAYMENT_OPTION_ID,
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
}

const baseInput = {
  contactId: CONTACT_ID,
  brandId: BRAND_ID,
  offerId: OFFER_ID,
  offerConditionId: CONDITION_ID,
  offerPaymentOptionId: PAYMENT_OPTION_ID,
  amount: '1500.00',
}

// ---------------------------------------------------------------------------
// Mock de tx: DbTx
//
// select → from → where → limit  (retorna rows da lookup de uniqueness)
// insert → values → returning      (retorna a transação criada)
// ---------------------------------------------------------------------------

function buildMockTx({
  uniquenessRows = [] as { id: string }[],
  insertRows = [pendingTrx] as typeof pendingTrx[],
} = {}): DbTx {
  const limit = vi.fn().mockResolvedValue(uniquenessRows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  const returning = vi.fn().mockResolvedValue(insertRows)
  const values = vi.fn().mockReturnValue({ returning })
  const insert = vi.fn().mockReturnValue({ values })

  return { select, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// Import AFTER fixtures to allow dynamic mock setup in each test
const { createPendingTransaction } = await import(
  '../../../lib/domain/transaction/create-pending'
)
const { DuplicateOfferPurchaseError } = await import(
  '../../../lib/domain/transaction/errors'
)

describe('BR-OFFER-UNIQUENESS — createPendingTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path ─────────────────────────────────────────────────

  it(
    'given no existing approved transaction for contact+offer ' +
      'when createPendingTransaction ' +
      'then creates transaction with status pending',
    async () => {
      const tx = buildMockTx({ uniquenessRows: [], insertRows: [pendingTrx] })

      const result = await createPendingTransaction(tx, baseInput)

      expect(result.status).toBe('pending')
      expect(result.id).toBe(TRX_ID)
      expect(result.contactId).toBe(CONTACT_ID)
      expect(result.offerId).toBe(OFFER_ID)
    },
  )

  // ── Caso 2 — ConflictError por BR-OFFER-UNIQUENESS ───────────────────────

  it(
    'given existing approved transaction for same contact+offer ' +
      'when createPendingTransaction ' +
      'then throws DuplicateOfferPurchaseError',
    async () => {
      const tx = buildMockTx({
        uniquenessRows: [{ id: 'existing-approved-trx' }],
      })

      await expect(createPendingTransaction(tx, baseInput)).rejects.toThrow(
        DuplicateOfferPurchaseError,
      )
    },
  )

  // ── Caso 3 — error message contém contactId e offerId ───────────────────

  it(
    'given existing approved transaction ' +
      'when createPendingTransaction ' +
      'then error message references contactId and offerId',
    async () => {
      const tx = buildMockTx({
        uniquenessRows: [{ id: 'existing-approved-trx' }],
      })

      await expect(createPendingTransaction(tx, baseInput)).rejects.toThrow(
        CONTACT_ID,
      )
      // Reset for second assertion
      const tx2 = buildMockTx({
        uniquenessRows: [{ id: 'existing-approved-trx' }],
      })
      await expect(createPendingTransaction(tx2, baseInput)).rejects.toThrow(
        OFFER_ID,
      )
    },
  )

  // ── Caso 4 — INSERT não é chamado quando uniqueness falha ────────────────

  it(
    'given existing approved transaction ' +
      'when createPendingTransaction ' +
      'then DB insert is never called',
    async () => {
      const tx = buildMockTx({
        uniquenessRows: [{ id: 'existing-approved-trx' }],
      })

      await expect(createPendingTransaction(tx, baseInput)).rejects.toThrow()

      // insert should not be called when uniqueness check fails
      expect((tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled()
    },
  )
})
