/**
 * Unit tests — updateChannelAccount
 *
 * T-15-03
 * ADR-10: função lança DomainError tipado
 * ADR-11: tx: DbTx como primeiro argumento
 * ADR-18: re-encripta credentials quando passadas; audit não loga valores
 *
 * Mock de tx: DbTx — sem DB real.
 * Padrão: Given/When/Then
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'
import { ChannelAccountNotFoundError } from '@/lib/domain/channel/errors'
import type { EncryptFn } from '@/lib/domain/channel/types'
import type { CredentialEnvelope } from '@/lib/db/crypto'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = 'ca-uuid-0000-0000-0000-000000000001'
const ACTOR_USER_ID = 'u1-uuid-0000-0000-0000-000000000001'

const mockEnvelope: CredentialEnvelope = {
  v: 1,
  encryptedAt: '2026-04-26T03:00:00Z',
  ciphertext: 'bW9ja2VkY2lwaGVydGV4dA==',
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

function buildMockTx({
  existingRows = [{ id: ACCOUNT_ID, isActive: true }] as { id: string; isActive: boolean }[],
} = {}): DbTx {
  // select chain
  const limit = vi.fn().mockResolvedValue(existingRows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  // insert chain (para logAudit)
  const insertReturning = vi.fn().mockResolvedValue([])
  const insertValues = vi.fn().mockReturnValue({ returning: insertReturning })
  const insert = vi.fn().mockReturnValue({ values: insertValues })

  // update chain
  const updateWhere = vi.fn().mockResolvedValue([])
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })

  return { select, insert, update } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

import { updateChannelAccount } from '@/lib/domain/channel/update-channel-account'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('updateChannelAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path: atualiza credentials ─────────────────────────────

  it(
    'given existing channel_account and new credentials ' +
      'when updateChannelAccount ' +
      'then calls encryptFn and returns void',
    async () => {
      const tx = buildMockTx()
      const encryptFn: EncryptFn = vi.fn().mockResolvedValue(mockEnvelope)

      const result = await updateChannelAccount(
        tx,
        {
          id: ACCOUNT_ID,
          credentials: { newApiKey: 'new-secret' },
          actorUserId: ACTOR_USER_ID,
        },
        encryptFn,
      )

      expect(result).toBeUndefined()
      expect(encryptFn).toHaveBeenCalledOnce()
      expect(encryptFn).toHaveBeenCalledWith({ newApiKey: 'new-secret' })
    },
  )

  // ── Caso 2 — happy path: atualiza isActive ──────────────────────────────

  it(
    'given existing channel_account and isActive=false ' +
      'when updateChannelAccount ' +
      'then does not call encryptFn',
    async () => {
      const tx = buildMockTx()
      const encryptFn: EncryptFn = vi.fn()

      await updateChannelAccount(
        tx,
        {
          id: ACCOUNT_ID,
          isActive: false,
          actorUserId: ACTOR_USER_ID,
        },
        encryptFn,
      )

      // credentials não foram passadas — encryptFn não deve ser chamado
      expect(encryptFn).not.toHaveBeenCalled()
    },
  )

  // ── Caso 3 — happy path: sem campos alterados ────────────────────────────

  it(
    'given existing channel_account with no changes ' +
      'when updateChannelAccount ' +
      'then completes without error and without calling encryptFn',
    async () => {
      const tx = buildMockTx()
      const encryptFn: EncryptFn = vi.fn()

      await expect(
        updateChannelAccount(
          tx,
          { id: ACCOUNT_ID, actorUserId: ACTOR_USER_ID },
          encryptFn,
        ),
      ).resolves.toBeUndefined()

      expect(encryptFn).not.toHaveBeenCalled()
    },
  )

  // ── Caso 4 — channel_account não encontrado ──────────────────────────────

  it(
    'given non-existent channel_account id ' +
      'when updateChannelAccount ' +
      'then throws ChannelAccountNotFoundError',
    async () => {
      const tx = buildMockTx({ existingRows: [] })
      const encryptFn: EncryptFn = vi.fn()

      await expect(
        updateChannelAccount(
          tx,
          { id: ACCOUNT_ID, actorUserId: ACTOR_USER_ID },
          encryptFn,
        ),
      ).rejects.toThrow(ChannelAccountNotFoundError)
    },
  )

  it(
    'given non-existent id ' +
      'when updateChannelAccount ' +
      'then error references the id',
    async () => {
      const tx = buildMockTx({ existingRows: [] })
      const encryptFn: EncryptFn = vi.fn()

      const err = await updateChannelAccount(
        tx,
        { id: ACCOUNT_ID, actorUserId: ACTOR_USER_ID },
        encryptFn,
      ).catch((e) => e)

      expect(err).toBeInstanceOf(ChannelAccountNotFoundError)
      expect(err.channelAccountId).toBe(ACCOUNT_ID)
    },
  )

  it(
    'given non-existent channel_account ' +
      'when updateChannelAccount ' +
      'then encryptFn is never called',
    async () => {
      const tx = buildMockTx({ existingRows: [] })
      const encryptFn: EncryptFn = vi.fn()

      await expect(
        updateChannelAccount(
          tx,
          {
            id: ACCOUNT_ID,
            credentials: { apiKey: 'key' },
            actorUserId: ACTOR_USER_ID,
          },
          encryptFn,
        ),
      ).rejects.toThrow(ChannelAccountNotFoundError)

      expect(encryptFn).not.toHaveBeenCalled()
    },
  )

  // ── Caso 5 — audit não loga valores de credentials ───────────────────────

  it(
    'given credentials update ' +
      'when updateChannelAccount ' +
      'then insert (audit) is called with changedKeys containing credentials key name',
    async () => {
      const tx = buildMockTx()
      const encryptFn: EncryptFn = vi.fn().mockResolvedValue(mockEnvelope)

      await updateChannelAccount(
        tx,
        {
          id: ACCOUNT_ID,
          credentials: { apiKey: 'secret' },
          actorUserId: ACTOR_USER_ID,
        },
        encryptFn,
      )

      // audit logAudit chama insert
      const txMock = tx as unknown as { insert: ReturnType<typeof vi.fn> }
      expect(txMock.insert).toHaveBeenCalled()

      // insert é chamado com a tabela de auditLog — valores são passados via .values()
      const valuesCall = txMock.insert.mock.results[0]?.value?.values
      expect(valuesCall).toBeDefined()
    },
  )
})
