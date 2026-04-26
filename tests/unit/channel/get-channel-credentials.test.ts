/**
 * Unit tests — getChannelCredentials
 *
 * T-15-03
 * ADR-10: função lança DomainError tipado
 * ADR-11: leitura que decripta — sem tx
 * ADR-18: retorna plaintext somente para adapters de integração
 *
 * Mock de db (singleton) via vi.mock com vi.hoisted.
 * Padrão: Given/When/Then
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks — devem ser declarados antes de vi.mock
// ---------------------------------------------------------------------------

const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    select: mockDbSelect,
  },
}))

// ---------------------------------------------------------------------------
// Import depois do mock
// ---------------------------------------------------------------------------

import {
  getChannelCredentials,
} from '@/lib/domain/channel/get-channel-credentials'
import {
  ChannelAccountNotFoundError,
} from '@/lib/domain/channel/errors'
import type { DecryptFn } from '@/lib/domain/channel/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = 'ca-uuid-0000-0000-0000-000000000001'

const validEnvelope = {
  v: 1 as const,
  encryptedAt: '2026-04-26T03:00:00Z',
  ciphertext: 'bW9ja2VkY2lwaGVydGV4dA==',
}

const plainCredentials = { apiKey: 'secret-token', webhookToken: 'wh-token' }

// ---------------------------------------------------------------------------
// Helper para montar a cadeia select → from → where → limit
// ---------------------------------------------------------------------------

function setupDbRows(rows: unknown[]) {
  const limit = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  mockDbSelect.mockReturnValue({ from })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getChannelCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path ──────────────────────────────────────────────────

  it(
    'given existing channel_account with valid envelope ' +
      'when getChannelCredentials ' +
      'then calls decryptFn and returns plaintext credentials',
    async () => {
      setupDbRows([{ id: ACCOUNT_ID, credentials: validEnvelope }])

      const decryptFn: DecryptFn = vi.fn().mockResolvedValue(plainCredentials)
      const result = await getChannelCredentials(ACCOUNT_ID, decryptFn)

      expect(result).toEqual(plainCredentials)
      expect(decryptFn).toHaveBeenCalledOnce()
      expect(decryptFn).toHaveBeenCalledWith(validEnvelope)
    },
  )

  // ── Caso 2 — channel_account não encontrado ──────────────────────────────

  it(
    'given non-existent channel_account id ' +
      'when getChannelCredentials ' +
      'then throws ChannelAccountNotFoundError',
    async () => {
      setupDbRows([])

      const decryptFn: DecryptFn = vi.fn()

      await expect(
        getChannelCredentials(ACCOUNT_ID, decryptFn),
      ).rejects.toThrow(ChannelAccountNotFoundError)

      expect(decryptFn).not.toHaveBeenCalled()
    },
  )

  it(
    'given non-existent channel_account ' +
      'when getChannelCredentials ' +
      'then error references the id',
    async () => {
      setupDbRows([])

      const err = await getChannelCredentials(ACCOUNT_ID, vi.fn()).catch(
        (e) => e,
      )

      expect(err).toBeInstanceOf(ChannelAccountNotFoundError)
      expect(err.channelAccountId).toBe(ACCOUNT_ID)
    },
  )

  // ── Caso 3 — credentials ausentes ────────────────────────────────────────

  it(
    'given channel_account with null credentials ' +
      'when getChannelCredentials ' +
      'then throws generic Error about missing envelope',
    async () => {
      setupDbRows([{ id: ACCOUNT_ID, credentials: null }])

      const decryptFn: DecryptFn = vi.fn()

      await expect(
        getChannelCredentials(ACCOUNT_ID, decryptFn),
      ).rejects.toThrow('no credentials envelope')

      expect(decryptFn).not.toHaveBeenCalled()
    },
  )

  // ── Caso 4 — envelope malformado (sem v: 1) ──────────────────────────────

  it(
    'given channel_account with malformed envelope (missing v) ' +
      'when getChannelCredentials ' +
      'then throws Error about invalid envelope',
    async () => {
      setupDbRows([
        {
          id: ACCOUNT_ID,
          credentials: {
            encryptedAt: '2026-04-26T03:00:00Z',
            ciphertext: 'abc',
            // v ausente
          },
        },
      ])

      const decryptFn: DecryptFn = vi.fn()

      await expect(
        getChannelCredentials(ACCOUNT_ID, decryptFn),
      ).rejects.toThrow('invalid credential envelope')

      expect(decryptFn).not.toHaveBeenCalled()
    },
  )

  // ── Caso 5 — envelope sem ciphertext ─────────────────────────────────────

  it(
    'given channel_account with envelope missing ciphertext ' +
      'when getChannelCredentials ' +
      'then throws Error about invalid envelope',
    async () => {
      setupDbRows([
        {
          id: ACCOUNT_ID,
          credentials: {
            v: 1,
            encryptedAt: '2026-04-26T03:00:00Z',
            // ciphertext ausente
          },
        },
      ])

      const decryptFn: DecryptFn = vi.fn()

      await expect(
        getChannelCredentials(ACCOUNT_ID, decryptFn),
      ).rejects.toThrow('invalid credential envelope')
    },
  )

  // ── Caso 6 — decryptFn propaga erros ─────────────────────────────────────

  it(
    'given valid envelope but decryptFn throws ' +
      'when getChannelCredentials ' +
      'then propagates the error',
    async () => {
      setupDbRows([{ id: ACCOUNT_ID, credentials: validEnvelope }])

      const decryptError = new Error('decryption failed')
      const decryptFn: DecryptFn = vi.fn().mockRejectedValue(decryptError)

      await expect(
        getChannelCredentials(ACCOUNT_ID, decryptFn),
      ).rejects.toThrow('decryption failed')
    },
  )
})
