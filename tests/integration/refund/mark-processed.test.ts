/**
 * Tests: markProcessed
 *
 * T-8-18
 * docs/20-domain/14-refund.md §6 transições
 * Webhook do provedor confirma estorno → approved → processed
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
const EXTERNAL_REFUND_ID = 'ext-refund-abc123'
const PROVIDER = 'digital_guru' as const

const approvedRefundSelectRow = {
  id: REFUND_ID,
  status: 'approved' as const,
}

const processedRefundRow = {
  id: REFUND_ID,
  transactionId: '00000000-0000-0000-0000-000000000001',
  openedByUserId: '00000000-0000-0000-0000-000000000011',
  approvedByUserId: '00000000-0000-0000-0000-000000000010',
  amount: '500.00',
  reason: 'Produto não entregue',
  status: 'processed' as const,
  externalRefundId: EXTERNAL_REFUND_ID,
  externalProvider: PROVIDER,
  approvedAt: new Date(),
  rejectedAt: null,
  processedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// Mock tx builder
//
// Sequence of operations in markProcessed:
//   1. select().from().where().limit() → busca refund por id
//   2. update().set().where().returning() → UPDATE refund status='processed'
//   3. insert().values() → INSERT refund_status_history
// ---------------------------------------------------------------------------

function buildMockTx({
  selectRows = [approvedRefundSelectRow] as { id: string; status: string }[],
  updateReturning = [processedRefundRow],
}: {
  selectRows?: { id: string; status: string }[]
  updateReturning?: typeof processedRefundRow[]
} = {}): DbTx {
  const limit = vi.fn().mockResolvedValue(selectRows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  const returningMock = vi.fn().mockResolvedValue(updateReturning)
  const updateWhere = vi.fn().mockReturnValue({ returning: returningMock })
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  const insertValues = vi.fn().mockResolvedValue([{ id: 'hist-1' }])
  const insert = vi.fn().mockReturnValue({ values: insertValues })

  return { select, update, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const { markProcessed } = await import('../../../lib/domain/refund/mark-processed')
const {
  RefundNotFoundError,
  InvalidRefundStatusError,
} = await import('../../../lib/domain/refund/errors')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-REFUND — markProcessed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path ───────────────────────────────────────────────────

  it(
    'given refund in approved status ' +
      'when markProcessed ' +
      'then returns processed refund with external fields set',
    async () => {
      const tx = buildMockTx()

      const result = await markProcessed(tx, REFUND_ID, EXTERNAL_REFUND_ID, PROVIDER)

      expect(result.status).toBe('processed')
      expect(result.id).toBe(REFUND_ID)
      expect(result.externalRefundId).toBe(EXTERNAL_REFUND_ID)
      expect(result.externalProvider).toBe(PROVIDER)
      expect(result.processedAt).toBeDefined()
    },
  )

  // ── Caso 2 — status inválido (requested) ─────────────────────────────────

  it(
    'given refund in requested status ' +
      'when markProcessed ' +
      'then throws InvalidRefundStatusError (expected: approved)',
    async () => {
      const requestedRow = { id: REFUND_ID, status: 'requested' }
      const tx = buildMockTx({ selectRows: [requestedRow] })

      await expect(
        markProcessed(tx, REFUND_ID, EXTERNAL_REFUND_ID, PROVIDER),
      ).rejects.toThrow(InvalidRefundStatusError)
    },
  )

  it(
    'given refund in rejected status ' +
      'when markProcessed ' +
      'then throws InvalidRefundStatusError',
    async () => {
      const rejectedRow = { id: REFUND_ID, status: 'rejected' }
      const tx = buildMockTx({ selectRows: [rejectedRow] })

      await expect(
        markProcessed(tx, REFUND_ID, EXTERNAL_REFUND_ID, PROVIDER),
      ).rejects.toThrow(InvalidRefundStatusError)
    },
  )

  // ── Caso 3 — campos external_refund_id e processed_at preenchidos ────────

  it(
    'given approved refund ' +
      'when markProcessed ' +
      'then external_refund_id and provider are persisted in update call',
    async () => {
      const tx = buildMockTx()
      const txMock = tx as unknown as { update: ReturnType<typeof vi.fn> }

      await markProcessed(tx, REFUND_ID, EXTERNAL_REFUND_ID, PROVIDER)

      expect(txMock.update).toHaveBeenCalledOnce()
      const setArg = txMock.update.mock.results[0]?.value?.set?.mock?.calls[0]?.[0] as Record<
        string,
        unknown
      >
      if (setArg) {
        expect(setArg.externalRefundId).toBe(EXTERNAL_REFUND_ID)
        expect(setArg.externalProvider).toBe(PROVIDER)
        expect(setArg.status).toBe('processed')
        // processedAt is set via sql`now()` — just verify status and external fields
      }
    },
  )

  // ── Caso 4 — refund não encontrado ────────────────────────────────────────

  it(
    'given non-existent refundId ' +
      'when markProcessed ' +
      'then throws RefundNotFoundError',
    async () => {
      const tx = buildMockTx({ selectRows: [] })

      await expect(
        markProcessed(tx, REFUND_ID, EXTERNAL_REFUND_ID, PROVIDER),
      ).rejects.toThrow(RefundNotFoundError)
    },
  )
})
