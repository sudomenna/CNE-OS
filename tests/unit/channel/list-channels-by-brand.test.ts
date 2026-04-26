/**
 * Unit tests — listChannelsByBrand
 *
 * T-15-03
 * ADR-10: função retorna Promise<ChannelAccountListItem[]>
 * ADR-11: leitura pura — sem tx
 * ADR-18: NUNCA retorna ciphertext nem plaintext
 *
 * Mock de db via vi.mock com vi.hoisted.
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

import { listChannelsByBrand } from '@/lib/domain/channel/list-channels-by-brand'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BRAND_ID = 'b1-uuid-0000-0000-0000-000000000001'
const ACCOUNT_ID_1 = 'ca-uuid-0000-0000-0000-000000000001'
const ACCOUNT_ID_2 = 'ca-uuid-0000-0000-0000-000000000002'

const mockRows = [
  {
    id: ACCOUNT_ID_1,
    brandId: BRAND_ID,
    channelKind: 'whatsapp',
    externalId: '+5511999999999',
    displayName: 'WhatsApp Business',
    isActive: true,
    credentials: {
      v: 1,
      encryptedAt: '2026-04-26T03:00:00Z',
      ciphertext: 'bW9ja2VkY2lwaGVydGV4dA==',
    },
    createdAt: new Date('2026-04-26T00:00:00Z'),
    updatedAt: new Date('2026-04-26T00:00:00Z'),
  },
  {
    id: ACCOUNT_ID_2,
    brandId: BRAND_ID,
    channelKind: 'instagram',
    externalId: '@brand-account',
    displayName: null,
    isActive: false,
    credentials: null,
    createdAt: new Date('2026-04-26T01:00:00Z'),
    updatedAt: new Date('2026-04-26T01:00:00Z'),
  },
]

// ---------------------------------------------------------------------------
// Helper para montar a cadeia select → from → innerJoin → where → orderBy
// ---------------------------------------------------------------------------

function setupDbRows(rows: unknown[]) {
  const orderBy = vi.fn().mockResolvedValue(rows)
  const where = vi.fn().mockReturnValue({ orderBy })
  const innerJoin = vi.fn().mockReturnValue({ where })
  const from = vi.fn().mockReturnValue({ innerJoin })
  mockDbSelect.mockReturnValue({ from })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('listChannelsByBrand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path ──────────────────────────────────────────────────

  it(
    'given brand with two channel_accounts ' +
      'when listChannelsByBrand ' +
      'then returns list with encryptedAt extracted from envelope',
    async () => {
      setupDbRows(mockRows)

      const result = await listChannelsByBrand(BRAND_ID)

      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe(ACCOUNT_ID_1)
      expect(result[0]?.channelKind).toBe('whatsapp')
      expect(result[0]?.isActive).toBe(true)
      // encryptedAt extraído do envelope
      expect(result[0]?.encryptedAt).toBe('2026-04-26T03:00:00Z')
    },
  )

  // ── Caso 2 — credentials ausentes → encryptedAt = null ──────────────────

  it(
    'given channel_account with null credentials ' +
      'when listChannelsByBrand ' +
      'then encryptedAt is null',
    async () => {
      setupDbRows(mockRows)

      const result = await listChannelsByBrand(BRAND_ID)

      // Segundo item tem credentials null
      expect(result[1]?.encryptedAt).toBeNull()
    },
  )

  // ── Caso 3 — ADR-18: nunca retorna ciphertext ───────────────────────────

  it(
    'given channel_account with ciphertext in credentials ' +
      'when listChannelsByBrand ' +
      'then result items do NOT contain ciphertext or credentials fields',
    async () => {
      setupDbRows(mockRows)

      const result = await listChannelsByBrand(BRAND_ID)

      for (const item of result) {
        // ADR-18: plaintext e ciphertext nunca devem estar no resultado
        expect(item).not.toHaveProperty('ciphertext')
        expect(item).not.toHaveProperty('credentials')
        expect(item).not.toHaveProperty('plaintext')
      }
    },
  )

  // ── Caso 4 — brand sem channel_accounts → lista vazia ───────────────────

  it(
    'given brand with no channel_accounts ' +
      'when listChannelsByBrand ' +
      'then returns empty array',
    async () => {
      setupDbRows([])

      const result = await listChannelsByBrand(BRAND_ID)

      expect(result).toEqual([])
    },
  )

  // ── Caso 5 — campos obrigatórios presentes ───────────────────────────────

  it(
    'given valid channel_account rows ' +
      'when listChannelsByBrand ' +
      'then each item has required fields: id, brandId, channelKind, externalId, isActive',
    async () => {
      setupDbRows([mockRows[0]])

      const result = await listChannelsByBrand(BRAND_ID)

      expect(result[0]).toMatchObject({
        id: ACCOUNT_ID_1,
        brandId: BRAND_ID,
        channelKind: 'whatsapp',
        externalId: '+5511999999999',
        isActive: true,
        displayName: 'WhatsApp Business',
      })
    },
  )
})
