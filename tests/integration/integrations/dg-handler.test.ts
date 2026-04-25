/**
 * Testes de integração — Digital Guru: handleDigitalGuruEvent
 *
 * T-8-15
 * docs/40-integrations/01-digital-guru.md
 * docs/60-flows/05-external-sale-ingest.md (FLOW-05)
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 *
 * Cenários cobertos:
 *   1. purchase_approved  → chama approveFn
 *   2. purchase_pending   → noop (Fase 1) sem erro
 *   3. purchase_refused   → chama refuseFn
 *   4. Duplicate (webhook_log.status='processed') → noop, domínio não é chamado
 *   5. subscription_stub  → noop sem erro
 *
 * Estratégia:
 *   - db é mockado via vi.mock para evitar dependência de Postgres real
 *   - createPendingFn, approveFn, refuseFn são injetados como vi.fn()
 *   - HMAC real calculado para dg-signature (testado em dg-signature.test.ts)
 *
 * Idempotência: testada via status='processed' no webhook_log mockado.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Mock do módulo de banco de dados
// IMPORTANTE: vi.mock deve estar no topo — hoisting automático pelo Vitest
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/client', () => {
  return {
    db: {
      select: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(),
    },
  }
})

// ---------------------------------------------------------------------------
// Imports após mocks (ordem importa para hoisting)
// ---------------------------------------------------------------------------

import { handleDigitalGuruEvent } from '@/lib/integrations/digital-guru/handler'
import type { CreatePendingFn, ApproveFn, RefuseFn } from '@/lib/integrations/digital-guru/handler'
import { db } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures de payloads brutos do Digital Guru
// ---------------------------------------------------------------------------

const WEBHOOK_LOG_ID = '00000000-0000-0000-0000-000000000099'
const EXTERNAL_TXN_ID = 'txn_ext_001'
const EXTERNAL_EVT_ID = 'evt_001'

function makePurchaseApprovedPayload() {
  return {
    id: EXTERNAL_EVT_ID,
    event_type: 'purchase.approved',
    created_at: '2026-04-24T12:00:00Z',
    data: {
      transaction: {
        id: EXTERNAL_TXN_ID,
        amount_cents: 29700,
        currency: 'BRL',
        payment_method: 'credit_card',
        installments: 3,
        approved_at: '2026-04-24T12:00:00Z',
      },
      customer: {
        name: 'João Silva',
        email: 'joao@example.com',
        document: '12345678909',
        phone_country: '55',
        phone_area: '11',
        phone_number: '912345678',
      },
      product: { id: 'prod_ext_001', name: 'Curso Teste' },
    },
  }
}

function makePurchasePendingPayload() {
  return {
    id: 'evt_pending_001',
    event_type: 'purchase.pending',
    created_at: '2026-04-24T11:55:00Z',
    data: {
      transaction: {
        id: EXTERNAL_TXN_ID,
        amount_cents: 29700,
        currency: 'BRL',
        payment_method: 'credit_card',
        installments: 3,
      },
      customer: {
        name: 'João Silva',
        email: 'joao@example.com',
      },
      product: { id: 'prod_ext_001' },
    },
  }
}

function makePurchaseRefusedPayload() {
  return {
    id: 'evt_refused_001',
    event_type: 'purchase.refused',
    created_at: '2026-04-24T12:01:00Z',
    data: {
      transaction: {
        id: EXTERNAL_TXN_ID,
        amount_cents: 29700,
        currency: 'BRL',
        payment_method: 'credit_card',
        installments: 1,
        refused_at: '2026-04-24T12:01:00Z',
        reason: 'payment_declined',
      },
      customer: {
        name: 'João Silva',
        email: 'joao@example.com',
      },
      product: { id: 'prod_ext_001' },
    },
  }
}

function makeSubscriptionStubPayload() {
  return {
    id: 'evt_sub_001',
    event_type: 'subscription.renewed',
    created_at: '2026-04-24T12:00:00Z',
    data: {
      subscription: { id: 'sub_ext_001', current_period_end: '2026-05-24T00:00:00Z' },
      installment: { id: 'inst_ext_001', due_at: '2026-04-24T00:00:00Z' },
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers para configurar mocks do db
// ---------------------------------------------------------------------------

type DbMock = {
  select: Mock
  update: Mock
  transaction: Mock
}

/**
 * Configura db.update para resolver com sucesso.
 * Encadeia: update().set().where()
 */
