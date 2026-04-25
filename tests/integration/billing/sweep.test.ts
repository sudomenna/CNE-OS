/**
 * Testes de integração — MOD-BILLING: installment-sweep (T-9-09)
 *
 * docs/20-domain/13-subscription-billing.md §7 (dunning — sweep de parcelas)
 * docs/20-domain/13-subscription-billing.md §6.2 (transições installment_status)
 *
 * Cenários cobertos:
 *   sweep.marks-overdue          — 3 installments scheduled com due_at no passado → todas viram overdue
 *   sweep.ignores-already-overdue — installment overdue não aparece na query (filtra por 'scheduled')
 *   sweep.ignores-future-due      — installment scheduled com due_at no futuro não é retornada
 *   sweep.idempotent-run          — rodar handler duas vezes → handleInstallmentOverdue chamado
 *                                   apenas para as que voltam na query (idempotência via filtro)
 *
 * Estratégia de mock:
 *   - db é mockado via vi.mock (sem Postgres real).
 *   - handleInstallmentOverdue é mockado via vi.mock para rastrear chamadas.
 *   - O "handler" do Inngest é extraído diretamente da função exportada e
 *     invocado com um step stub para contornar o runtime Inngest.
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

vi.mock('@/lib/domain/billing/handle-installment', () => ({
  handleInstallmentOverdue: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports após mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db/client'
import { handleInstallmentOverdue } from '@/lib/domain/billing/handle-installment'

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

const ID_PAST_1 = '00000000-0000-0000-0000-000000000001'
const ID_PAST_2 = '00000000-0000-0000-0000-000000000002'
const ID_PAST_3 = '00000000-0000-0000-0000-000000000003'

/**
 * Constrói um `step` stub que executa o callback imediatamente.
 * Simula o comportamento do Inngest step.run() em testes unitários.
 */
function buildStep() {
  // step.run(name, fn) — executa fn() e retorna o resultado
  const run: Mock = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
  return { run }
}

/**
 * Extrai e invoca o handler do Inngest diretamente.
 * A função Inngest criada por inngest.createFunction expõe o handler
 * como parte de sua estrutura. Aqui usamos o padrão de invocar a lógica
 * passando um step stub compatível.
 */
async function runSweepHandler(step: ReturnType<typeof buildStep>) {
  // Importação dinâmica para que os mocks já estejam ativos
  const { installmentSweep } = await import(
    '../../../inngest/functions/installment-sweep'
  )

  // O Inngest cria a função com .fn internamente. Acessamos via duck-typing:
  // a estrutura interna expõe o handler em `installmentSweep['fn']` ou similar.
  // Alternativamente, extraímos via @ts-expect-error para testes.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (installmentSweep as any)['fn'] as (ctx: {
    step: typeof step
    event: unknown
    attempt: number
  }) => Promise<unknown>

  return fn({ step, event: {}, attempt: 0 })
}

/**
 * Configura db.select para retornar os rows passados.
 * Encadeia: db.select().from().where()
 */
