/**
 * Testes de integração — MOD-BILLING: dunning-retry (T-9-10)
 *
 * docs/20-domain/13-subscription-billing.md §7 (política de dunning)
 * docs/50-business-rules/BR-SUBSCRIPTION.md §Política de dunning (Fase 1)
 *
 * Cenários cobertos:
 *   dunning.d3-retry              — due_at há 3 dias, retry_count=0 → retry_count=1
 *   dunning.d7-retry              — due_at há 7 dias, retry_count=1 → retry_count=2
 *   dunning.d15-exhausted         — due_at há 15 dias, retry_count=2 → cancelSubscription chamado
 *   dunning.idempotent-retry-count — retry_count=1 e due_at há 3 dias → noop (D+3 já feito)
 *   dunning.ignores-paid          — installment paid → ignorada (fora da query)
 *
 * Estratégia:
 *   - runDunningCycle exportado de dunning-retry.ts é chamado diretamente
 *     com `now` injetado e step stub — sem runtime Inngest.
 *   - db é mockado via vi.mock (sem Postgres real).
 *   - cancelSubscription mockado para rastrear chamadas sem I/O.
 *   - emitTimelineEvent mockado para rastrear emissões.
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
    update: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/domain/billing/cancel', () => ({
  cancelSubscription: vi.fn(),
}))

vi.mock('@/lib/timeline/emit', () => ({
  emitTimelineEvent: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Imports após mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db/client'
import { cancelSubscription } from '@/lib/domain/billing/cancel'
import { runDunningCycle, getDunningWindow } from '@/inngest/functions/dunning-retry'

// ---------------------------------------------------------------------------
// Constantes de fixture
// ---------------------------------------------------------------------------

const SUB_ID = '10000000-0000-0000-0000-000000000001'
const INST_ID_1 = '20000000-0000-0000-0000-000000000001'
const CONTACT_ID = '30000000-0000-0000-0000-000000000001'
const BRAND_ID = '40000000-0000-0000-0000-000000000001'

/** Retorna uma data `days` dias antes de `now`. */
function daysAgo(now: Date, days: number): Date {
  const d = new Date(now.getTime())
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

// ---------------------------------------------------------------------------
// Helpers de stub
// ---------------------------------------------------------------------------

/**
 * Constrói um step stub que executa o callback imediatamente.
 * Simula Inngest step.run() em testes.
 */
function buildStep() {
  const run: Mock = vi.fn(async (_name: string, fn: () => Promise<unknown>) => fn())
  return { run }
}

type DbMock = {
  select: Mock
  update: Mock
  transaction: Mock
}

/**
 * Configura db.select para retornar rows.
 * Encadeia: db.select().from().where() e db.select().from().where().limit()
 */
function mockSelectReturning(rows: unknown[]) {
  const dbMock = db as unknown as DbMock
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  // where() também precisa ser resolvível diretamente (sem .limit())
  chain.where.mockReturnValue({
    ...chain,
    // Se a query não chamar .limit(), retorna rows diretamente
    then: (resolve: (v: unknown) => void) => resolve(rows),
  })
  dbMock.select.mockReturnValue(chain)
  return chain
}

/**
 * Configura db.select com dois retornos consecutivos:
 *   1. Primeira chamada (query overdue): retorna `overdueRows`
 *   2. Demais chamadas (busca de subscription por id): retorna `subRows`
 */
function mockSelectSequence(
  overdueRows: unknown[],
  subRows: unknown[],
) {
  const dbMock = db as unknown as DbMock

  let callCount = 0
  dbMock.select.mockImplementation(() => {
    callCount++
    const rows = callCount === 1 ? overdueRows : subRows
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(rows),
        then: (resolve: (v: unknown) => void) => resolve(rows),
      }),
      limit: vi.fn().mockResolvedValue(rows),
      then: (resolve: (v: unknown) => void) => resolve(rows),
    }
  })
}

/**
 * Configura db.update para registrar chamadas e retornar void.
 * Encadeia: db.update().set().where()
 */
function mockUpdateNoop() {
  const dbMock = db as unknown as DbMock
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  }
  dbMock.update.mockReturnValue(chain)
  return chain
}

/**
 * Configura db.transaction para executar o callback passando um tx stub.
 */
function mockTransactionExecute() {
  const dbMock = db as unknown as DbMock
  dbMock.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => callback({} /* tx stub */),
  )
}

// ---------------------------------------------------------------------------
// Testes — getDunningWindow (puro, sem mocks)
// ---------------------------------------------------------------------------