function mockWebhookLogUpdate(dbMock: DbMock) {
  const updateResult = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }
  dbMock.update.mockReturnValue(updateResult)
  return updateResult
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('handleDigitalGuruEvent', () => {
  let mockCreatePending: Mock
  let mockApprove: Mock
  let mockRefuse: Mock
  let dbMock: DbMock

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreatePending = vi.fn()
    mockApprove = vi.fn()
    mockRefuse = vi.fn()
    dbMock = db as unknown as DbMock
  })

  // ── Teste 1: purchase_approved → approveFn chamado ──────────────────────
  it('purchase_approved: chama approveFn quando existe transação pending', async () => {
    // Arrange
    const INTERNAL_TXN_ID = '00000000-0000-0000-0000-000000000001'

    // Mock select para webhook_log (status=received)
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    }
    // Primeiro select: webhook_log
    // Segundo select (dentro da db.transaction): transaction existente
    selectChain.limit
      .mockResolvedValueOnce([
        {
          id: WEBHOOK_LOG_ID,
          payload: makePurchaseApprovedPayload(),
          status: 'received',
          eventKind: 'purchase.approved',
          externalEventId: EXTERNAL_EVT_ID,
        },
      ])
      .mockResolvedValueOnce([
        { id: INTERNAL_TXN_ID, status: 'pending' },
      ])

    dbMock.select.mockReturnValue(selectChain)

    // Mock approveFn para resolver com sucesso
    mockApprove.mockResolvedValue({ id: INTERNAL_TXN_ID, status: 'approved' })

    // Mock db.transaction para executar o callback
    dbMock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const txMock = {
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }),
      }
      return fn(txMock)
    })

    // Mock db.update para webhook_log processed
    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
    )

    // Assert
    expect(mockApprove).toHaveBeenCalledOnce()
    expect(mockApprove).toHaveBeenCalledWith(
      expect.anything(), // tx
      INTERNAL_TXN_ID,
      EXTERNAL_TXN_ID,
    )
    expect(mockRefuse).not.toHaveBeenCalled()
    expect(mockCreatePending).not.toHaveBeenCalled()
  })

  // ── Teste 2: purchase_pending → noop sem erro ───────────────────────────
  it('purchase_pending: completa sem erro (noop Fase 1) e marca processed', async () => {
    // Arrange
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: WEBHOOK_LOG_ID,
          payload: makePurchasePendingPayload(),
          status: 'received',
          eventKind: 'purchase.pending',
          externalEventId: 'evt_pending_001',
        },
      ]),
    }
    dbMock.select.mockReturnValue(selectChain)
    const updateChain = mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
    )

    // Assert: domínio não é chamado
    expect(mockCreatePending).not.toHaveBeenCalled()
    expect(mockApprove).not.toHaveBeenCalled()
    expect(mockRefuse).not.toHaveBeenCalled()

    // webhook_log marcado como processed
    expect(dbMock.update).toHaveBeenCalled()
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processed' }),
    )
  })

  // ── Teste 3: purchase_refused → refuseFn chamado ───────────────────────
  it('purchase_refused: chama refuseFn quando existe transação pending', async () => {
    // Arrange
    const INTERNAL_TXN_ID = '00000000-0000-0000-0000-000000000002'

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    }
    selectChain.limit
      .mockResolvedValueOnce([
        {
          id: WEBHOOK_LOG_ID,
          payload: makePurchaseRefusedPayload(),
          status: 'received',
          eventKind: 'purchase.refused',
          externalEventId: 'evt_refused_001',
        },
      ])
      .mockResolvedValueOnce([
        { id: INTERNAL_TXN_ID, status: 'pending' },
      ])

    dbMock.select.mockReturnValue(selectChain)

    mockRefuse.mockResolvedValue({ id: INTERNAL_TXN_ID, status: 'refused' })

    dbMock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const txMock = {
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }),
      }
      return fn(txMock)
    })

    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
    )

    // Assert
    expect(mockRefuse).toHaveBeenCalledOnce()
    expect(mockRefuse).toHaveBeenCalledWith(
      expect.anything(), // tx
      INTERNAL_TXN_ID,
      'payment_declined',
    )
    expect(mockApprove).not.toHaveBeenCalled()
    expect(mockCreatePending).not.toHaveBeenCalled()
  })

  // ── Teste 4: Duplicate (status=processed) → noop total ─────────────────
  // CT-DG-02 / BR-INTEGRATION-IDEMPOTENCY: webhook já processado = noop
  // Importante: 3x o mesmo payload = 1 efeito de domínio
  it('duplicate (status=processed): noop total — domínio não é chamado', async () => {
    // Arrange
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: WEBHOOK_LOG_ID,
          payload: makePurchaseApprovedPayload(),
          status: 'processed', // <-- já processado
          eventKind: 'purchase.approved',
          externalEventId: EXTERNAL_EVT_ID,
        },
      ]),
    }
    dbMock.select.mockReturnValue(selectChain)

    // Act — chamar 3 vezes para simular 3 reentregas (idempotência)
    await handleDigitalGuruEvent(WEBHOOK_LOG_ID, mockCreatePending as unknown as CreatePendingFn, mockApprove as unknown as ApproveFn, mockRefuse as unknown as RefuseFn)
    await handleDigitalGuruEvent(WEBHOOK_LOG_ID, mockCreatePending as unknown as CreatePendingFn, mockApprove as unknown as ApproveFn, mockRefuse as unknown as RefuseFn)
    await handleDigitalGuruEvent(WEBHOOK_LOG_ID, mockCreatePending as unknown as CreatePendingFn, mockApprove as unknown as ApproveFn, mockRefuse as unknown as RefuseFn)

    // Assert: nenhuma função de domínio chamada em nenhuma das 3 invocações
    expect(mockApprove).not.toHaveBeenCalled()
    expect(mockCreatePending).not.toHaveBeenCalled()
    expect(mockRefuse).not.toHaveBeenCalled()
    // db.update NÃO deve ter sido chamado (retorna antes de qualquer efeito)
    expect(dbMock.update).not.toHaveBeenCalled()
    // db.transaction NÃO deve ter sido chamado
    expect(dbMock.transaction).not.toHaveBeenCalled()
  })

  // ── Teste 5: subscription_stub → noop sem erro ─────────────────────────
  it('subscription_stub: completa sem erro (noop Sprint 9) e marca processed', async () => {
    // Arrange
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: WEBHOOK_LOG_ID,
          payload: makeSubscriptionStubPayload(),
          status: 'received',
          eventKind: 'subscription.renewed',
          externalEventId: 'evt_sub_001',
        },
      ]),
    }
    dbMock.select.mockReturnValue(selectChain)
    const updateChain = mockWebhookLogUpdate(dbMock)

    // Act
    await expect(
      handleDigitalGuruEvent(
        WEBHOOK_LOG_ID,
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
      ),
    ).resolves.toBeUndefined()

    // Assert: sem chamadas de domínio
    expect(mockApprove).not.toHaveBeenCalled()
    expect(mockCreatePending).not.toHaveBeenCalled()
    expect(mockRefuse).not.toHaveBeenCalled()

    // webhook_log marcado como processed
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'processed' }),
    )
  })

  // ── Teste 6: webhook_log não encontrado → lança erro ───────────────────
  it('lança erro quando webhook_log não é encontrado', async () => {
    // Arrange
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]), // array vazio = não encontrado
    }
    dbMock.select.mockReturnValue(selectChain)

    // Act / Assert
    await expect(
      handleDigitalGuruEvent(
        'nonexistent-id',
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
      ),
    ).rejects.toThrow('webhook_log not found')
  })

  // ── Teste 7: purchase_approved sem transação existente → tenta criar + aprovar
  it('purchase_approved sem transação existente: chama createPendingFn + approveFn', async () => {
    // Arrange
    const NEW_TXN_ID = '00000000-0000-0000-0000-000000000003'

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
    }
    selectChain.limit
      .mockResolvedValueOnce([
        {
          id: WEBHOOK_LOG_ID,
          payload: makePurchaseApprovedPayload(),
          status: 'received',
          eventKind: 'purchase.approved',
          externalEventId: EXTERNAL_EVT_ID,
        },
      ])
      .mockResolvedValueOnce([]) // transação não encontrada

    dbMock.select.mockReturnValue(selectChain)

    mockCreatePending.mockResolvedValue({ id: NEW_TXN_ID, status: 'pending' })
    mockApprove.mockResolvedValue({ id: NEW_TXN_ID, status: 'approved' })

    dbMock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const txMock = {
        select: vi.fn().mockReturnValue(selectChain),
        update: vi.fn().mockReturnValue({ set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) }),
      }
      return fn(txMock)
    })

    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
    )

    // Assert
    expect(mockCreatePending).toHaveBeenCalledOnce()
    expect(mockApprove).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Testes do processador Inngest: getRetryDelayMs