function mockSelectReturning(rows: { id: string }[]) {
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
 * O tx stub é passado para o callback — handleInstallmentOverdue é mockado,
 * então não precisa de implementação real.
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

describe('installment-sweep (T-9-09)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Resetar módulo para obter fresh import em cada teste (cobre re-runs)
    vi.resetModules()
    ;(handleInstallmentOverdue as Mock).mockResolvedValue(undefined)
  })

  // ── Teste 1 — sweep.marks-overdue ─────────────────────────────────────────
  //
  // Dado 3 installments scheduled com due_at no passado,
  // o handler deve chamar handleInstallmentOverdue para cada uma.

  it(
    'sweep.marks-overdue — ' +
      'given 3 scheduled installments with past due_at ' +
      'when handler runs ' +
      'then handleInstallmentOverdue is called 3 times, once per installment',
    async () => {
      // Arrange
      mockSelectReturning([{ id: ID_PAST_1 }, { id: ID_PAST_2 }, { id: ID_PAST_3 }])
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runSweepHandler(step)

      // Assert
      expect(handleInstallmentOverdue).toHaveBeenCalledTimes(3)
      expect(handleInstallmentOverdue).toHaveBeenCalledWith(expect.anything(), ID_PAST_1)
      expect(handleInstallmentOverdue).toHaveBeenCalledWith(expect.anything(), ID_PAST_2)
      expect(handleInstallmentOverdue).toHaveBeenCalledWith(expect.anything(), ID_PAST_3)
      expect(result).toEqual({ marked: 3 })
    },
  )

  // ── Teste 2 — sweep.ignores-already-overdue ────────────────────────────────
  //
  // A query filtra por status='scheduled' — parcelas já 'overdue' nunca
  // são retornadas. Portanto handleInstallmentOverdue não é chamado para elas.

  it(
    'sweep.ignores-already-overdue — ' +
      'given the query returns 0 rows (overdue filtered out by status=scheduled clause) ' +
      'when handler runs ' +
      'then handleInstallmentOverdue is never called',
    async () => {
      // Arrange — query retorna vazio (overdue não passa no filtro scheduled)
      mockSelectReturning([])
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runSweepHandler(step)

      // Assert
      expect(handleInstallmentOverdue).not.toHaveBeenCalled()
      expect(result).toEqual({ marked: 0 })
    },
  )

  // ── Teste 3 — sweep.ignores-future-due ────────────────────────────────────
  //
  // A query só retorna due_at < now(). Installment com due_at no futuro
  // não é retornada — handleInstallmentOverdue não é chamado para ela.

  it(
    'sweep.ignores-future-due — ' +
      'given the query returns 0 rows (future due_at excluded by lt(due_at, now())) ' +
      'when handler runs ' +
      'then handleInstallmentOverdue is never called and result is { marked: 0 }',
    async () => {
      // Arrange — query retorna vazio (due_at futuro não passa no filtro lt(due_at, now()))
      mockSelectReturning([])
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runSweepHandler(step)

      // Assert
      expect(handleInstallmentOverdue).not.toHaveBeenCalled()
      expect(result).toEqual({ marked: 0 })
    },
  )

  // ── Teste 4 — sweep.idempotent-run ────────────────────────────────────────
  //
  // Rodar o handler duas vezes consecutivas:
  //   - Primeira rodada: query retorna [ID_PAST_1]. handleInstallmentOverdue chamado 1x.
  //   - Segunda rodada: query retorna [] (a installment já é 'overdue', filtrada).
  //     handleInstallmentOverdue NÃO é chamado novamente.
  //
  // O estado final = 1 chamada total, não 2.

  it(
    'sweep.idempotent-run — ' +
      'given first run processes ID_PAST_1 and second run finds empty query ' +
      'when handler runs twice ' +
      'then handleInstallmentOverdue is called exactly once (no duplicate state change)',
    async () => {
      // Arrange
      const dbMock = db as unknown as { select: Mock; transaction: Mock }
      mockTransactionExecute()

      // Primeira rodada: retorna 1 installment scheduled
      const chain1 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: ID_PAST_1 }]),
      }
      // Segunda rodada: retorna vazio (parcela já virou overdue, saiu do filtro)
      const chain2 = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }
      dbMock.select
        .mockReturnValueOnce(chain1)
        .mockReturnValueOnce(chain2)

      const step1 = buildStep()
      const step2 = buildStep()

      // Act — duas rodadas
      const result1 = await runSweepHandler(step1)
      const result2 = await runSweepHandler(step2)

      // Assert
      expect(handleInstallmentOverdue).toHaveBeenCalledTimes(1)
      expect(handleInstallmentOverdue).toHaveBeenCalledWith(expect.anything(), ID_PAST_1)
      expect(result1).toEqual({ marked: 1 })
      expect(result2).toEqual({ marked: 0 })
    },
  )
})
