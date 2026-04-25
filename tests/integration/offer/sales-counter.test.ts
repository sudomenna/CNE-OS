/**
 * T-6-15 — incrementSalesCounter integration tests
 *
 * docs/20-domain/10-offer-engine.md §3.7 (concurrency)
 * ADR-07: aceitar excesso em race — sem verificação de limite nesta função
 *
 * Todos os testes usam mock de `tx` — sem banco real.
 * A atomicidade real é garantida pelo UPDATE ... RETURNING do Postgres;
 * aqui verificamos o comportamento esperado da função de domínio.
 *
 * Cenários cobertos:
 *  1. Incremento básico — retorna approved_count pós-incremento
 *  2. Counter não encontrado — lança OfferCounterNotFoundError
 *  3. Incremento aceita valores altos (ADR-07: sem limite)
 *  4. Concorrência simulada (10 chamadas simultâneas com mocks) — monotônico
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { incrementSalesCounter } from '@/lib/domain/offer/sales-counter'
import { OfferCounterNotFoundError } from '@/lib/domain/offer/errors'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Mock factory — simula o comportamento de tx.update(...).set(...).where(...).returning()
// ---------------------------------------------------------------------------

/**
 * Constrói um mock de `tx` que retorna `returnedRows` no final da chain.
 * Suporta a chain: tx.update(table).set(values).where(cond).returning(cols)
 */
