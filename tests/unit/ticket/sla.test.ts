/**
 * Testes unitários — computeFirstResponseSla
 *
 * docs/60-flows/13-ticket-lifecycle.md §SLA
 * T-13-24 — FLOW-13: SLA primeira resposta (≤15min badge)
 *
 * Função pura — sem mocks de DB ou timeline.
 * Cobre todos os 4 ramos exigidos pelo critério de aceite:
 *  1. firstRespondedAt = null → pending
 *  2. Resposta em 10min → met
 *  3. Resposta em 20min → violated
 *  4. Exatamente 15min → met (borda inclusiva)
 */
import { describe, it, expect } from 'vitest'
import { computeFirstResponseSla, FIRST_RESPONSE_SLA_MS } from '../../../lib/domain/ticket/sla'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cria uma data base arbitrária para openedAt */
const BASE_DATE = new Date('2026-04-26T10:00:00.000Z')

/** Retorna uma data N milissegundos após BASE_DATE */
function plusMs(ms: number): Date {
  return new Date(BASE_DATE.getTime() + ms)
}

const MIN = 60 * 1000 // 1 minuto em ms

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-TICKET-SLA', () => {
  // ── Ramo 1: sem firstRespondedAt → pending ────────────────────────────────

  describe('computeFirstResponseSla', () => {
    it(
      'given no firstRespondedAt ' +
        'when computeFirstResponseSla ' +
        'then returns pending',
      () => {
        const result = computeFirstResponseSla({
          openedAt: BASE_DATE,
          firstRespondedAt: null,
          status: 'open',
        })
        expect(result).toBe('pending')
      },
    )

    // ── Ramo 2: resposta em 10min → met ──────────────────────────────────────

    it(
      'given firstRespondedAt 10 minutes after openedAt ' +
        'when computeFirstResponseSla ' +
        'then returns met',
      () => {
        const result = computeFirstResponseSla({
          openedAt: BASE_DATE,
          firstRespondedAt: plusMs(10 * MIN),
          status: 'in_progress',
        })
        expect(result).toBe('met')
      },
    )

    // ── Ramo 3: resposta em 20min → violated ─────────────────────────────────

    it(
      'given firstRespondedAt 20 minutes after openedAt ' +
        'when computeFirstResponseSla ' +
        'then returns violated',
      () => {
        const result = computeFirstResponseSla({
          openedAt: BASE_DATE,
          firstRespondedAt: plusMs(20 * MIN),
          status: 'in_progress',
        })
        expect(result).toBe('violated')
      },
    )

    // ── Ramo 4: exatamente 15min → met (borda inclusiva) ─────────────────────

    it(
      'given firstRespondedAt exactly 15 minutes after openedAt ' +
        'when computeFirstResponseSla ' +
        'then returns met (inclusive boundary)',
      () => {
        const result = computeFirstResponseSla({
          openedAt: BASE_DATE,
          firstRespondedAt: plusMs(FIRST_RESPONSE_SLA_MS),
          status: 'in_progress',
        })
        expect(result).toBe('met')
      },
    )

    // ── Ramo extra: 15min + 1ms → violated (logo além da borda) ──────────────

    it(
      'given firstRespondedAt 15 minutes and 1 millisecond after openedAt ' +
        'when computeFirstResponseSla ' +
        'then returns violated',
      () => {
        const result = computeFirstResponseSla({
          openedAt: BASE_DATE,
          firstRespondedAt: plusMs(FIRST_RESPONSE_SLA_MS + 1),
          status: 'in_progress',
        })
        expect(result).toBe('violated')
      },
    )

    // ── Ramo extra: ticket resolvido mas sem firstRespondedAt → pending ───────

    it(
      'given resolved ticket with no firstRespondedAt ' +
        'when computeFirstResponseSla ' +
        'then returns pending (status does not affect SLA)',
      () => {
        const result = computeFirstResponseSla({
          openedAt: BASE_DATE,
          firstRespondedAt: null,
          status: 'resolved',
        })
        expect(result).toBe('pending')
      },
    )

    // ── Ramo extra: resposta imediata (0ms) → met ─────────────────────────────

    it(
      'given firstRespondedAt equal to openedAt (0ms diff) ' +
        'when computeFirstResponseSla ' +
        'then returns met',
      () => {
        const result = computeFirstResponseSla({
          openedAt: BASE_DATE,
          firstRespondedAt: BASE_DATE,
          status: 'in_progress',
        })
        expect(result).toBe('met')
      },
    )
  })
})