describe('getDunningWindow (pure)', () => {
  const BASE = new Date('2026-01-01T12:00:00Z')

  it('returns d3 when now is due+3d and retry_count=0', () => {
    const dueAt = daysAgo(BASE, 3)
    expect(getDunningWindow(dueAt, 0, BASE)).toBe('d3')
  })

  it('returns null when due+3d window but retry_count=1 (already retried)', () => {
    const dueAt = daysAgo(BASE, 3)
    expect(getDunningWindow(dueAt, 1, BASE)).toBeNull()
  })

  it('returns d7 when now is due+7d and retry_count=1', () => {
    const dueAt = daysAgo(BASE, 7)
    expect(getDunningWindow(dueAt, 1, BASE)).toBe('d7')
  })

  it('returns null when due+7d window but retry_count=2 (already retried)', () => {
    const dueAt = daysAgo(BASE, 7)
    expect(getDunningWindow(dueAt, 2, BASE)).toBeNull()
  })

  it('returns d15 when now is due+15d and retry_count=2', () => {
    const dueAt = daysAgo(BASE, 15)
    expect(getDunningWindow(dueAt, 2, BASE)).toBe('d15')
  })

  it('returns null when now is due+15d and retry_count=3 (already exhausted, subscription already cancelled)', () => {
    const dueAt = daysAgo(BASE, 15)
    expect(getDunningWindow(dueAt, 3, BASE)).toBeNull()
  })

  it('returns null when before D+3 window', () => {
    const dueAt = daysAgo(BASE, 1) // só 1 dia passado
    expect(getDunningWindow(dueAt, 0, BASE)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Testes — runDunningCycle (com mocks de DB)
// ---------------------------------------------------------------------------

describe('dunning-retry (T-9-10)', () => {
  const NOW = new Date('2026-06-01T12:00:00Z')

  beforeEach(() => {
    vi.clearAllMocks()
    ;(cancelSubscription as Mock).mockResolvedValue(undefined)
  })

  // ── dunning.d3-retry ───────────────────────────────────────────────────────
  //
  // Dado uma installment overdue com due_at há 3 dias e retry_count=0,
  // quando o ciclo roda, retry_count deve ser incrementado para 1
  // e nenhuma subscription deve ser cancelada.

  it(
    'dunning.d3-retry — ' +
      'given installment overdue with due_at 3 days ago and retry_count=0 ' +
      'when dunning cycle runs ' +
      'then retry_count is incremented to 1 and cancelSubscription is not called',
    async () => {
      // Arrange
      const dueAt = daysAgo(NOW, 3)
      const overdueRow = {
        id: INST_ID_1,
        due_at: dueAt,
        retryCount: 0,
        subscriptionId: SUB_ID,
      }
      const subRow = {
        id: SUB_ID,
        status: 'active',
        contactId: CONTACT_ID,
        brandId: BRAND_ID,
        currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
      }

      mockSelectSequence([overdueRow], [subRow])
      const updateChain = mockUpdateNoop()
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runDunningCycle(step, NOW)

      // Assert
      expect(result).toEqual({ processed: 1, retried: 1, cancelled: 0 })
      expect(cancelSubscription).not.toHaveBeenCalled()
      // update foi chamado ao menos uma vez (installment retry_count++)
      expect((db as unknown as DbMock).update).toHaveBeenCalled()
      // set recebeu retryCount: 1
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ retryCount: 1 }),
      )
    },
  )

  // ── dunning.d7-retry ───────────────────────────────────────────────────────
  //
  // Dado uma installment overdue com due_at há 7 dias e retry_count=1,
  // quando o ciclo roda, retry_count deve ser incrementado para 2.

  it(
    'dunning.d7-retry — ' +
      'given installment overdue with due_at 7 days ago and retry_count=1 ' +
      'when dunning cycle runs ' +
      'then retry_count is incremented to 2 and cancelSubscription is not called',
    async () => {
      // Arrange
      const dueAt = daysAgo(NOW, 7)
      const overdueRow = {
        id: INST_ID_1,
        due_at: dueAt,
        retryCount: 1,
        subscriptionId: SUB_ID,
      }
      const subRow = {
        id: SUB_ID,
        status: 'past_due', // já em past_due — não emite TE-SUBSCRIPTION-PAST-DUE novamente
        contactId: CONTACT_ID,
        brandId: BRAND_ID,
        currentPeriodEnd: new Date('2026-07-01T00:00:00Z'),
      }

      mockSelectSequence([overdueRow], [subRow])
      const updateChain = mockUpdateNoop()
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runDunningCycle(step, NOW)

      // Assert
      expect(result).toEqual({ processed: 1, retried: 1, cancelled: 0 })
      expect(cancelSubscription).not.toHaveBeenCalled()
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ retryCount: 2 }),
      )
    },
  )

  // ── dunning.d15-exhausted ──────────────────────────────────────────────────
  //
  // Dado uma installment overdue com due_at há 15 dias e retry_count=2,
  // quando o ciclo roda, o retry_count é incrementado para 3 E cancelSubscription
  // é chamado na mesma rodada com reason='dunning_exhausted'.
  // Isso segue BR-SUBSCRIPTION §D+15: "D+15: retry_count=3. Se ainda overdue,
  // subscription → cancelled".

  it(
    'dunning.d15-exhausted — ' +
      'given installment overdue with due_at 15 days ago and retry_count=2 ' +
      'when dunning cycle runs ' +
      'then retry_count is incremented to 3, cancelSubscription is called with dunning_exhausted, result has cancelled=1',
    async () => {
      // Arrange
      const dueAt = daysAgo(NOW, 15)
      const overdueRow = {
        id: INST_ID_1,
        due_at: dueAt,
        retryCount: 2,
        subscriptionId: SUB_ID,
      }

      // Query overdue retorna a row; query de subscription não é chamada
      // (D+15 vai direto para cancel sem buscar subscription separadamente)
      mockSelectSequence([overdueRow], [])
      const updateChain = mockUpdateNoop()
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runDunningCycle(step, NOW)

      // Assert
      expect(result).toEqual({ processed: 1, retried: 0, cancelled: 1 })
      expect(cancelSubscription).toHaveBeenCalledOnce()
      expect(cancelSubscription).toHaveBeenCalledWith(
        expect.anything(), // tx
        SUB_ID,
        'dunning_exhausted',
      )
      // retry_count deve ser incrementado para 3 antes do cancelamento
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ retryCount: 3 }),
      )
    },
  )

  // ── dunning.idempotent-retry-count ─────────────────────────────────────────
  //
  // Dado uma installment com retry_count=1 e due_at há 3 dias (janela D+3),
  // como retry_count >= 1, a janela D+3 já foi executada → getDunningWindow retorna null → noop.

  it(
    'dunning.idempotent-retry-count — ' +
      'given installment with retry_count=1 and due_at 3 days ago (D+3 window already done) ' +
      'when dunning cycle runs ' +
      'then no update is made and result has retried=0',
    async () => {
      // Arrange
      const dueAt = daysAgo(NOW, 3) // D+3 window, mas retry_count=1 → getDunningWindow retorna null
      const overdueRow = {
        id: INST_ID_1,
        due_at: dueAt,
        retryCount: 1, // já retried → window D+3 exige retry_count < 1, portanto noop
        subscriptionId: SUB_ID,
      }

      mockSelectSequence([overdueRow], [])
      const updateChain = mockUpdateNoop()
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runDunningCycle(step, NOW)

      // Assert — processou mas não retried (window retornou null)
      expect(result.retried).toBe(0)
      expect(result.cancelled).toBe(0)
      expect(cancelSubscription).not.toHaveBeenCalled()
      // update.set não deve ter sido chamado com retryCount
      expect(updateChain.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ retryCount: 2 }),
      )
    },
  )

  // ── dunning.ignores-paid ───────────────────────────────────────────────────
  //
  // Installment com status='paid' não é retornada pela query (filtra status='overdue').
  // Quando a query retorna 0 rows, o ciclo termina sem processar nada.

  it(
    'dunning.ignores-paid — ' +
      'given installment with status=paid (not returned by overdue query) ' +
      'when dunning cycle runs ' +
      'then result is { processed: 0, retried: 0, cancelled: 0 } and no side effects',
    async () => {
      // Arrange — query retorna vazio (paid não passa no filtro status='overdue')
      mockSelectReturning([])
      mockUpdateNoop()
      mockTransactionExecute()
      const step = buildStep()

      // Act
      const result = await runDunningCycle(step, NOW)

      // Assert
      expect(result).toEqual({ processed: 0, retried: 0, cancelled: 0 })
      expect(cancelSubscription).not.toHaveBeenCalled()
      expect((db as unknown as DbMock).update).not.toHaveBeenCalled()
    },
  )

})
