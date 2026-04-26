/**
 * Unit tests — createChannelAccount
 *
 * T-15-03
 * ADR-10: função lança DomainError tipado
 * ADR-11: tx: DbTx como primeiro argumento
 * ADR-18: credentials encriptadas antes de INSERT
 *
 * Mock de tx: DbTx — sem DB real.
 * Padrão de nomes: Given/When/Then
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'
import {
  BrandNotFoundError,
  DuplicateChannelAccountError,
  InvalidChannelKindError,
} from '@/lib/domain/channel/errors'
import type { CredentialEnvelope } from '@/lib/db/crypto'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BRAND_ID = 'b1-uuid-0000-0000-0000-000000000001'
const CHANNEL_ID = 'ch-uuid-0000-0000-0000-000000000001'
const ACCOUNT_ID = 'ca-uuid-0000-0000-0000-000000000001'
const ACTOR_USER_ID = 'u1-uuid-0000-0000-0000-000000000001'

const mockEnvelope: CredentialEnvelope = {
  v: 1,
  encryptedAt: '2026-04-26T03:00:00Z',
  ciphertext: 'bW9ja2VkY2lwaGVydGV4dA==',
}

const baseInput = {
  brandId: BRAND_ID,
  channelKind: 'whatsapp',
  externalId: '+5511999999999',
  credentials: { apiKey: 'secret', webhookToken: 'wh-token' },
  actorUserId: ACTOR_USER_ID,
}

// ---------------------------------------------------------------------------
// Mock builders
// ---------------------------------------------------------------------------

/**
 * Constrói um mock de tx com comportamento configurável.
 *
 * Sequência de selects:
 *   1. brand lookup → brandRows
 *   2. channel lookup → channelRows
 *   3. existing account lookup → existingAccountRows
 *
 * Insert: insert → values → returning
 * Insert também para logAudit.
 */
function buildMockTx({
  brandRows = [{ id: BRAND_ID }] as { id: string }[],
  channelRows = [{ id: CHANNEL_ID }] as { id: string }[],
  existingAccountRows = [] as { id: string }[],
  insertRows = [{ id: ACCOUNT_ID }] as { id: string }[],
} = {}): DbTx {
  // Sequência de resposta para cada chamada de select
  let selectCallCount = 0
  const selectSequence = [brandRows, channelRows, existingAccountRows]

  const limit = vi.fn().mockImplementation(() => {
    // Retorna a sequência correspondente ao índice da chamada atual
    return Promise.resolve(selectSequence[selectCallCount - 1] ?? [])
  })
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockImplementation(() => {
    selectCallCount++
    return { from }
  })

  // insert chain: insert → values → returning
  // Primeira chamada: INSERT channel_account → retorna insertRows
  // Segunda+ chamadas: INSERT audit_log → retorna []
  let insertCallCount = 0
  const returning = vi.fn().mockImplementation(() => {
    insertCallCount++
    return Promise.resolve(insertCallCount === 1 ? insertRows : [])
  })
  const values = vi.fn().mockReturnValue({ returning })
  const insert = vi.fn().mockReturnValue({ values })

  // update chain (não usado nesta função, mas por segurança)
  const updateWhere = vi.fn().mockResolvedValue([])
  const set = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set })

  return { select, insert, update } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

