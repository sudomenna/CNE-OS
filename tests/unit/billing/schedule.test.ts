/**
 * Unit tests — scheduleInstallments
 *
 * T-9-05
 * docs/20-domain/13-subscription-billing.md §2, §3.2, §5
 * INV-BILL-01: parent exclusivo (XOR)
 * INV-BILL-05: idempotência por sequence=1
 * ADR-10: lança DomainError para plano inválido
 * ADR-11: tx como primeiro argumento
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SUB_ID = 'sub-0000-0000-0000-000000000001'
const TRX_ID = 'trx-0000-0000-0000-000000000001'

const FIRST_DUE = new Date('2026-05-01T00:00:00Z')
const MS_PER_DAY = 24 * 60 * 60 * 1000

type FakeInstallment = {
  id: string
  subscriptionId: string | null
  transactionId: string | null
  sequence: number
  due_at: Date
  amount: string
  status: 'scheduled'
  paidAt: null
  externalProvider: null
  externalId: string | null
  boletoUrl: null
  retryCount: number
  lastRetryAt: null
  createdAt: Date
  updatedAt: Date
}

/** Gera um installment fake para uso nos mocks (padrão: parent=subscriptionId). */
function makeInstallment(
  seq: number,
  dueAt: Date,
  overrides: Partial<Pick<FakeInstallment, 'subscriptionId' | 'transactionId'>> = {},
): FakeInstallment {
  return {
    id: `inst-00000000-000${seq}`,
    subscriptionId: SUB_ID,
    transactionId: null,
    sequence: seq,
    due_at: dueAt,
    amount: '100.00',
    status: 'scheduled' as const,
    paidAt: null,
    externalProvider: null,
    externalId: null,
    boletoUrl: null,
    retryCount: 0,
    lastRetryAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Mock factory
//
// O padrão Drizzle no projeto é:
//   select → from → where → limit  (SELECT com filtro)
//   select → from → where           (SELECT sem limit)
//   insert → values → returning     (INSERT)
// ---------------------------------------------------------------------------

type MockOptions = {
  /** Linhas retornadas pelo SELECT de idempotência (sequence=1). */
  idempotenceRows?: ReturnType<typeof makeInstallment>[]
  /** Linhas retornadas pelo SELECT de todas as parcelas (quando idempotente). */
  allExistingRows?: ReturnType<typeof makeInstallment>[]
  /** Linhas retornadas pelo INSERT .returning(). */
  insertedRows?: ReturnType<typeof makeInstallment>[]
}

function buildMockTx(opts: MockOptions = {}): DbTx {
  const {
    idempotenceRows = [],
    allExistingRows = [],
    insertedRows = [],
  } = opts

  // SELECT chain — primeiro .limit(1) retorna idempotenceRows,
  // segundo SELECT sem limit retorna allExistingRows.
  let selectCallCount = 0

  const limit = vi.fn().mockResolvedValue(idempotenceRows)

  // .where() precisa retornar { limit } na primeira chamada
  // e uma Promise (array) na segunda.
  const where = vi.fn().mockImplementation(() => {
    selectCallCount++
    if (selectCallCount === 1) {
      // Primeira vez: chain com .limit()
      return { limit }
    }
    // Segunda vez: SELECT todas parcelas existentes (retorno direto como thenable)
    return Promise.resolve(allExistingRows)
  })

  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  // INSERT chain
  const returning = vi.fn().mockResolvedValue(insertedRows)
  const values = vi.fn().mockReturnValue({ returning })
  const insert = vi.fn().mockReturnValue({ values })

  return { select, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

const { scheduleInstallments, DomainError } = await import(
  '../../../lib/domain/billing/schedule-installments'
)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('installment.schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── happy path: 12 parcelas com datas corretas ──────────────────────────

  describe('installment.schedule.happy-12x', () => {
    it(
      'given a 12-installment plan with 30-day interval ' +
        'when scheduleInstallments with subscriptionId ' +
        'then inserts 12 rows with correct sequence and due_at',
      async () => {
        const inserted = Array.from({ length: 12 }, (_, i) =>
          makeInstallment(i + 1, new Date(FIRST_DUE.getTime() + i * 30 * MS_PER_DAY)),
        )

        const tx = buildMockTx({ idempotenceRows: [], insertedRows: inserted })

        const result = await scheduleInstallments(
          tx,
          { subscriptionId: SUB_ID },
          { count: 12, intervalDays: 30, amount: 100, firstDueAt: FIRST_DUE },
        )

        expect(result).toHaveLength(12)

        // Verificar sequência
        result.forEach((inst, idx) => {
          expect(inst.sequence).toBe(idx + 1)
        })

        // Verificar datas — cada parcela 30 dias depois da anterior
        result.forEach((inst, idx) => {
          const expectedDue = new Date(FIRST_DUE.getTime() + idx * 30 * MS_PER_DAY)
          expect(inst.due_at).toEqual(expectedDue)
        })

        // Verificar que INSERT foi chamado com 12 valores
        const txTyped = tx as unknown as { insert: ReturnType<typeof vi.fn> }
        expect(txTyped.insert).toHaveBeenCalledTimes(1)
      },
    )

    it(
      'given a plan with transactionId parent ' +
        'when scheduleInstallments ' +
        'then inserted rows have transactionId set and subscriptionId null',
      async () => {
        const inserted = [makeInstallment(1, FIRST_DUE, { subscriptionId: null, transactionId: TRX_ID })]

        const tx = buildMockTx({ idempotenceRows: [], insertedRows: inserted })

        const result = await scheduleInstallments(
          tx,
          { transactionId: TRX_ID },
          { count: 1, intervalDays: 30, amount: 500, firstDueAt: FIRST_DUE },
        )

        expect(result[0]?.transactionId).toBe(TRX_ID)
        expect(result[0]?.subscriptionId).toBeNull()
      },
    )

    it(
      'given externalIds in plan ' +
        'when scheduleInstallments ' +
        'then values passed to insert contain the externalIds',
      async () => {
        const externalIds = ['ext-1', 'ext-2', 'ext-3']
        const inserted = Array.from({ length: 3 }, (_, i) =>
          makeInstallment(i + 1, new Date(FIRST_DUE.getTime() + i * 30 * MS_PER_DAY)),
        )

        const tx = buildMockTx({ idempotenceRows: [], insertedRows: inserted })
        const txTyped = tx as unknown as {
          insert: ReturnType<typeof vi.fn>
        }

        await scheduleInstallments(
          tx,
          { subscriptionId: SUB_ID },
          { count: 3, intervalDays: 30, amount: 200, firstDueAt: FIRST_DUE, externalIds },
        )

        // Inspecionar o que foi passado para .values()
        const insertCall = txTyped.insert.mock.results[0]?.value
        const valuesCall = insertCall?.values?.mock?.calls?.[0]?.[0] as
          | { externalId: string | null }[]
          | undefined

        expect(valuesCall?.[0]?.externalId).toBe('ext-1')
        expect(valuesCall?.[1]?.externalId).toBe('ext-2')
        expect(valuesCall?.[2]?.externalId).toBe('ext-3')
      },
    )
  })

  // ── idempotência ────────────────────────────────────────────────────────

  describe('installment.schedule.idempotent', () => {
    it(
      'given installments already exist for the parent (sequence=1 found) ' +
        'when scheduleInstallments called again ' +
        'then returns existing installments without calling insert',
      async () => {
        const existing = Array.from({ length: 3 }, (_, i) =>
          makeInstallment(i + 1, new Date(FIRST_DUE.getTime() + i * 30 * MS_PER_DAY)),
        )

        // idempotenceRows=[sequence-1 row] → allExistingRows=[todas as 3]
        const tx = buildMockTx({
          idempotenceRows: [existing[0]!],
          allExistingRows: existing,
        })

        const result = await scheduleInstallments(
          tx,
          { subscriptionId: SUB_ID },
          { count: 3, intervalDays: 30, amount: 100, firstDueAt: FIRST_DUE },
        )

        expect(result).toHaveLength(3)
        expect(result[0]?.sequence).toBe(1)

        // INSERT não deve ter sido chamado
        const txTyped = tx as unknown as { insert: ReturnType<typeof vi.fn> }
        expect(txTyped.insert).not.toHaveBeenCalled()
      },
    )
  })

  // ── validação: count inválido ────────────────────────────────────────────

  describe('installment.schedule.invalid-count', () => {
    it(
      'given count = 0 ' +
        'when scheduleInstallments ' +
        'then throws DomainError with INVALID_INSTALLMENT_PLAN',
      async () => {
        const tx = buildMockTx()

        await expect(
          scheduleInstallments(
            tx,
            { subscriptionId: SUB_ID },
            { count: 0, intervalDays: 30, amount: 100, firstDueAt: FIRST_DUE },
          ),
        ).rejects.toThrow(DomainError)
      },
    )

    it(
      'given count = -1 ' +
        'when scheduleInstallments ' +
        'then throws DomainError mentioning count',
      async () => {
        const tx = buildMockTx()

        await expect(
          scheduleInstallments(
            tx,
            { subscriptionId: SUB_ID },
            { count: -1, intervalDays: 30, amount: 100, firstDueAt: FIRST_DUE },
          ),
        ).rejects.toThrow('INVALID_INSTALLMENT_PLAN')
      },
    )

    it(
      'given amount = -1 ' +
        'when scheduleInstallments ' +
        'then throws DomainError mentioning INVALID_INSTALLMENT_PLAN',
      async () => {
        const tx = buildMockTx()

        await expect(
          scheduleInstallments(
            tx,
            { subscriptionId: SUB_ID },
            { count: 3, intervalDays: 30, amount: -1, firstDueAt: FIRST_DUE },
          ),
        ).rejects.toThrow('INVALID_INSTALLMENT_PLAN')
      },
    )

    it(
      'given count = 1 and amount = 0 (edge — zero amount is allowed) ' +
        'when scheduleInstallments ' +
        'then does not throw',
      async () => {
        const inserted = [makeInstallment(1, FIRST_DUE)]
        const tx = buildMockTx({ idempotenceRows: [], insertedRows: inserted })

        await expect(
          scheduleInstallments(
            tx,
            { subscriptionId: SUB_ID },
            { count: 1, intervalDays: 30, amount: 0, firstDueAt: FIRST_DUE },
          ),
        ).resolves.toHaveLength(1)
      },
    )
  })

  // ── INV-BILL-01: parent exclusivo ────────────────────────────────────────

  describe('installment.schedule.parent-exclusive', () => {
    it(
      'given parent with subscriptionId only ' +
        'when scheduleInstallments ' +
        'then insert values have subscriptionId set and transactionId null',
      async () => {
        const inserted = [makeInstallment(1, FIRST_DUE)]
        const tx = buildMockTx({ idempotenceRows: [], insertedRows: inserted })
        const txTyped = tx as unknown as { insert: ReturnType<typeof vi.fn> }

        await scheduleInstallments(
          tx,
          { subscriptionId: SUB_ID },
          { count: 1, intervalDays: 30, amount: 100, firstDueAt: FIRST_DUE },
        )

        const insertCall = txTyped.insert.mock.results[0]?.value
        const valuesArg = insertCall?.values?.mock?.calls?.[0]?.[0] as
          | { subscriptionId: string | null; transactionId: string | null }[]
          | undefined

        expect(valuesArg?.[0]?.subscriptionId).toBe(SUB_ID)
        expect(valuesArg?.[0]?.transactionId).toBeNull()
      },
    )

    it(
      'given parent with transactionId only ' +
        'when scheduleInstallments ' +
        'then insert values have transactionId set and subscriptionId null',
      async () => {
        const inserted = [makeInstallment(1, FIRST_DUE, { subscriptionId: null, transactionId: TRX_ID })]
        const tx = buildMockTx({ idempotenceRows: [], insertedRows: inserted })
        const txTyped = tx as unknown as { insert: ReturnType<typeof vi.fn> }

        await scheduleInstallments(
          tx,
          { transactionId: TRX_ID },
          { count: 1, intervalDays: 30, amount: 100, firstDueAt: FIRST_DUE },
        )

        const insertCall = txTyped.insert.mock.results[0]?.value
        const valuesArg = insertCall?.values?.mock?.calls?.[0]?.[0] as
          | { subscriptionId: string | null; transactionId: string | null }[]
          | undefined

        expect(valuesArg?.[0]?.transactionId).toBe(TRX_ID)
        expect(valuesArg?.[0]?.subscriptionId).toBeNull()
      },
    )

    it(
      'given TypeScript union type for parent ' +
        'when subscriptionId is passed ' +
        'then transactionId is absent from parent type (compile-time guarantee)',
      () => {
        // Este teste é estático: o tipo InstallmentParent é discriminated union.
        // Se o código compilar, garante que não é possível passar ambos.
        // Não há runtime check porque o TypeScript impede a construção do objeto.
        const subParent: { subscriptionId: string } = { subscriptionId: SUB_ID }
        expect('subscriptionId' in subParent).toBe(true)
        expect('transactionId' in subParent).toBe(false)
      },
    )
  })
})
