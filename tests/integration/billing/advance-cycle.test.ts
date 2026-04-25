/**
 * Testes de integração — MOD-BILLING: subscription-advance (T-9-11)
 *
 * docs/20-domain/13-subscription-billing.md §6.1 (transições — avanço de ciclo)
 * docs/50-business-rules/BR-SUBSCRIPTION.md (tabela de decisão)
 * docs/90-meta/03-open-questions-log.md OQ-BILL-02 (renovação atualiza current_period_*)
 *
 * Cenários cobertos:
 *   advance-cycle.trial-expired-no-payment    — trial com trial_ends_at no passado,
 *                                               sem installment pago → past_due
 *   advance-cycle.active-period-end-paid      — active com period_end no passado,
 *                                               installment pago → renova ciclo (active),
 *                                               emite TE-SUBSCRIPTION-RENEWED
 *   advance-cycle.active-period-end-no-payment — active com period_end passado,
 *                                               sem installment, com next_billing_at → past_due
 *   advance-cycle.active-no-renewal           — active com period_end passado,
 *                                               sem next_billing_at → expired
 *   advance-cycle.skips-cancelled             — subscription cancelled não é processada
 *
 * Estratégia de mock:
 *   - db é mockado via vi.mock (sem Postgres real).
 *   - advanceSubscription é mockado via vi.mock para isolar o cron do domínio.
 *   - runSubscriptionAdvance é importado diretamente (não via inngest.createFunction)
 *     e recebe step stub + now injetados.
 *
 * Padrão Given/When/Then
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — DEVEM vir antes de qualquer import do código de produção
// vi.mock faz hoisting automático para o topo do arquivo
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/domain/billing/advance', () => ({
  advanceSubscription: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports após mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db/client'
import { advanceSubscription } from '@/lib/domain/billing/advance'
import { runSubscriptionAdvance } from '@/inngest/functions/subscription-advance'

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

const SUB_TRIAL = '10000000-0000-0000-0000-000000000001'
const SUB_ACTIVE_PAID = '10000000-0000-0000-0000-000000000002'
const SUB_ACTIVE_NO_PAY = '10000000-0000-0000-0000-000000000003'
const SUB_ACTIVE_NO_RENEWAL = '10000000-0000-0000-0000-000000000004'

type SubscriptionRow = { id: string; status: 'trial' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired' }

/**
 * Constrói um `step` stub que executa o callback imediatamente.
 * Simula o comportamento do Inngest step.run() em testes unitários.
 */
function buildStep() {
  const run: Mock = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
  return { run }
}

/**
 * Configura db.select para retornar os rows passados.
 * Encadeia: db.select().from().where()
 */
function mockSelectReturning(rows: SubscriptionRow[]) {
  const dbMock = db as unknown as { select: Mock; transaction: Mock }
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  }
  dbMock.select.mockReturnValue(chain)
  return chain
}

/**
 * Configura db.transaction para executar o callback passando um tx stub.
 */
