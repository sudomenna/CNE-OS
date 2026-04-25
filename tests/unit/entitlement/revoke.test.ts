/**
 * Unit tests — revokeByTransaction
 *
 * T-8-10
 * INV-ENT-07: revogação marca status='revoked' e registra entitlement_history; nunca DELETE.
 * INV-ENT-06: mudança de status gera linha em entitlement_status_history.
 * ADR-10: lança EntitlementNotFoundError (NotFoundError) quando nenhum entitlement existe.
 * ADR-11: tx como primeiro argumento.
 *
 * docs/20-domain/12-entitlement.md §2, §10 fluxo de revogação
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TX_ID = 'tx-0000-0000-0000-0000-000000000001'
const ENT_ID_A = 'ent-aaaa-0000-0000-0000-000000000001'
const ENT_ID_B = 'ent-bbbb-0000-0000-0000-000000000002'
const CONTACT_ID = 'cnt-0000-0000-0000-0000-000000000001'
const BRAND_ID = 'brd-0000-0000-0000-0000-000000000001'
const REASON = 'refund_revoke'

type FakeEntitlement = {
  id: string
  contactId: string
  brandId: string
  kind: 'product_access' | 'benefit' | 'other'
  refKind: string
  refId: string
  quantity: number
  startedAt: Date
  endsAt: Date | null
  status: 'active' | 'suspended' | 'expired' | 'revoked'
  originTransactionId: string
  lastUpdateTransactionId: string
  accessRule: Record<string, unknown>
  createdAt: Date
  updatedAt: Date
}

function makeEntitlement(overrides: Partial<FakeEntitlement> = {}): FakeEntitlement {
  return {
    id: ENT_ID_A,
    contactId: CONTACT_ID,
    brandId: BRAND_ID,
    kind: 'product_access',
    refKind: 'product',
    refId: 'prod-0000-0000-0000-0000-000000000001',
    quantity: 1,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T00:00:00Z'),
    status: 'active',
    originTransactionId: TX_ID,
    lastUpdateTransactionId: TX_ID,
    accessRule: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock builder for tx: DbTx
//
// select → from → where           (retorna toRevoke rows)
// update → set → where → returning (retorna entitlement revogado)
// insert → values                  (retorna void / noop)
// ---------------------------------------------------------------------------

function buildMockTx({
  selectRows = [makeEntitlement()] as FakeEntitlement[],
  updateRows = undefined as FakeEntitlement[] | undefined,
}: {
  selectRows?: FakeEntitlement[]
  updateRows?: FakeEntitlement[]
} = {}): { tx: DbTx; mocks: ReturnType<typeof buildMocks> } {
  const mocks = buildMocks({ selectRows, updateRows })
  return { tx: mocks.tx, mocks }
}

function buildMocks({
  selectRows,
  updateRows,
}: {
  selectRows: FakeEntitlement[]
  updateRows?: FakeEntitlement[] | undefined
}) {
  // select().from().where() — returns selectRows
  const selectWhere = vi.fn().mockResolvedValue(selectRows)
  const selectFrom = vi.fn().mockReturnValue({ where: selectWhere })
  const select = vi.fn().mockReturnValue({ from: selectFrom })

  // update().set().where().returning() — returns revokedRow per entitlement
  // Each call to `returning()` resolves with the "revoked" version of the corresponding row.
  let updateCallIndex = 0
  const returning = vi.fn().mockImplementation(() => {
    const sourceRows = updateRows ?? selectRows
    const row = sourceRows[updateCallIndex]
    updateCallIndex += 1
    const revokedRow: FakeEntitlement = {
      ...(row as FakeEntitlement),
      status: 'revoked',
      updatedAt: new Date(),
    }
    return Promise.resolve([revokedRow])
  })
  const updateWhere = vi.fn().mockReturnValue({ returning })
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
  const update = vi.fn().mockReturnValue({ set: updateSet })

  // insert().values() — noop (append-only tables)
  const values = vi.fn().mockResolvedValue([])
  const insert = vi.fn().mockReturnValue({ values })

  const tx = { select, update, insert } as unknown as DbTx

  return { tx, select, selectFrom, selectWhere, update, updateSet, updateWhere, returning, insert, values }
}

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

const { revokeByTransaction, EntitlementNotFoundError } = await import(
  '../../../lib/domain/entitlement/revoke'
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T-8-10 — revokeByTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Test 1: revoga todos os entitlements da transação ──────────────────────

  it(
    'given active entitlements for transactionId ' +
      'when revokeByTransaction ' +
      'then all entitlements are returned with status revoked',
    async () => {
      const entA = makeEntitlement({ id: ENT_ID_A, status: 'active' })
      const entB = makeEntitlement({ id: ENT_ID_B, refId: 'prod-bbb', status: 'active' })

      const { tx } = buildMockTx({ selectRows: [entA, entB] })

      const result = await revokeByTransaction(tx, TX_ID, REASON)

      expect(result).toHaveLength(2)
      expect(result.every((e) => e.status === 'revoked')).toBe(true)
    },
  )

  // ── Test 2: UPDATE é chamado para cada entitlement ─────────────────────────

  it(
    'given two active entitlements ' +
      'when revokeByTransaction ' +
      'then update is called once per entitlement',
    async () => {
      const entA = makeEntitlement({ id: ENT_ID_A })
      const entB = makeEntitlement({ id: ENT_ID_B, refId: 'prod-bbb' })

      const { tx, mocks } = buildMockTx({ selectRows: [entA, entB] })

      await revokeByTransaction(tx, TX_ID, REASON)

      expect(mocks.update).toHaveBeenCalledTimes(2)
    },
  )

  // ── Test 3: entitlement_history é inserido para cada revogação ─────────────

  it(
    'given active entitlement ' +
      'when revokeByTransaction ' +
      'then entitlement_history is inserted with from/to snapshots and reason',
    async () => {
      const ent = makeEntitlement({ status: 'active' })
      const { tx, mocks } = buildMockTx({ selectRows: [ent] })

      await revokeByTransaction(tx, TX_ID, REASON)

      // insert chamado 2 vezes: entitlement_history + entitlement_status_history
      expect(mocks.insert).toHaveBeenCalledTimes(2)

      // Primeiro insert: entitlement_history
      const firstInsertValuesArg = mocks.values.mock.calls[0]?.[0]
      expect(firstInsertValuesArg).toMatchObject({
        entitlementId: ent.id,
        reason: REASON,
        causedByTransactionId: TX_ID,
        to: expect.objectContaining({ status: 'revoked' }),
        from: expect.objectContaining({ status: 'active' }),
      })
    },
  )

  // ── Test 4: entitlement_status_history é inserido para cada revogação ──────

  it(
    'given active entitlement ' +
      'when revokeByTransaction ' +
      'then entitlement_status_history is inserted with fromStatus=active and toStatus=revoked',
    async () => {
      const ent = makeEntitlement({ status: 'active' })
      const { tx, mocks } = buildMockTx({ selectRows: [ent] })

      await revokeByTransaction(tx, TX_ID, REASON)

      // Segundo insert: entitlement_status_history
      const secondInsertValuesArg = mocks.values.mock.calls[1]?.[0]
      expect(secondInsertValuesArg).toMatchObject({
        entitlementId: ent.id,
        fromStatus: 'active',
        toStatus: 'revoked',
        reason: REASON,
      })
    },
  )

  // ── Test 5: já-revogados NÃO são reprocessados ─────────────────────────────

  it(
    'given only already-revoked entitlements for transactionId ' +
      'when revokeByTransaction ' +
      'then throws EntitlementNotFoundError (idempotency: no double-revoke)',
    async () => {
      // select retorna vazio porque a query filtra status != 'revoked'
      // Simulamos isso retornando rows vazio (a query real excluiria os revogados)
      const { tx } = buildMockTx({ selectRows: [] })

      await expect(revokeByTransaction(tx, TX_ID, REASON)).rejects.toThrow(
        EntitlementNotFoundError,
      )
    },
  )

  // ── Test 6: NotFoundError quando transactionId não tem entitlements ─────────

  it(
    'given transactionId with no entitlements ' +
      'when revokeByTransaction ' +
      'then throws EntitlementNotFoundError',
    async () => {
      const { tx } = buildMockTx({ selectRows: [] })

      await expect(revokeByTransaction(tx, 'non-existent-tx-id', REASON)).rejects.toThrow(
        EntitlementNotFoundError,
      )
    },
  )

  // ── Test 7: error message contém transactionId ──────────────────────────────

  it(
    'given no entitlements for transactionId ' +
      'when revokeByTransaction throws ' +
      'then error message references the transactionId',
    async () => {
      const { tx } = buildMockTx({ selectRows: [] })

      await expect(revokeByTransaction(tx, TX_ID, REASON)).rejects.toThrow(TX_ID)
    },
  )

  // ── Test 8: suspended entitlement também é revogado ──────────────────────

  it(
    'given suspended entitlement for transactionId ' +
      'when revokeByTransaction ' +
      'then suspended entitlement is also revoked (status change active|suspended → revoked)',
    async () => {
      const suspended = makeEntitlement({ status: 'suspended' })
      const { tx, mocks } = buildMockTx({ selectRows: [suspended] })

      const result = await revokeByTransaction(tx, TX_ID, REASON)

      expect(result).toHaveLength(1)
      expect(result[0]!.status).toBe('revoked')

      // entitlement_status_history deve registrar from=suspended
      const statusHistoryArg = mocks.values.mock.calls[1]?.[0]
      expect(statusHistoryArg).toMatchObject({
        fromStatus: 'suspended',
        toStatus: 'revoked',
      })
    },
  )
})