import { createChannelAccount } from '@/lib/domain/channel/create-channel-account'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createChannelAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path ──────────────────────────────────────────────────

  it(
    'given valid input with existing brand and no duplicate ' +
      'when createChannelAccount ' +
      'then returns { id } and calls encryptFn',
    async () => {
      const tx = buildMockTx()
      const encryptFn = vi.fn().mockResolvedValue(mockEnvelope)

      const result = await createChannelAccount(tx, baseInput, encryptFn)

      expect(result.id).toBe(ACCOUNT_ID)
      expect(encryptFn).toHaveBeenCalledOnce()
      expect(encryptFn).toHaveBeenCalledWith(baseInput.credentials)
    },
  )

  // ── Caso 2 — channelKind inválido ────────────────────────────────────────

  it(
    'given invalid channelKind ' +
      'when createChannelAccount ' +
      'then throws InvalidChannelKindError without calling DB',
    async () => {
      const tx = buildMockTx()
      const encryptFn = vi.fn()

      await expect(
        createChannelAccount(
          tx,
          { ...baseInput, channelKind: 'telegram' },
          encryptFn,
        ),
      ).rejects.toThrow(InvalidChannelKindError)

      // DB não deve ser consultado para kind inválido
      expect((tx as unknown as { select: ReturnType<typeof vi.fn> }).select).not.toHaveBeenCalled()
      expect(encryptFn).not.toHaveBeenCalled()
    },
  )

  it(
    'given channelKind in uppercase ' +
      'when createChannelAccount ' +
      'then throws InvalidChannelKindError',
    async () => {
      const tx = buildMockTx()
      const encryptFn = vi.fn()

      await expect(
        createChannelAccount(
          tx,
          { ...baseInput, channelKind: 'WHATSAPP' },
          encryptFn,
        ),
      ).rejects.toThrow(InvalidChannelKindError)
    },
  )

  it(
    'given empty channelKind ' +
      'when createChannelAccount ' +
      'then throws InvalidChannelKindError',
    async () => {
      const tx = buildMockTx()
      const encryptFn = vi.fn()

      await expect(
        createChannelAccount(tx, { ...baseInput, channelKind: '' }, encryptFn),
      ).rejects.toThrow(InvalidChannelKindError)
    },
  )

  // ── Caso 3 — brand não encontrada ────────────────────────────────────────

  it(
    'given brandId not found in DB ' +
      'when createChannelAccount ' +
      'then throws BrandNotFoundError',
    async () => {
      const tx = buildMockTx({ brandRows: [] })
      const encryptFn = vi.fn()

      await expect(
        createChannelAccount(tx, baseInput, encryptFn),
      ).rejects.toThrow(BrandNotFoundError)

      // encryptFn não deve ser chamado quando brand não existe
      expect(encryptFn).not.toHaveBeenCalled()
    },
  )

  it(
    'given brandId not found ' +
      'when createChannelAccount ' +
      'then error references brandId',
    async () => {
      const tx = buildMockTx({ brandRows: [] })
      const encryptFn = vi.fn()

      await expect(
        createChannelAccount(tx, baseInput, encryptFn),
      ).rejects.toThrow(BRAND_ID)
    },
  )

  // ── Caso 4 — duplicata ────────────────────────────────────────────────────

  it(
    'given existing channel_account with same (brandId, channelKind, externalId) ' +
      'when createChannelAccount ' +
      'then throws DuplicateChannelAccountError',
    async () => {
      const tx = buildMockTx({
        existingAccountRows: [{ id: 'existing-account-id' }],
      })
      const encryptFn = vi.fn()

      await expect(
        createChannelAccount(tx, baseInput, encryptFn),
      ).rejects.toThrow(DuplicateChannelAccountError)

      expect(encryptFn).not.toHaveBeenCalled()
    },
  )

  it(
    'given duplicate channel_account ' +
      'when createChannelAccount ' +
      'then error references brandId, channelKind, externalId',
    async () => {
      const tx = buildMockTx({
        existingAccountRows: [{ id: 'existing-account-id' }],
      })
      const encryptFn = vi.fn()

      const err = await createChannelAccount(tx, baseInput, encryptFn).catch(
        (e) => e,
      )

      expect(err).toBeInstanceOf(DuplicateChannelAccountError)
      expect(err.brandId).toBe(BRAND_ID)
      expect(err.channelKind).toBe('whatsapp')
      expect(err.externalId).toBe('+5511999999999')
    },
  )

  // ── Caso 5 — INSERT falha internamente ────────────────────────────────────

  it(
    'given INSERT returning empty rows ' +
      'when createChannelAccount ' +
      'then throws generic Error',
    async () => {
      const tx = buildMockTx({ insertRows: [] })
      const encryptFn = vi.fn().mockResolvedValue(mockEnvelope)

      await expect(
        createChannelAccount(tx, baseInput, encryptFn),
      ).rejects.toThrow('INSERT returned no rows')
    },
  )

  // ── Caso 6 — valid kinds (todos do enum) ─────────────────────────────────

  it.each(['whatsapp', 'instagram', 'email'])(
    'given channelKind=%s ' +
      'when createChannelAccount ' +
      'then resolves without throwing InvalidChannelKindError',
    async (channelKind) => {
      const tx = buildMockTx()
      const encryptFn = vi.fn().mockResolvedValue(mockEnvelope)

      // Deve criar com sucesso — kind válido passa a validação
      const result = await createChannelAccount(tx, { ...baseInput, channelKind }, encryptFn)
      expect(result.id).toBe(ACCOUNT_ID)
    },
  )
})