function mockTransactionExecute() {
  const dbMock = db as unknown as { select: Mock; transaction: Mock }
  dbMock.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({} /* tx stub */)
    },
  )
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('subscription-advance cron (T-9-11)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  // ── Teste 1 — advance-cycle.trial-expired-no-payment ──────────────────
  //
  // Dado subscription trial com trial_ends_at no passado e sem installment pago,
  // advanceSubscription retorna 'past_due'.
  // O cron deve processar a subscription e registrar a transição trial→past_due.

  it(
    'advance-cycle.trial-expired-no-payment — ' +
      'given trial subscription with past trial_ends_at and no paid installment ' +
      'when cron runs ' +
      'then advanceSubscription is called and transition trial→past_due is recorded',
    async () => {
      // Arrange
      const now = new Date('2026-06-01T12:00:00Z')
      mockSelectReturning([{ id: SUB_TRIAL, status: 'trial' }])
      mockTransactionExecute()
      ;(advanceSubscription as Mock).mockResolvedValue('past_due')
      const step = buildStep()

      // Act
      const result = await runSubscriptionAdvance(step, now)

      // Assert
      expect(advanceSubscription).toHaveBeenCalledTimes(1)
      expect(advanceSubscription).toHaveBeenCalledWith(
        expect.anything(), // tx stub
        SUB_TRIAL,
        now,
      )
      expect(result).toEqual({
        processed: 1,
        transitions: { 'trial→past_due': 1 },
      })
    },
  )

  // ── Teste 2 — advance-cycle.active-period-end-paid ────────────────────
  //
  // Dado subscription active com current_period_end no passado e installment pago,
  // advanceSubscription renova o ciclo e retorna 'active' (emite TE-SUBSCRIPTION-RENEWED
  // internamente no domínio — não verificado aqui pois advanceSubscription é mockada).
  // O cron deve processar sem registrar transição (status permanece active).

  it(
    'advance-cycle.active-period-end-paid — ' +
      'given active subscription with past period_end and paid installment ' +
      'when cron runs ' +
      'then advanceSubscription is called and no transition is recorded (status stays active)',
    async () => {
      // Arrange
      const now = new Date('2026-06-01T12:00:00Z')
      mockSelectReturning([{ id: SUB_ACTIVE_PAID, status: 'active' }])
      mockTransactionExecute()
      // advanceSubscription renova período e retorna 'active' (ciclo renovado)
      // TE-SUBSCRIPTION-RENEWED é emitido internamente pelo domínio
      ;(advanceSubscription as Mock).mockResolvedValue('active')
      const step = buildStep()

      // Act
      const result = await runSubscriptionAdvance(step, now)

      // Assert
      expect(advanceSubscription).toHaveBeenCalledTimes(1)
      expect(advanceSubscription).toHaveBeenCalledWith(
        expect.anything(),
        SUB_ACTIVE_PAID,
        now,
      )
      // status active → active: sem mudança de status, transitions vazio
      expect(result).toEqual({
        processed: 1,
        transitions: {},
      })
    },
  )

  // ── Teste 3 — advance-cycle.active-period-end-no-payment ─────────────
  //
  // Dado subscription active com current_period_end no passado, sem installment pago
  // e com next_billing_at (renovação automática), advanceSubscription retorna 'past_due'.
  // O cron registra transição active→past_due.

  it(
    'advance-cycle.active-period-end-no-payment — ' +
      'given active subscription with past period_end, no paid installment, next_billing_at set ' +
      'when cron runs ' +
      'then advanceSubscription is called and transition active→past_due is recorded',
    async () => {
      // Arrange
      const now = new Date('2026-06-01T12:00:00Z')
      mockSelectReturning([{ id: SUB_ACTIVE_NO_PAY, status: 'active' }])
      mockTransactionExecute()
      ;(advanceSubscription as Mock).mockResolvedValue('past_due')
      const step = buildStep()

      // Act
      const result = await runSubscriptionAdvance(step, now)

      // Assert
      expect(advanceSubscription).toHaveBeenCalledTimes(1)
      expect(advanceSubscription).toHaveBeenCalledWith(
        expect.anything(),
        SUB_ACTIVE_NO_PAY,
        now,
      )
      expect(result).toEqual({
        processed: 1,
        transitions: { 'active→past_due': 1 },
      })
    },
  )

  // ── Teste 4 — advance-cycle.active-no-renewal ─────────────────────────
  //
  // Dado subscription active com current_period_end no passado e sem next_billing_at
  // (ciclo finito sem renovação automática), advanceSubscription retorna 'expired'.
  // O cron registra transição active→expired.

  it(
    'advance-cycle.active-no-renewal — ' +
      'given active subscription with past period_end and no next_billing_at ' +
      'when cron runs ' +
      'then advanceSubscription is called and transition active→expired is recorded',
    async () => {
      // Arrange
      const now = new Date('2026-06-01T12:00:00Z')
      mockSelectReturning([{ id: SUB_ACTIVE_NO_RENEWAL, status: 'active' }])
      mockTransactionExecute()
      ;(advanceSubscription as Mock).mockResolvedValue('expired')
      const step = buildStep()

      // Act
      const result = await runSubscriptionAdvance(step, now)

      // Assert
      expect(advanceSubscription).toHaveBeenCalledTimes(1)
      expect(advanceSubscription).toHaveBeenCalledWith(
        expect.anything(),
        SUB_ACTIVE_NO_RENEWAL,
        now,
      )
      expect(result).toEqual({
        processed: 1,
        transitions: { 'active→expired': 1 },
      })
    },
  )

  // ── Teste 5 — advance-cycle.skips-cancelled ───────────────────────────
  //
  // Subscriptions com status 'cancelled' não são retornadas pela query
  // (filtradas pelo IN ('trial','active','past_due')).
  // advanceSubscription não deve ser chamada.

  it(
    'advance-cycle.skips-cancelled — ' +
      'given cancelled subscription (filtered out by query status IN clause) ' +
      'when cron runs ' +
      'then advanceSubscription is never called and processed=0',
    async () => {
      // Arrange — query retorna vazio: cancelled foi filtrada pelo WHERE IN
      const now = new Date('2026-06-01T12:00:00Z')
      mockSelectReturning([]) // cancelled não aparece na query
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runSubscriptionAdvance(step, now)

      // Assert
      expect(advanceSubscription).not.toHaveBeenCalled()
      expect(result).toEqual({ processed: 0, transitions: {} })
    },
  )

  // ── Teste 6 — advance-cycle.multiple-subscriptions ────────────────────
  //
  // Múltiplas subscriptions em estados diferentes processadas em uma rodada:
  // step.run é chamado N+1 vezes (1 fetch + N advance).

  it(
    'advance-cycle.multiple-subscriptions — ' +
      'given 3 subscriptions eligible for advance ' +
      'when cron runs ' +
      'then advanceSubscription is called 3 times and processed=3',
    async () => {
      // Arrange
      const now = new Date('2026-06-01T12:00:00Z')
      mockSelectReturning([
        { id: SUB_TRIAL, status: 'trial' },
        { id: SUB_ACTIVE_NO_PAY, status: 'active' },
        { id: SUB_ACTIVE_NO_RENEWAL, status: 'active' },
      ])
      mockTransactionExecute()
      // Cada subscription avança para status diferente
      ;(advanceSubscription as Mock)
        .mockResolvedValueOnce('past_due')  // trial → past_due
        .mockResolvedValueOnce('past_due')  // active → past_due
        .mockResolvedValueOnce('expired')   // active → expired
      const step = buildStep()

      // Act
      const result = await runSubscriptionAdvance(step, now)

      // Assert
      expect(advanceSubscription).toHaveBeenCalledTimes(3)
      expect(result).toEqual({
        processed: 3,
        transitions: {
          'trial→past_due': 1,
          'active→past_due': 1,
          'active→expired': 1,
        },
      })
    },
  )

  // ── Teste 7 — advance-cycle.idempotent-run ────────────────────────────
  //
  // Rodar o handler duas vezes:
  //   - Primeira rodada: query retorna [SUB_TRIAL], advanceSubscription chamada 1x.
  //   - Segunda rodada: query retorna [] (subscription já avançou, saiu dos status elegíveis).
  //     advanceSubscription NÃO é chamada novamente.

  it(
    'advance-cycle.idempotent-run — ' +
      'given first run processes SUB_TRIAL and second run finds empty query ' +
      'when handler runs twice ' +
      'then advanceSubscription is called exactly once (no duplicate state change)',
    async () => {
      // Arrange
      const now = new Date('2026-06-01T12:00:00Z')
      const dbMock = db as unknown as { select: Mock; transaction: Mock }
      mockTransactionExecute()

      // Primeira rodada: retorna 1 subscription
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: SUB_TRIAL, status: 'trial' as const }]),
      }
      // Segunda rodada: retorna vazio (subscription já em past_due, fora do elegível para trial)
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      dbMock.select
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      ;(advanceSubscription as Mock).mockResolvedValue('past_due')

      const step1 = buildStep()
      const step2 = buildStep()

      // Act — duas rodadas
      const result1 = await runSubscriptionAdvance(step1, now)
      const result2 = await runSubscriptionAdvance(step2, now)

      // Assert
      expect(advanceSubscription).toHaveBeenCalledTimes(1)
      expect(advanceSubscription).toHaveBeenCalledWith(expect.anything(), SUB_TRIAL, now)
      expect(result1).toEqual({ processed: 1, transitions: { 'trial→past_due': 1 } })
      expect(result2).toEqual({ processed: 0, transitions: {} })
    },
  )
})
