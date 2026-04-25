/**
 * Tests: INV-TRX-01 — transaction_snapshot imutabilidade
 *
 * T-8-26
 * docs/20-domain/11-transaction-snapshot.md §3.2 (trigger de imutabilidade)
 * BR-SNAPSHOT-IMMUTABILITY: transaction_snapshot é append-only.
 *   Após criação, nenhuma linha pode ser modificada ou deletada.
 *   Mudanças de flag são registradas em transaction_snapshot_flag_history (INSERT).
 *
 * INV-TRX-01: o código de domínio NUNCA chama tx.update(transactionSnapshot)
 *   nem tx.delete(transactionSnapshot). O trigger trg_transaction_snapshot_immutable
 *   bloquearia UPDATE/DELETE a nível de banco; aqui verificamos que o código
 *   de domínio nem tenta — garantindo imutabilidade em dois níveis.
 *
 * Mock de tx: DbTx — sem DB real.
 * Padrão: Given/When/Then
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SNAPSHOT_ID = '00000000-0000-0000-0000-000000000010'
const REFUND_ID = '00000000-0000-0000-0000-000000000020'

// ---------------------------------------------------------------------------
// Mock tx builder
//
// flagSnapshotRefunded:
//   1. select().from().where().limit()  → verifica existência do snapshot
//   2. insert().values()                → INSERT em transaction_snapshot_flag_history
//
// Expõe update e delete como spies para verificar que NUNCA são chamados.
// ---------------------------------------------------------------------------

function buildMockTx({
  snapshotExists = true,
}: {
  snapshotExists?: boolean
} = {}): DbTx & { update: Mock; delete: Mock; insert: Mock } {
  const snapshotRow = { id: SNAPSHOT_ID }

  const limit = vi.fn().mockResolvedValue(snapshotExists ? [snapshotRow] : [])
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  const values = vi.fn().mockResolvedValue([{ id: 'flag-hist-1' }])
  const insert = vi.fn().mockReturnValue({ values })

  // update e delete: nunca devem ser chamados — spy sem implementação
  const update = vi.fn()
  const deleteFn = vi.fn()

  return { select, insert, update, delete: deleteFn } as unknown as DbTx & {
    update: Mock
    delete: Mock
    insert: Mock
  }
}

// ---------------------------------------------------------------------------
// Import (dynamic — após definir vi antes de qualquer import estático)
// ---------------------------------------------------------------------------

const { flagSnapshotRefunded } = await import('../../../lib/domain/transaction/flag-snapshot')
const { SnapshotNotFoundError } = await import('../../../lib/domain/transaction/errors')

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('INV-TRX-01 — transaction_snapshot imutabilidade (BR-SNAPSHOT-IMMUTABILITY)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Teste 1 — UPDATE é recusado a nível de domínio ───────────────────────
  //
  // O código de domínio nunca deve chamar tx.update em transaction_snapshot.
  // A única escrita permitida é tx.insert em transaction_snapshot_flag_history.

  it(
    'given existing snapshot ' +
      'when flagSnapshotRefunded is called ' +
      'then tx.update is never called (INV-TRX-01: UPDATE bloqueado a nível de código)',
    async () => {
      const tx = buildMockTx({ snapshotExists: true })

      await flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)

      // UPDATE em transaction_snapshot NUNCA deve ser chamado
      expect(tx.update).not.toHaveBeenCalled()
    },
  )

  // ── Teste 2 — DELETE é recusado a nível de domínio ───────────────────────
  //
  // Nenhuma função de domínio de transaction_snapshot deve chamar tx.delete.

  it(
    'given existing snapshot ' +
      'when flagSnapshotRefunded is called ' +
      'then tx.delete is never called (INV-TRX-01: DELETE bloqueado a nível de código)',
    async () => {
      const tx = buildMockTx({ snapshotExists: true })

      await flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)

      // DELETE em transaction_snapshot NUNCA deve ser chamado
      expect(tx.delete).not.toHaveBeenCalled()
    },
  )

  // ── Teste 3 (bônus) — INSERT em flag_history com payload correto ─────────
  //
  // flagSnapshotRefunded deve chamar tx.insert().values() com os campos de
  // flag_history (snapshotId, toFlag='refunded', causedByRefundId) e NUNCA
  // chamar tx.update — verificando BR-SNAPSHOT-IMMUTABILITY em nível de código.

  it(
    'given existing snapshot and a refund approval ' +
      'when flagSnapshotRefunded is called ' +
      'then tx.insert is called once with flag_history payload (snapshotId + toFlag=refunded) ' +
      'and tx.update is never called (INV-TRX-01)',
    async () => {
      const tx = buildMockTx({ snapshotExists: true })

      await flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID)

      // INSERT deve ter sido chamado exatamente uma vez (flag_history)
      expect(tx.insert).toHaveBeenCalledOnce()

      // O payload passado a .values() deve conter os campos de flag_history
      const insertResult = (tx.insert as Mock).mock.results[0]
      const valuesCall = insertResult?.value?.values?.mock?.calls[0]?.[0] as Record<string, unknown> | undefined
      expect(valuesCall).toBeDefined()
      expect(valuesCall?.snapshotId).toBe(SNAPSHOT_ID)
      expect(valuesCall?.toFlag).toBe('refunded')
      expect(valuesCall?.causedByRefundId).toBe(REFUND_ID)

      // UPDATE em transaction_snapshot NUNCA deve ter sido chamado
      expect(tx.update).not.toHaveBeenCalled()
    },
  )

  // ── Teste 4 — SnapshotNotFoundError quando snapshot não existe ───────────
  //
  // Comportamento defensivo: se o snapshotId não existe no banco,
  // a função lança SnapshotNotFoundError antes de tentar qualquer escrita.

  it(
    'given non-existent snapshotId ' +
      'when flagSnapshotRefunded is called ' +
      'then throws SnapshotNotFoundError without calling tx.insert or tx.update',
    async () => {
      const tx = buildMockTx({ snapshotExists: false })

      await expect(
        flagSnapshotRefunded(tx, SNAPSHOT_ID, REFUND_ID),
      ).rejects.toThrow(SnapshotNotFoundError)

      // Nenhuma escrita deve ter ocorrido
      expect(tx.insert).not.toHaveBeenCalled()
      expect(tx.update).not.toHaveBeenCalled()
      expect(tx.delete).not.toHaveBeenCalled()
    },
  )
})
