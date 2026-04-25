/**
 * Unit tests — flagSnapshotRefunded
 *
 * T-8-12
 * BR-SNAPSHOT-IMMUTABILITY: payload nunca é modificado
 * docs/20-domain/11-transaction-snapshot.md §2, §3.3, §6
 * ADR-10: funções lançam DomainError
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SNAPSHOT_ID = '00000000-0000-0000-0000-000000000003'
const REFUND_ID = '00000000-0000-0000-0000-000000000004'

const existingSnapshot = { id: SNAPSHOT_ID }

// ---------------------------------------------------------------------------
// Mock tx builder
//
// Sequence of operations in flagSnapshotRefunded:
//   1. select().from().where().limit()  → check snapshot exists
//   2. insert().values()                 → insert flag_history row
// ---------------------------------------------------------------------------

function buildMockTx({
  snapshotRows = [existingSnapshot] as { id: string }[],
  flagHistoryInsertRows = [{ id: 'flag-hist-id' }] as { id: string }[],
} = {}): DbTx {
  const limit = vi.fn().mockResolvedValue(snapshotRows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  const values = vi.fn().mockResolvedValue(flagHistoryInsertRows)
  const insert = vi.fn().mockReturnValue({ values })

  return { select, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const { flagSnapshotRefunded } = await import(
  '../../../lib/domain/transaction/flag-snapshot'
)
const { SnapshotNotFoundError } = await import(
  '../../../lib/domain/transaction/errors'
)

describe('BR-SNAPSHOT-IMMUTABILITY — flagSnapshotRefunded', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path: insere em flag_history ──────────────────────────

  it(
    'given existing snapshot ' +
      'when flagSnapshotRefunded ' +
      'then inserts row in transaction_snapshot_flag_history',
    async () => {
      const tx = buildMockTx()

      await flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)

      const txMock = tx as unknown as { insert: ReturnType<typeof vi.fn> }
      expect(txMock.insert).toHaveBeenCalledOnce()

      const insertCall = txMock.insert.mock.calls[0]
      // First arg to insert() is the table — just verify insert was called
      expect(insertCall).toBeDefined()

      // values() should have been called with the correct flag data
      const mockInsertReturn = txMock.insert.mock.results[0]
      const valuesCall = mockInsertReturn?.value?.values?.mock?.calls[0]?.[0]
      if (valuesCall) {
        expect(valuesCall.snapshotId).toBe(SNAPSHOT_ID)
        expect(valuesCall.toFlag).toBe('refunded')
        expect(valuesCall.causedByRefundId).toBe(REFUND_ID)
      }
    },
  )

  // ── Caso 2 — BR-SNAPSHOT-IMMUTABILITY: não toca payload ─────────────────

  it(
    'given existing snapshot ' +
      'when flagSnapshotRefunded ' +
      'then never calls update on transaction_snapshot (payload remains untouched)',
    async () => {
      const tx = buildMockTx()

      await flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)

      // update should NEVER be called — BR-SNAPSHOT-IMMUTABILITY forbids it
      expect((tx as unknown as { update?: ReturnType<typeof vi.fn> }).update).toBeUndefined()
    },
  )

  // ── Caso 3 — SnapshotNotFoundError quando snapshot não existe ────────────

  it(
    'given non-existent snapshotId ' +
      'when flagSnapshotRefunded ' +
      'then throws SnapshotNotFoundError',
    async () => {
      const tx = buildMockTx({ snapshotRows: [] })

      await expect(flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)).rejects.toThrow(
        SnapshotNotFoundError,
      )
    },
  )

  // ── Caso 4 — INSERT não é chamado quando snapshot não existe ─────────────

  it(
    'given non-existent snapshotId ' +
      'when flagSnapshotRefunded ' +
      'then flag_history insert is never called',
    async () => {
      const tx = buildMockTx({ snapshotRows: [] })

      await expect(flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)).rejects.toThrow()

      expect((tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert).not.toHaveBeenCalled()
    },
  )

  // ── Caso 5 — returns void on success ────────────────────────────────────

  it(
    'given existing snapshot ' +
      'when flagSnapshotRefunded ' +
      'then returns void (no value)',
    async () => {
      const tx = buildMockTx()

      const result = await flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)

      expect(result).toBeUndefined()
    },
  )

  // ── Caso 6 — error message contains snapshotId ──────────────────────────

  it(
    'given non-existent snapshotId ' +
      'when flagSnapshotRefunded ' +
      'then error message references snapshotId',
    async () => {
      const tx = buildMockTx({ snapshotRows: [] })

      await expect(flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)).rejects.toThrow(
        SNAPSHOT_ID,
      )
    },
  )
})