// ---------------------------------------------------------------------------

import { getRetryDelayMs, BACKOFF_BASE_MS, JITTER_FACTOR } from '@/inngest/functions/digital-guru-process'

describe('getRetryDelayMs', () => {
  it('tentativa 0 retorna delay próximo de 5s com jitter', () => {
    const delay = getRetryDelayMs(0)
    const base = BACKOFF_BASE_MS[0]
    const maxJitter = base * JITTER_FACTOR
    expect(delay).toBeGreaterThanOrEqual(base - maxJitter - 1)
    expect(delay).toBeLessThanOrEqual(base + maxJitter + 1)
  })

  it('tentativa 1 retorna delay próximo de 30s com jitter', () => {
    const delay = getRetryDelayMs(1)
    const base = BACKOFF_BASE_MS[1]
    const maxJitter = base * JITTER_FACTOR
    expect(delay).toBeGreaterThanOrEqual(base - maxJitter - 1)
    expect(delay).toBeLessThanOrEqual(base + maxJitter + 1)
  })

  it('tentativa 3 retorna delay próximo de 750s (cap) com jitter', () => {
    const delay = getRetryDelayMs(3)
    const base = BACKOFF_BASE_MS[3]
    const maxJitter = base * JITTER_FACTOR
    expect(delay).toBeGreaterThanOrEqual(base - maxJitter - 1)
    expect(delay).toBeLessThanOrEqual(base + maxJitter + 1)
  })

  it('tentativas além do índice máximo usam o cap de 750s', () => {
    const delay4 = getRetryDelayMs(4)
    const delay10 = getRetryDelayMs(10)
    const base = BACKOFF_BASE_MS[3] // 750s cap
    const maxJitter = base * JITTER_FACTOR
    expect(delay4).toBeLessThanOrEqual(base + maxJitter + 1)
    expect(delay10).toBeLessThanOrEqual(base + maxJitter + 1)
  })

  it('retorna pelo menos 1000ms mesmo com jitter negativo extremo', () => {
    // Testar múltiplas vezes para cobrir variação do Math.random
    for (let i = 0; i < 20; i++) {
      expect(getRetryDelayMs(0)).toBeGreaterThanOrEqual(1_000)
    }
  })
})
