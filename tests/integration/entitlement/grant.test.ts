/**
 * Tests: grantFromTransaction
 *
 * T-8-09
 * docs/20-domain/12-entitlement.md §10 (fluxo principal), §11 (casos de teste)
 * BR-ENTITLEMENT-CONSOLIDATION
 *
 * Mock de tx: DbTx — sem DB real.
 * Cada cenário verifica a ação correta do consolidate() e os efeitos
 * (INSERT/UPDATE em customer_entitlement, INSERT em entitlement_history,
 * emissão do TE correto).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'
import { grantFromTransaction } from '@/lib/domain/entitlement/grant'
import {
  TransactionSnapshotNotFoundError,
  TransactionNotFoundError,
} from '@/lib/domain/entitlement/grant'
import type { EmitFn } from '@/lib/domain/entitlement/grant'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRANSACTION_ID = '00000000-0000-0000-0000-000000000001'
const CONTACT_ID = '00000000-0000-0000-0000-000000000002'
const BRAND_ID = '00000000-0000-0000-0000-000000000003'
const PRODUCT_ID = '00000000-0000-0000-0000-000000000004'
const BENEFIT_ID = '00000000-0000-0000-0000-000000000005'
const ENTITLEMENT_ID = '00000000-0000-0000-0000-000000000010'

type TxRecord = Record<string, unknown>

function makeTransaction(): TxRecord {
  return {
    id: TRANSACTION_ID,
    contactId: CONTACT_ID,
    brandId: BRAND_ID,
    offerId: '00000000-0000-0000-0000-000000000020',
    offerConditionId: '00000000-0000-0000-0000-000000000021',
    offerPaymentOptionId: '00000000-0000-0000-0000-000000000022',
    status: 'approved',
    amount: '100.00',
    currency: 'BRL',
    snapshotId: '00000000-0000-0000-0000-000000000030',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeSnapshot(items: unknown[]): TxRecord {
  return {
    id: '00000000-0000-0000-0000-000000000030',
    transactionId: TRANSACTION_ID,
    flag: 'normal',
    payload: {
      version: 1,
      brand: { id: BRAND_ID, name: 'CNE', slug: 'cne' },
      items,
    },
    createdAt: new Date(),
  }
}

function makeEntitlementRow(overrides: Partial<TxRecord> = {}): TxRecord {
  return {
    id: ENTITLEMENT_ID,
    contact_id: CONTACT_ID,
    brand_id: BRAND_ID,
    kind: 'product_access',
    ref_kind: 'product',
    ref_id: PRODUCT_ID,
    quantity: 1,
    started_at: new Date('2026-01-01T00:00:00Z').toISOString(),
    ends_at: new Date('2026-12-31T00:00:00Z').toISOString(),
    status: 'active',
    origin_transaction_id: '00000000-0000-0000-0000-000000000099',
    last_update_transaction_id: '00000000-0000-0000-0000-000000000099',
    access_rule: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helper: criar um mock de DbTx que simula chamadas DB
// ---------------------------------------------------------------------------

type TxMockConfig = {
  transactionRow?: TxRecord | null
  snapshotRow?: TxRecord | null
  existingEntitlement?: TxRecord | null
  insertedEntitlementId?: string
}

function buildTxMock(config: TxMockConfig): {
  tx: DbTx
  selectMock: Mock
  insertMock: Mock
  updateMock: Mock
  executeMock: Mock
} {
  const insertMock = vi.fn()
  const updateMock = vi.fn()
  const executeMock = vi.fn()
  const selectMock = vi.fn()

  // Simula o padrão de chamada encadeada do Drizzle:
  // tx.select().from(...).where(...).limit(...) → Promise<row[]>
  //
  // Sequência de chamadas select:
  //   1ª: buscar transaction
  //   2ª: buscar transactionSnapshot
  //
  // execute(): SELECT FOR UPDATE → existing entitlement

  let selectCallCount = 0
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => {
      selectCallCount++
      if (selectCallCount === 1) {
        // transaction
        return Promise.resolve(config.transactionRow ? [config.transactionRow] : [])
      }
      if (selectCallCount === 2) {
        // transactionSnapshot
        return Promise.resolve(config.snapshotRow ? [config.snapshotRow] : [])
      }
      return Promise.resolve([])
    }),
  }
  selectMock.mockReturnValue(selectChain)

  // execute() → SELECT FOR UPDATE: existing entitlement
  executeMock.mockResolvedValue(
    config.existingEntitlement ? [config.existingEntitlement] : [],
  )

  // INSERT customer_entitlement → returning row
  const insertedId = config.insertedEntitlementId ?? '00000000-0000-0000-0000-000000000011'
  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      {
        id: insertedId,
        contactId: CONTACT_ID,
        brandId: BRAND_ID,
        kind: 'product_access',
        refKind: 'product',
        refId: PRODUCT_ID,
        quantity: 1,
        startedAt: new Date(),
        endsAt: null,
        status: 'active',
        originTransactionId: TRANSACTION_ID,
        lastUpdateTransactionId: TRANSACTION_ID,
        accessRule: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
  }
  insertMock.mockReturnValue(insertChain)

  // UPDATE customer_entitlement → returning updated row
  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => {
      const existingEndsAt =
        config.existingEntitlement?.ends_at != null
          ? new Date(config.existingEntitlement.ends_at as string)
          : null
      return Promise.resolve([
        {
          id: ENTITLEMENT_ID,
          contactId: CONTACT_ID,
          brandId: BRAND_ID,
          kind: 'product_access',
          refKind: 'product',
          refId: PRODUCT_ID,
          quantity: 2,
          startedAt: new Date('2026-01-01T00:00:00Z'),
          // extend_expiration — ends_at atualizado
          endsAt: existingEndsAt ?? new Date('2027-12-31T00:00:00Z'),
          status: 'active' as const,
          originTransactionId: '00000000-0000-0000-0000-000000000099',
          lastUpdateTransactionId: TRANSACTION_ID,
          accessRule: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    }),
  }
  updateMock.mockReturnValue(updateChain)

  const tx = {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
    execute: executeMock,
  } as unknown as DbTx

  return { tx, selectMock, insertMock, updateMock, executeMock }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('grantFromTransaction', () => {
  let emitMock: EmitFn & Mock

  beforeEach(() => {
    emitMock = vi.fn().mockResolvedValue({ id: 'timeline-event-001' }) as unknown as EmitFn & Mock
  })

  // ── T1: create — novo contato sem entitlement existente → INSERT ──────────

  describe('given a transaction with one product item and no existing entitlement', () => {
    it('when grantFromTransaction then INSERT is called and TE-ENTITLEMENT-GRANTED is emitted', async () => {
      const snapshotItems = [
        {
          condition_item_id: '00000000-0000-0000-0000-000000000040',
          kind: 'main',
          product: { id: PRODUCT_ID, name: 'Curso X', slug: 'curso-x', kind: 'course' },
          quantity: 1,
          access_rule: { drip: true },
          vigency_months: 12,
          discount: null,
          responsible_user_id: null,
        },
      ]

      const { tx, insertMock } = buildTxMock({
        transactionRow: makeTransaction(),
        snapshotRow: makeSnapshot(snapshotItems),
        existingEntitlement: null, // nenhum existente
        insertedEntitlementId: '00000000-0000-0000-0000-000000000011',
      })

      const results = await grantFromTransaction(tx, TRANSACTION_ID, emitMock)

      // 1 entitlement por item
      expect(results).toHaveLength(1)

      // INSERT foi chamado
      expect(insertMock).toHaveBeenCalledTimes(2) // 1 customer_entitlement + 1 entitlement_history

      // Emitiu TE-ENTITLEMENT-GRANTED
      expect(emitMock).toHaveBeenCalledOnce()
      const emitCall = emitMock.mock.calls[0]![0]
      expect(emitCall.kind).toBe('entitlement_granted')
      expect(emitCall.source).toBe('MOD-ENTITLEMENT')
      expect(emitCall.payload).toMatchObject({
        kind: 'product_access',
        ref_id: PRODUCT_ID,
      })
    })
  })

  // ── T2: extend_expiration — existing ativo finito + incoming finito → UPDATE ends_at ──

  describe('given an active finite entitlement and an incoming finite extension', () => {
    it('when grantFromTransaction then UPDATE ends_at and TE-ENTITLEMENT-EXTENDED is emitted', async () => {
      const snapshotItems = [
        {
          condition_item_id: '00000000-0000-0000-0000-000000000040',
          kind: 'main',
          product: { id: PRODUCT_ID, name: 'Curso X', slug: 'curso-x', kind: 'course' },
          quantity: 1,
          access_rule: {},
          vigency_months: 6, // incoming finito
          discount: null,
          responsible_user_id: null,
        },
      ]

      // existing com ends_at em 2026-12-31 (finito)
      const existingRow = makeEntitlementRow({
        ends_at: new Date('2026-12-31T00:00:00Z').toISOString(),
      })

      const { tx, updateMock } = buildTxMock({
        transactionRow: makeTransaction(),
        snapshotRow: makeSnapshot(snapshotItems),
        existingEntitlement: existingRow,
      })

      const results = await grantFromTransaction(tx, TRANSACTION_ID, emitMock)

      expect(results).toHaveLength(1)

      // UPDATE foi chamado (não INSERT em customer_entitlement)
      expect(updateMock).toHaveBeenCalledTimes(1)

      // Emitiu TE-ENTITLEMENT-EXTENDED
      expect(emitMock).toHaveBeenCalledOnce()
      const emitCall = emitMock.mock.calls[0]![0]
      expect(emitCall.kind).toBe('entitlement_extended')
      expect(emitCall.payload).toMatchObject({
        entitlement_id: ENTITLEMENT_ID,
      })
      // from e to devem ser strings de data
      expect(typeof emitCall.payload.from).toBe('string')
      expect(typeof emitCall.payload.to).toBe('string')
    })
  })

  // ── T3: noop — existing perpetuous + incoming finito → sem INSERT/UPDATE ──

  describe('given an existing perpetuous entitlement and an incoming finite one', () => {
    it('when grantFromTransaction then noop: no INSERT/UPDATE on entitlement, no TE emitted', async () => {
      const snapshotItems = [
        {
          condition_item_id: '00000000-0000-0000-0000-000000000040',
          kind: 'main',
          product: { id: PRODUCT_ID, name: 'Curso X', slug: 'curso-x', kind: 'course' },
          quantity: 1,
          access_rule: {},
          vigency_months: 6, // incoming finito
          discount: null,
          responsible_user_id: null,
        },
      ]

      // existing perpetuous (ends_at=null)
      const existingRow = makeEntitlementRow({ ends_at: null })

      const { tx, insertMock, updateMock } = buildTxMock({
        transactionRow: makeTransaction(),
        snapshotRow: makeSnapshot(snapshotItems),
        existingEntitlement: existingRow,
      })

      const results = await grantFromTransaction(tx, TRANSACTION_ID, emitMock)

      expect(results).toHaveLength(1)

      // Nenhum INSERT em customer_entitlement, apenas 1 INSERT em entitlement_history
      // insertMock foi chamado exatamente 1 vez (history)
      expect(insertMock).toHaveBeenCalledTimes(1)

      // Nenhum UPDATE em customer_entitlement
      expect(updateMock).not.toHaveBeenCalled()

      // Nenhum evento de timeline
      expect(emitMock).not.toHaveBeenCalled()
    })
  })

  // ── T4: TE-ENTITLEMENT-GRANTED no reactivate ─────────────────────────────

  describe('given a revoked entitlement and an incoming item for same ref', () => {
    it('when grantFromTransaction then reactivate UPDATE + TE-ENTITLEMENT-GRANTED emitted', async () => {
      const snapshotItems = [
        {
          condition_item_id: '00000000-0000-0000-0000-000000000040',
          kind: 'main',
          product: { id: PRODUCT_ID, name: 'Curso X', slug: 'curso-x', kind: 'course' },
          quantity: 1,
          access_rule: {},
          vigency_months: 12,
          discount: null,
          responsible_user_id: null,
        },
      ]

      // existing revogado
      const existingRow = makeEntitlementRow({ status: 'revoked', ends_at: null })

      const { tx, updateMock } = buildTxMock({
        transactionRow: makeTransaction(),
        snapshotRow: makeSnapshot(snapshotItems),
        existingEntitlement: existingRow,
      })

      await grantFromTransaction(tx, TRANSACTION_ID, emitMock)

      // UPDATE foi chamado
      expect(updateMock).toHaveBeenCalledTimes(1)

      // Emitiu TE-ENTITLEMENT-GRANTED (não EXTENDED — reactivate → GRANTED)
      expect(emitMock).toHaveBeenCalledOnce()
      const emitCall = emitMock.mock.calls[0]![0]
      expect(emitCall.kind).toBe('entitlement_granted')
    })
  })

  // ── T5: TransactionSnapshotNotFoundError ─────────────────────────────────

  describe('given a transaction with no snapshot', () => {
    it('when grantFromTransaction then throws TransactionSnapshotNotFoundError', async () => {
      const { tx } = buildTxMock({
        transactionRow: makeTransaction(),
        snapshotRow: null, // sem snapshot
      })

      await expect(
        grantFromTransaction(tx, TRANSACTION_ID, emitMock),
      ).rejects.toThrow(TransactionSnapshotNotFoundError)
    })
  })

  // ── T6: TransactionNotFoundError ─────────────────────────────────────────

  describe('given a non-existent transactionId', () => {
    it('when grantFromTransaction then throws TransactionNotFoundError', async () => {
      const { tx } = buildTxMock({
        transactionRow: null, // transação não existe
        snapshotRow: null,
      })

      await expect(
        grantFromTransaction(tx, TRANSACTION_ID, emitMock),
      ).rejects.toThrow(TransactionNotFoundError)
    })
  })

  // ── T7: promote_perpetuous emite TE-ENTITLEMENT-EXTENDED ─────────────────

  describe('given an active finite entitlement and an incoming perpetuous item', () => {
    it('when grantFromTransaction then promote_perpetuous UPDATE + TE-ENTITLEMENT-EXTENDED emitted', async () => {
      const snapshotItems = [
        {
          condition_item_id: '00000000-0000-0000-0000-000000000040',
          kind: 'main',
          product: { id: PRODUCT_ID, name: 'Curso X', slug: 'curso-x', kind: 'course' },
          quantity: 1,
          access_rule: {},
          vigency_months: null, // incoming perpetuous (null → perpetuous)
          discount: null,
          responsible_user_id: null,
        },
      ]

      // existing finito
      const existingRow = makeEntitlementRow({
        ends_at: new Date('2026-12-31T00:00:00Z').toISOString(),
      })

      const { tx, updateMock } = buildTxMock({
        transactionRow: makeTransaction(),
        snapshotRow: makeSnapshot(snapshotItems),
        existingEntitlement: existingRow,
      })

      await grantFromTransaction(tx, TRANSACTION_ID, emitMock)

      expect(updateMock).toHaveBeenCalledTimes(1)

      expect(emitMock).toHaveBeenCalledOnce()
      const emitCall = emitMock.mock.calls[0]![0]
      // BR-ENTITLEMENT-CONSOLIDATION: promote_perpetuous emite TE-ENTITLEMENT-EXTENDED
      expect(emitCall.kind).toBe('entitlement_extended')
    })
  })

  // ── T8: múltiplos itens → array com um entitlement por item ──────────────

  describe('given a transaction with two items (product + benefit)', () => {
    it('when grantFromTransaction then returns one entitlement per item', async () => {
      const snapshotItems = [
        {
          condition_item_id: '00000000-0000-0000-0000-000000000041',
          kind: 'main',
          product: { id: PRODUCT_ID, name: 'Curso X', slug: 'curso-x', kind: 'course' },
          quantity: 1,
          access_rule: {},
          vigency_months: 12,
          discount: null,
          responsible_user_id: null,
        },
        {
          condition_item_id: '00000000-0000-0000-0000-000000000042',
          kind: 'commercial_benefit',
          commercial_benefit: { id: BENEFIT_ID, name: 'Grupo VIP', slug: 'grupo-vip' },
          quantity: 1,
          access_rule: {},
          vigency_months: null,
          discount: null,
          responsible_user_id: null,
        },
      ]

      const makeInsertedEntitlement = (
        kind: 'product_access' | 'benefit',
        refId: string,
        id: string,
      ) => ({
        id,
        contactId: CONTACT_ID,
        brandId: BRAND_ID,
        kind,
        refKind: kind === 'product_access' ? 'product' : 'benefit',
        refId,
        quantity: 1,
        startedAt: new Date(),
        endsAt: kind === 'product_access' ? new Date('2027-01-01') : null,
        status: 'active' as const,
        originTransactionId: TRANSACTION_ID,
        lastUpdateTransactionId: TRANSACTION_ID,
        accessRule: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const executeMock = vi.fn().mockResolvedValue([]) // nenhum existing para ambos

      const selectMock = vi.fn()
      let selectCallCount = 0
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          selectCallCount++
          if (selectCallCount === 1) return Promise.resolve([makeTransaction()])
          if (selectCallCount === 2) return Promise.resolve([makeSnapshot(snapshotItems)])
          return Promise.resolve([])
        }),
      }
      selectMock.mockReturnValue(selectChain)

      // The implementation does:
      //   insert(customerEntitlement).values({...}).returning()  → [entitlement]
      //   insert(entitlementHistory).values({...})               → (no returning)
      //
      // For 2 items: 4 insert() calls total.
      // We track only the calls that request returning() — those are entitlement inserts.
      //
      // Since we can't easily detect which table is being inserted at mock time without
      // coupling to Drizzle internals, we use a simple "always provide returning" approach
      // and count how many times returning() is called on customer_entitlement inserts.
      // We do this by counting all insert() calls and using a pattern where:
      //   odd insert() calls (1, 3, ...) = customerEntitlement
      //   even insert() calls (2, 4, ...) = entitlementHistory (no returning)
      let insertCallCount = 0
      const insertMock = vi.fn().mockImplementation(() => {
        insertCallCount++
        const callIndex = insertCallCount

        // Even calls = entitlement_history (no returning needed, but provide it for safety)
        // Odd calls = customer_entitlement (returning provides the row)
        const isEntitlementInsert = callIndex % 2 === 1

        let row: ReturnType<typeof makeInsertedEntitlement> | undefined
        if (isEntitlementInsert) {
          const entIndex = Math.ceil(callIndex / 2)
          row =
            entIndex === 1
              ? makeInsertedEntitlement('product_access', PRODUCT_ID, '00000000-0000-0000-0000-000000000011')
              : makeInsertedEntitlement('benefit', BENEFIT_ID, '00000000-0000-0000-0000-000000000012')
        }

        return {
          values: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(row ? [row] : []),
          }),
        }
      })

      const tx = {
        select: selectMock,
        insert: insertMock,
        update: vi.fn(),
        execute: executeMock,
      } as unknown as DbTx

      const results = await grantFromTransaction(tx, TRANSACTION_ID, emitMock)

      // 1 entitlement por item (2 itens)
      expect(results).toHaveLength(2)

      // SELECT FOR UPDATE chamado 2x (uma por item)
      expect(executeMock).toHaveBeenCalledTimes(2)

      // emit chamado 2x (TE-ENTITLEMENT-GRANTED para cada)
      expect(emitMock).toHaveBeenCalledTimes(2)
      expect(emitMock.mock.calls[0]![0].kind).toBe('entitlement_granted')
      expect(emitMock.mock.calls[1]![0].kind).toBe('entitlement_granted')
    })
  })
})
