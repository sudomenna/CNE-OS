/**
 * Unit tests — lib/db/crypto.ts
 *
 * T-15-03 — ADR-18: credenciais encriptadas via pgcrypto
 *
 * Testes cobrem:
 *   1. CryptoConfigError quando CREDENTIALS_ENCRYPTION_KEY ausente (encryptCredentials)
 *   2. CryptoConfigError quando CREDENTIALS_ENCRYPTION_KEY ausente (decryptCredentials)
 *   3. Envelope retornado tem v=1 e encryptedAt válido (com mock de db.execute)
 *   4. Roundtrip real (encrypt → decrypt) — skipado se DATABASE_URL ausente
 *
 * Para os testes sem DB: mockamos db.execute para simular pgcrypto.
 * Para o roundtrip real: usamos DATABASE_URL (ambiente de teste com Supabase).
 *
 * NOTA: como o módulo crypto.ts lê process.env['CREDENTIALS_ENCRYPTION_KEY']
 * em runtime (não no import), podemos manipular process.env diretamente em
 * cada teste sem precisar de vi.resetModules().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock de db.execute — configurável por teste
// vi.hoisted necessário pois vi.mock é hoisted antes da inicialização de const
// ---------------------------------------------------------------------------

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}))

vi.mock('@/lib/db/client', () => ({
  db: {
    execute: mockExecute,
  },
}))

// ---------------------------------------------------------------------------
// Import depois do mock
// ---------------------------------------------------------------------------

import { CryptoConfigError, encryptCredentials, decryptCredentials } from '@/lib/db/crypto'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let savedKey: string | undefined

beforeEach(() => {
  savedKey = process.env['CREDENTIALS_ENCRYPTION_KEY']
  vi.clearAllMocks()
})

afterEach(() => {
  if (savedKey === undefined) {
    delete process.env['CREDENTIALS_ENCRYPTION_KEY']
  } else {
    process.env['CREDENTIALS_ENCRYPTION_KEY'] = savedKey
  }
})

const TEST_KEY = 'test-key-32-chars-long-enough!!'

// ---------------------------------------------------------------------------
// CryptoConfigError — classe base
// ---------------------------------------------------------------------------

describe('CryptoConfigError', () => {
  it('given no message when instantiated then uses default message', () => {
    const err = new CryptoConfigError()
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(CryptoConfigError)
    expect(err.name).toBe('CryptoConfigError')
    expect(err.message).toBe('CREDENTIALS_ENCRYPTION_KEY is not set')
  })

  it('given custom message when instantiated then uses custom message', () => {
    const err = new CryptoConfigError('custom error')
    expect(err.message).toBe('custom error')
  })
})

// ---------------------------------------------------------------------------
// encryptCredentials
// ---------------------------------------------------------------------------

describe('encryptCredentials', () => {
  it(
    'given CREDENTIALS_ENCRYPTION_KEY absent ' +
      'when encryptCredentials called ' +
      'then throws CryptoConfigError',
    async () => {
      delete process.env['CREDENTIALS_ENCRYPTION_KEY']

      await expect(encryptCredentials({ token: 'abc' })).rejects.toThrow(
        CryptoConfigError,
      )

      // db.execute não deve ser chamado quando a chave está ausente
      expect(mockExecute).not.toHaveBeenCalled()
    },
  )

  it(
    'given CREDENTIALS_ENCRYPTION_KEY empty string ' +
      'when encryptCredentials called ' +
      'then throws CryptoConfigError',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = '   '

      await expect(encryptCredentials({ token: 'abc' })).rejects.toThrow(
        CryptoConfigError,
      )
    },
  )

  it(
    'given valid key and mocked db.execute ' +
      'when encryptCredentials called ' +
      'then returns envelope with v=1',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = TEST_KEY
      mockExecute.mockResolvedValue([{ ciphertext: 'dGVzdC1jaXBoZXJ0ZXh0' }])

      const result = await encryptCredentials({ apiKey: 'secret-token' })

      expect(result.v).toBe(1)
    },
  )

  it(
    'given valid key and mocked db.execute ' +
      'when encryptCredentials called ' +
      'then returns envelope with ciphertext matching mock',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = TEST_KEY
      mockExecute.mockResolvedValue([{ ciphertext: 'dGVzdC1jaXBoZXJ0ZXh0' }])

      const result = await encryptCredentials({ apiKey: 'secret-token' })

      expect(result.ciphertext).toBe('dGVzdC1jaXBoZXJ0ZXh0')
    },
  )

  it(
    'given valid key and mocked db.execute ' +
      'when encryptCredentials called ' +
      'then returns envelope with valid ISO encryptedAt',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = TEST_KEY
      mockExecute.mockResolvedValue([{ ciphertext: 'abc123==' }])

      const result = await encryptCredentials({ webhookSecret: 'wh-secret' })

      // encryptedAt deve ser ISO 8601 válido
      const parsedDate = new Date(result.encryptedAt)
      expect(isNaN(parsedDate.getTime())).toBe(false)
      expect(result.encryptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    },
  )

  it(
    'given valid key ' +
      'when encryptCredentials called ' +
      'then calls db.execute exactly once',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = TEST_KEY
      mockExecute.mockResolvedValue([{ ciphertext: 'abc123==' }])

      await encryptCredentials({ token: 'my-token' })

      expect(mockExecute).toHaveBeenCalledOnce()
    },
  )
})

// ---------------------------------------------------------------------------
// decryptCredentials
// ---------------------------------------------------------------------------

describe('decryptCredentials', () => {
  it(
    'given CREDENTIALS_ENCRYPTION_KEY absent ' +
      'when decryptCredentials called ' +
      'then throws CryptoConfigError',
    async () => {
      delete process.env['CREDENTIALS_ENCRYPTION_KEY']

      await expect(
        decryptCredentials({ v: 1, encryptedAt: '2026-04-26T00:00:00Z', ciphertext: 'abc' }),
      ).rejects.toThrow(CryptoConfigError)

      expect(mockExecute).not.toHaveBeenCalled()
    },
  )

  it(
    'given valid key and mocked db.execute ' +
      'when decryptCredentials called ' +
      'then returns parsed JSON object',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = TEST_KEY
      const plain = { apiKey: 'secret-token', webhookSecret: 'wh-secret' }
      mockExecute.mockResolvedValue([{ plaintext: JSON.stringify(plain) }])

      const result = await decryptCredentials({
        v: 1,
        encryptedAt: '2026-04-26T00:00:00Z',
        ciphertext: 'dGVzdC1jaXBoZXJ0ZXh0',
      })

      expect(result).toEqual(plain)
      expect(result['apiKey']).toBe('secret-token')
    },
  )

  it(
    'given valid key ' +
      'when decryptCredentials called ' +
      'then calls db.execute exactly once',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = TEST_KEY
      mockExecute.mockResolvedValue([{ plaintext: '{}' }])

      await decryptCredentials({
        v: 1,
        encryptedAt: '2026-04-26T00:00:00Z',
        ciphertext: 'abc123==',
      })

      expect(mockExecute).toHaveBeenCalledOnce()
    },
  )

  it(
    'given empty plaintext result from db ' +
      'when decryptCredentials called ' +
      'then throws Error',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = TEST_KEY
      mockExecute.mockResolvedValue([])

      await expect(
        decryptCredentials({
          v: 1,
          encryptedAt: '2026-04-26T00:00:00Z',
          ciphertext: 'abc123==',
        }),
      ).rejects.toThrow('pgp_sym_decrypt returned no result')
    },
  )
})

// ---------------------------------------------------------------------------
// Roundtrip real — skipado se DATABASE_URL ausente
// ---------------------------------------------------------------------------

describe('encrypt→decrypt roundtrip (real DB)', () => {
  it.skipIf(!process.env['DATABASE_URL'])(
    'given real DB ' +
      'when encrypt then decrypt ' +
      'then original object is recovered',
    async () => {
      process.env['CREDENTIALS_ENCRYPTION_KEY'] = 'test-roundtrip-key-32-chars!!!!!'

      const plain = {
        apiKey: 'my-api-key',
        webhookToken: 'wh-token-xyz',
        phoneNumberId: '123456789',
      }

      const envelope = await encryptCredentials(plain)

      expect(envelope.v).toBe(1)
      expect(envelope.ciphertext).toBeTruthy()
      expect(envelope.encryptedAt).toBeTruthy()

      const recovered = await decryptCredentials(envelope)

      expect(recovered).toEqual(plain)
    },
  )
})