function makeTxMock(returnedRows: { approvedCount: number }[]): DbTx {
  const returningFn = vi.fn().mockResolvedValue(returnedRows)
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
  const setFn = vi.fn().mockReturnValue({ where: whereFn })
  const updateFn = vi.fn().mockReturnValue({ set: setFn })

  return { update: updateFn } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const OFFER_ID = '00000000-0000-0000-0000-000000000001'

// ---------------------------------------------------------------------------
// describe: incrementSalesCounter
// ---------------------------------------------------------------------------

describe('incrementSalesCounter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── BR-1: Incremento básico ───────────────────────────────────────────────

  describe('given a valid offer_sales_counter row', () => {
    it('when increment called then returns new approved_count', async () => {
      const tx = makeTxMock([{ approvedCount: 1 }])

      const result = await incrementSalesCounter(tx, OFFER_ID)

      expect(result).toBe(1)
    })

    it('when called a second time then returns incremented value (2)', async () => {
      const tx = makeTxMock([{ approvedCount: 2 }])

      const result = await incrementSalesCounter(tx, OFFER_ID)

      expect(result).toBe(2)
    })

    it('when called then uses UPDATE ... RETURNING pattern (not SELECT then UPDATE)', async () => {
      // Verifica que a função chama tx.update (não tx.select) — padrão UPDATE RETURNING.
      const tx = makeTxMock([{ approvedCount: 5 }])

      await incrementSalesCounter(tx, OFFER_ID)

      // tx.update deve ter sido chamado com a tabela offer_sales_counter
      expect((tx as unknown as { update: ReturnType<typeof vi.fn> }).update).toHaveBeenCalledOnce()
      // tx.select NÃO deve existir ou ter sido chamado
      expect(
        (tx as unknown as { select?: ReturnType<typeof vi.fn> }).select,
      ).toBeUndefined()
    })
  })

  // ── BR-2: Counter não encontrado ─────────────────────────────────────────

  describe('given no offer_sales_counter row for offerId', () => {
    it('when increment called then throws OfferCounterNotFoundError', async () => {
      const tx = makeTxMock([]) // UPDATE RETURNING vazio = linha não existia

      await expect(incrementSalesCounter(tx, OFFER_ID)).rejects.toThrow(
        OfferCounterNotFoundError,
      )
    })

    it('when increment called then error message contains offerId', async () => {
      const tx = makeTxMock([])

      await expect(incrementSalesCounter(tx, OFFER_ID)).rejects.toMatchObject({
        offerId: OFFER_ID,
        name: 'OfferCounterNotFoundError',
      })
    })
  })

  // ── BR-3: ADR-07 — sem limite (aceita valores altos) ─────────────────────

  describe('ADR-07: given high approved_count values', () => {
    it('when counter is at 29 then returns 30 without error', async () => {
      const tx = makeTxMock([{ approvedCount: 30 }])

      const result = await incrementSalesCounter(tx, OFFER_ID)

      expect(result).toBe(30)
    })

    it('when counter is at 30 then returns 31 (accepts over-approval per ADR-07)', async () => {
      // ADR-07: excesso aceito — sem verificação de limite nesta função
      const tx = makeTxMock([{ approvedCount: 31 }])

      const result = await incrementSalesCounter(tx, OFFER_ID)

      expect(result).toBe(31)
    })

    it('when counter is very high (1_000_000) then returns 1_000_001 without error', async () => {
      // bigint seguro até Number.MAX_SAFE_INTEGER — teste de escala
      const tx = makeTxMock([{ approvedCount: 1_000_001 }])

      const result = await incrementSalesCounter(tx, OFFER_ID)

      expect(result).toBe(1_000_001)
    })
  })

  // ── BR-4: Concorrência simulada — valores monotônicos ────────────────────

  describe('simulated concurrency: 10 simultaneous increments', () => {
    it('when 10 calls race then each returns a distinct monotonically increasing value', async () => {
      /**
       * A atomicidade real é garantida pelo UPDATE RETURNING do Postgres.
       * Este teste simula 10 chamadas concorrentes onde cada mock retorna
       * o próximo valor na sequência — verificando que o comportamento
       * esperado é monotônico e sem repetições.
       *
       * Em produção, Postgres serializa o UPDATE na mesma linha, portanto
       * o contador nunca decresce e nunca retorna o mesmo valor duas vezes.
       */

      // Simula um contador compartilhado que cresce atomicamente
      let sharedCounter = 0

      // Cada chamada a `tx.update(...).returning()` retorna o próximo valor
      const makeAtomicTx = (): DbTx => {
        const returningFn = vi.fn().mockImplementation(() => {
          sharedCounter++
          return Promise.resolve([{ approvedCount: sharedCounter }])
        })
        const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
        const setFn = vi.fn().mockReturnValue({ where: whereFn })
        const updateFn = vi.fn().mockReturnValue({ set: setFn })
        return { update: updateFn } as unknown as DbTx
      }

      // Despacha 10 chamadas simultâneas, cada uma com seu próprio tx mock
      const calls = Array.from({ length: 10 }, () =>
        incrementSalesCounter(makeAtomicTx(), OFFER_ID),
      )
      const results = await Promise.all(calls)

      // Todos os valores devem ser positivos e únicos
      expect(results).toHaveLength(10)
      const sorted = [...results].sort((a, b) => a - b)

      // Monotônico: cada valor é maior que o anterior
      for (let i = 1; i < sorted.length; i++) {
        const curr = sorted[i] ?? 0
        const prev = sorted[i - 1] ?? 0
        expect(curr).toBeGreaterThan(prev)
      }

      // Nenhum valor ≤ 0 (counter começa em 0, primeiro incremento retorna 1)
      const minValue = results.reduce((min, v) => (v < min ? v : min), results[0] ?? 0)
      expect(minValue).toBeGreaterThan(0)
    })

    it('when 10 calls race then no result is 0 or negative (counter only grows)', async () => {
      let counter = 0
      const calls = Array.from({ length: 10 }, () => {
        const returningFn = vi.fn().mockImplementation(() => {
          counter++
          return Promise.resolve([{ approvedCount: counter }])
        })
        const whereFn = vi.fn().mockReturnValue({ returning: returningFn })
        const setFn = vi.fn().mockReturnValue({ where: whereFn })
        const updateFn = vi.fn().mockReturnValue({ set: setFn })
        const tx = { update: updateFn } as unknown as DbTx
        return incrementSalesCounter(tx, OFFER_ID)
      })
      const results = await Promise.all(calls)

      // INV-OFFER-09: approved_count é monotônico — nunca decresce
      for (const value of results) {
        expect(value).toBeGreaterThan(0)
      }
    })
  })
})
