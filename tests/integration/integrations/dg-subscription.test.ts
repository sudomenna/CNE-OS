/**
 * Testes de integração — Digital Guru: eventos subscription.* e installment.*
 *
 * T-9-12
 * docs/40-integrations/01-digital-guru.md §Eventos consumidos
 * docs/20-domain/13-subscription-billing.md §2 (interfaces de domínio)
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 *
 * Cenários cobertos:
 *   1. subscription.created  → createSubscriptionFromTransaction chamado
 *   2. subscription.cancelled → cancelSubscription chamado
 *   3. installment.paid      → handleInstallmentPaid chamado
 *   4. installment.overdue   → handleInstallmentOverdue chamado
 *   5. Idempotência: 3x o mesmo installment.paid = 1 chamada a handleInstallmentPaid
 *   6. subscription.renewed  → noop de domínio (log apenas, ciclo real gerido pelo cron)
 *   7. Mapper puro: subscription.created / cancelled / installment.paid / overdue
 *      com payloads de fixtures reais anonimizados
 *
 * Estratégia:
 *   - db é mockado via vi.mock para evitar dependência de Postgres real
 *   - Funções de domínio billing são injetadas como vi.fn()
 *   - HMAC verificado em dg-signature.test.ts; aqui testamos handler e mapper.
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
import type {
  CreatePendingFn,
  ApproveFn,
  RefuseFn,
  CreateSubscriptionFn,
  CancelSubscriptionFn,
  HandleInstallmentPaidFn,
  HandleInstallmentOverdueFn,
} from '@/lib/integrations/digital-guru/handler'
import { mapDigitalGuruEvent, IntegrationMappingError } from '@/lib/integrations/digital-guru/map'
import { db } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures de payloads brutos anonimizados do Digital Guru
// ---------------------------------------------------------------------------

/** Fixture: subscription.created — happy path */
const fixtureSubscriptionCreated = {
  id: 'evt_sub_created_001',
  event_type: 'subscription.created',
  created_at: '2026-04-24T12:00:00Z',
  data: {
    transaction: { id: 'txn_ext_sub_001', amount_cents: 19900, currency: 'BRL', payment_method: 'credit_card', installments: 1 },
    subscription: { id: 'sub_ext_001', current_period_end: '2026-05-24T00:00:00Z', current_period_start: '2026-04-24T00:00:00Z' },
    customer: { name: 'Maria Oliveira', email: 'maria@example.com', document: '98765432100' },
    product: { id: 'prod_ext_002', name: 'Assinatura Mensal' },
  },
}

/** Fixture: subscription.cancelled — happy path */
const fixtureSubscriptionCancelled = {
  id: 'evt_sub_cancelled_001',
  event_type: 'subscription.cancelled',
  created_at: '2026-04-25T10:00:00Z',
  data: {
    subscription: { id: 'sub_ext_002', current_period_end: '2026-05-10T00:00:00Z' },
    reason: 'customer_request',
  },
}

/** Fixture: subscription.canceled (alias americano) — edge case */
const fixtureSubscriptionCanceled = {
  id: 'evt_sub_canceled_002',
  event_type: 'subscription.canceled',
  created_at: '2026-04-25T11:00:00Z',
  data: {
    subscription: { id: 'sub_ext_003' },
  },
}

/** Fixture: subscription.renewed — happy path */
const fixtureSubscriptionRenewed = {
  id: 'evt_sub_renewed_001',
  event_type: 'subscription.renewed',
  created_at: '2026-05-24T00:01:00Z',
  data: {
    subscription: { id: 'sub_ext_004', current_period_end: '2026-06-24T00:00:00Z', current_period_start: '2026-05-24T00:00:00Z' },
    installment: { id: 'inst_ext_renew_001', due_at: '2026-05-24T00:00:00Z' },
  },
}

/** Fixture: installment.paid — happy path */
const fixtureInstallmentPaid = {
  id: 'evt_inst_paid_001',
  event_type: 'installment.paid',
  created_at: '2026-04-24T15:00:00Z',
  data: {
    installment: { id: 'inst_ext_001', due_at: '2026-04-20T00:00:00Z' },
  },
}

/** Fixture: installment.overdue — happy path */
const fixtureInstallmentOverdue = {
  id: 'evt_inst_overdue_001',
  event_type: 'installment.overdue',
  created_at: '2026-04-21T00:00:00Z',
  data: {
    installment: { id: 'inst_ext_002', due_at: '2026-04-20T00:00:00Z' },
  },
}

/** Fixture: subscription.cancelled sem reason — edge case (null/missing reason) */
const fixtureSubscriptionCancelledNoReason = {
  id: 'evt_sub_cancelled_no_reason',
  event_type: 'subscription.cancelled',
  created_at: '2026-04-25T12:00:00Z',
  data: {
    subscription: { id: 'sub_ext_005' },
    // sem campo reason — deve default para 'external'
  },
}

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------

const WEBHOOK_LOG_ID = '00000000-0000-0000-0000-000000000099'
const INTERNAL_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000010'
const INTERNAL_INSTALLMENT_ID = '00000000-0000-0000-0000-000000000020'
const INTERNAL_TRANSACTION_ID = '00000000-0000-0000-0000-000000000030'

// ---------------------------------------------------------------------------
// Helpers para configurar mocks do db
// ---------------------------------------------------------------------------

type DbMock = {
  select: Mock
  update: Mock
  transaction: Mock
}

function mockWebhookLogUpdate(dbMock: DbMock) {
  const updateResult = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }
  dbMock.update.mockReturnValue(updateResult)
  return updateResult
}

/**
 * Configura db.transaction para executar o callback com um txMock que retorna
 * as rows fornecidas em sequência (primeiro select = webhookLog, próximos = entidades internas).
 */
function mockDbTransaction(dbMock: DbMock, internalRows: unknown[][]) {
  dbMock.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    let callIdx = 0
    const txMock = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
          const rows = internalRows[callIdx] ?? []
          callIdx++
          return Promise.resolve(rows)
        }),
      })),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue([]),
      }),
    }
    return fn(txMock)
  })
}

/**
 * Configura o select externo para webhook_log.
 */
function mockWebhookLogSelect(dbMock: DbMock, payload: unknown, eventKind: string, eventId: string) {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: WEBHOOK_LOG_ID,
        payload,
        status: 'received',
        eventKind,
        externalEventId: eventId,
      },
    ]),
  }
  dbMock.select.mockReturnValue(selectChain)
  return selectChain
}

// ---------------------------------------------------------------------------
// Seção 1: Mapper puro — mapDigitalGuruEvent
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — subscription e installment events', () => {
  it('subscription.created → kind=subscription_created com externalSubscriptionId', () => {
    const result = mapDigitalGuruEvent(fixtureSubscriptionCreated)
    expect(result.kind).toBe('subscription_created')
    if (result.kind === 'subscription_created') {
      expect(result.externalEventId).toBe('evt_sub_created_001')
      expect(result.externalSubscriptionId).toBe('sub_ext_001')
      expect(result.externalTransactionId).toBe('txn_ext_sub_001')
    }
  })

  it('subscription.cancelled → kind=subscription_cancelled com reason', () => {
    const result = mapDigitalGuruEvent(fixtureSubscriptionCancelled)
    expect(result.kind).toBe('subscription_cancelled')
    if (result.kind === 'subscription_cancelled') {
      expect(result.externalSubscriptionId).toBe('sub_ext_002')
      expect(result.reason).toBe('customer_request')
    }
  })

  it('subscription.canceled (alias americano) → kind=subscription_cancelled', () => {
    const result = mapDigitalGuruEvent(fixtureSubscriptionCanceled)
    expect(result.kind).toBe('subscription_cancelled')
    if (result.kind === 'subscription_cancelled') {
      expect(result.externalSubscriptionId).toBe('sub_ext_003')
      // Sem reason no payload → fallback 'external'
      expect(result.reason).toBe('external')
    }
  })

  it('subscription.cancelled sem reason → reason=external (edge case)', () => {
    const result = mapDigitalGuruEvent(fixtureSubscriptionCancelledNoReason)
    expect(result.kind).toBe('subscription_cancelled')
    if (result.kind === 'subscription_cancelled') {
      expect(result.reason).toBe('external')
    }
  })

  it('subscription.renewed → kind=subscription_renewed com periodEnd', () => {
    const result = mapDigitalGuruEvent(fixtureSubscriptionRenewed)
    expect(result.kind).toBe('subscription_renewed')
    if (result.kind === 'subscription_renewed') {
      expect(result.externalSubscriptionId).toBe('sub_ext_004')
      expect(result.periodEnd).toBe('2026-06-24T00:00:00Z')
    }
  })

  it('installment.paid → kind=installment_paid com externalInstallmentId', () => {
    const result = mapDigitalGuruEvent(fixtureInstallmentPaid)
    expect(result.kind).toBe('installment_paid')
    if (result.kind === 'installment_paid') {
      expect(result.externalInstallmentId).toBe('inst_ext_001')
      expect(result.externalEventId).toBe('evt_inst_paid_001')
    }
  })

  it('installment.overdue → kind=installment_overdue com externalInstallmentId', () => {
    const result = mapDigitalGuruEvent(fixtureInstallmentOverdue)
    expect(result.kind).toBe('installment_overdue')
    if (result.kind === 'installment_overdue') {
      expect(result.externalInstallmentId).toBe('inst_ext_002')
    }
  })

  it('subscription.created sem data.subscription → lança IntegrationMappingError', () => {
    const badPayload = {
      id: 'evt_bad_001',
      event_type: 'subscription.created',
      data: {
        // subscription ausente
        transaction: { id: 'txn_bad', amount_cents: 100, currency: 'BRL', payment_method: 'pix', installments: 1 },
      },
    }
    expect(() => mapDigitalGuruEvent(badPayload)).toThrow(IntegrationMappingError)
  })

  it('installment.paid sem data.installment → lança IntegrationMappingError', () => {
    const badPayload = {
      id: 'evt_bad_002',
      event_type: 'installment.paid',
      data: {
        // installment ausente
      },
    }
    expect(() => mapDigitalGuruEvent(badPayload)).toThrow(IntegrationMappingError)
  })

  it('mapper é determinístico (mesmo input = mesmo output)', () => {
    const r1 = mapDigitalGuruEvent(fixtureInstallmentPaid)
    const r2 = mapDigitalGuruEvent(fixtureInstallmentPaid)
    expect(r1).toEqual(r2)
  })
})

// ---------------------------------------------------------------------------
// Seção 2: handleDigitalGuruEvent — subscription.created
// ---------------------------------------------------------------------------

describe('handleDigitalGuruEvent — subscription.created', () => {
  let dbMock: DbMock
  let mockCreatePending: Mock
  let mockApprove: Mock
  let mockRefuse: Mock
  let mockCreateSubscription: Mock
  let mockCancelSubscription: Mock
  let mockHandleInstallmentPaid: Mock
  let mockHandleInstallmentOverdue: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock
    mockCreatePending = vi.fn()
    mockApprove = vi.fn()
    mockRefuse = vi.fn()
    mockCreateSubscription = vi.fn().mockResolvedValue({ id: INTERNAL_SUBSCRIPTION_ID })
    mockCancelSubscription = vi.fn().mockResolvedValue({ id: INTERNAL_SUBSCRIPTION_ID, status: 'cancelled' })
    mockHandleInstallmentPaid = vi.fn().mockResolvedValue({ id: INTERNAL_INSTALLMENT_ID, status: 'paid' })
    mockHandleInstallmentOverdue = vi.fn().mockResolvedValue({ id: INTERNAL_INSTALLMENT_ID, status: 'overdue' })
  })

  // dg.subscription.created.happy
  it('subscription.created: chama createSubscriptionFromTransaction quando transação existe', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureSubscriptionCreated, 'subscription.created', 'evt_sub_created_001')
    mockDbTransaction(dbMock, [
      // select transaction by external_id → encontrada
      [{ id: INTERNAL_TRANSACTION_ID }],
    ])
    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
      mockCreateSubscription as unknown as CreateSubscriptionFn,
      mockCancelSubscription as unknown as CancelSubscriptionFn,
      mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
      mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
    )

    // Assert: createSubscriptionFromTransaction chamado com tx e transactionId interno
    expect(mockCreateSubscription).toHaveBeenCalledOnce()
    expect(mockCreateSubscription).toHaveBeenCalledWith(
      expect.anything(), // tx
      INTERNAL_TRANSACTION_ID,
    )
    expect(mockCancelSubscription).not.toHaveBeenCalled()
    expect(mockHandleInstallmentPaid).not.toHaveBeenCalled()
  })

  it('subscription.created: noop quando transação não encontrada (sem crash)', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureSubscriptionCreated, 'subscription.created', 'evt_sub_created_001')
    mockDbTransaction(dbMock, [
      [], // transaction não encontrada
    ])
    mockWebhookLogUpdate(dbMock)

    // Act — não deve lançar
    await expect(
      handleDigitalGuruEvent(
        WEBHOOK_LOG_ID,
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
        mockCreateSubscription as unknown as CreateSubscriptionFn,
        mockCancelSubscription as unknown as CancelSubscriptionFn,
        mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
        mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
      ),
    ).resolves.toBeUndefined()

    // createSubscriptionFn não deve ter sido chamado
    expect(mockCreateSubscription).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Seção 3: handleDigitalGuruEvent — subscription.cancelled
// ---------------------------------------------------------------------------

describe('handleDigitalGuruEvent — subscription.cancelled', () => {
  let dbMock: DbMock
  let mockCreatePending: Mock
  let mockApprove: Mock
  let mockRefuse: Mock
  let mockCreateSubscription: Mock
  let mockCancelSubscription: Mock
  let mockHandleInstallmentPaid: Mock
  let mockHandleInstallmentOverdue: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock
    mockCreatePending = vi.fn()
    mockApprove = vi.fn()
    mockRefuse = vi.fn()
    mockCreateSubscription = vi.fn()
    mockCancelSubscription = vi.fn().mockResolvedValue({ id: INTERNAL_SUBSCRIPTION_ID, status: 'cancelled' })
    mockHandleInstallmentPaid = vi.fn()
    mockHandleInstallmentOverdue = vi.fn()
  })

  // dg.subscription.cancelled.happy
  it('subscription.cancelled: chama cancelSubscription com subscriptionId e reason', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureSubscriptionCancelled, 'subscription.cancelled', 'evt_sub_cancelled_001')
    mockDbTransaction(dbMock, [
      // select subscription by external_id → encontrada
      [{ id: INTERNAL_SUBSCRIPTION_ID }],
    ])
    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
      mockCreateSubscription as unknown as CreateSubscriptionFn,
      mockCancelSubscription as unknown as CancelSubscriptionFn,
      mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
      mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
    )

    // Assert
    expect(mockCancelSubscription).toHaveBeenCalledOnce()
    expect(mockCancelSubscription).toHaveBeenCalledWith(
      expect.anything(), // tx
      INTERNAL_SUBSCRIPTION_ID,
      'customer_request',
    )
    expect(mockCreateSubscription).not.toHaveBeenCalled()
    expect(mockHandleInstallmentPaid).not.toHaveBeenCalled()
  })

  it('subscription.cancelled: noop quando subscription não encontrada (sem crash)', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureSubscriptionCancelled, 'subscription.cancelled', 'evt_sub_cancelled_001')
    mockDbTransaction(dbMock, [
      [], // subscription não encontrada
    ])
    mockWebhookLogUpdate(dbMock)

    // Act — não deve lançar
    await expect(
      handleDigitalGuruEvent(
        WEBHOOK_LOG_ID,
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
        mockCreateSubscription as unknown as CreateSubscriptionFn,
        mockCancelSubscription as unknown as CancelSubscriptionFn,
        mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
        mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
      ),
    ).resolves.toBeUndefined()

    expect(mockCancelSubscription).not.toHaveBeenCalled()
  })

  it('subscription.cancelled: reason default=external quando ausente no payload', async () => {
    // Arrange — fixture sem reason
    mockWebhookLogSelect(dbMock, fixtureSubscriptionCancelledNoReason, 'subscription.cancelled', 'evt_sub_cancelled_no_reason')
    mockDbTransaction(dbMock, [
      [{ id: INTERNAL_SUBSCRIPTION_ID }],
    ])
    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
      mockCreateSubscription as unknown as CreateSubscriptionFn,
      mockCancelSubscription as unknown as CancelSubscriptionFn,
      mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
      mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
    )

    expect(mockCancelSubscription).toHaveBeenCalledWith(
      expect.anything(),
      INTERNAL_SUBSCRIPTION_ID,
      'external', // reason padrão
    )
  })
})

// ---------------------------------------------------------------------------
// Seção 4: handleDigitalGuruEvent — installment.paid
// ---------------------------------------------------------------------------

describe('handleDigitalGuruEvent — installment.paid', () => {
  let dbMock: DbMock
  let mockCreatePending: Mock
  let mockApprove: Mock
  let mockRefuse: Mock
  let mockCreateSubscription: Mock
  let mockCancelSubscription: Mock
  let mockHandleInstallmentPaid: Mock
  let mockHandleInstallmentOverdue: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock
    mockCreatePending = vi.fn()
    mockApprove = vi.fn()
    mockRefuse = vi.fn()
    mockCreateSubscription = vi.fn()
    mockCancelSubscription = vi.fn()
    mockHandleInstallmentPaid = vi.fn().mockResolvedValue({ id: INTERNAL_INSTALLMENT_ID, status: 'paid' })
    mockHandleInstallmentOverdue = vi.fn()
  })

  // dg.installment.paid.happy
  it('installment.paid: chama handleInstallmentPaid com installmentId e paidAt', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureInstallmentPaid, 'installment.paid', 'evt_inst_paid_001')
    mockDbTransaction(dbMock, [
      // select installment by external_id → encontrada
      [{ id: INTERNAL_INSTALLMENT_ID }],
    ])
    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
      mockCreateSubscription as unknown as CreateSubscriptionFn,
      mockCancelSubscription as unknown as CancelSubscriptionFn,
      mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
      mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
    )

    // Assert
    expect(mockHandleInstallmentPaid).toHaveBeenCalledOnce()
    expect(mockHandleInstallmentPaid).toHaveBeenCalledWith(
      expect.anything(), // tx
      INTERNAL_INSTALLMENT_ID,
      expect.any(Date), // paidAt
    )
    expect(mockHandleInstallmentOverdue).not.toHaveBeenCalled()
    expect(mockCancelSubscription).not.toHaveBeenCalled()
  })

  it('installment.paid: noop quando installment não encontrada (sem crash)', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureInstallmentPaid, 'installment.paid', 'evt_inst_paid_001')
    mockDbTransaction(dbMock, [
      [], // installment não encontrada
    ])
    mockWebhookLogUpdate(dbMock)

    // Act — não deve lançar
    await expect(
      handleDigitalGuruEvent(
        WEBHOOK_LOG_ID,
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
        mockCreateSubscription as unknown as CreateSubscriptionFn,
        mockCancelSubscription as unknown as CancelSubscriptionFn,
        mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
        mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
      ),
    ).resolves.toBeUndefined()

    expect(mockHandleInstallmentPaid).not.toHaveBeenCalled()
  })

  // Idempotência: 3x o mesmo installment.paid = 1 efeito de domínio
  // (simulado via status='processed' no webhook_log — Inngest não reenfileira o mesmo log)
  it('idempotência: status=processed → noop, handleInstallmentPaid não chamado', async () => {
    // Arrange — webhook_log já está processed
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([
        {
          id: WEBHOOK_LOG_ID,
          payload: fixtureInstallmentPaid,
          status: 'processed', // <-- já processado
          eventKind: 'installment.paid',
          externalEventId: 'evt_inst_paid_001',
        },
      ]),
    }
    dbMock.select.mockReturnValue(selectChain)

    // Act — simula 3 reentregas
    for (let i = 0; i < 3; i++) {
      await handleDigitalGuruEvent(
        WEBHOOK_LOG_ID,
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
        mockCreateSubscription as unknown as CreateSubscriptionFn,
        mockCancelSubscription as unknown as CancelSubscriptionFn,
        mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
        mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
      )
    }

    // Assert: domínio não chamado em nenhuma das 3 invocações
    expect(mockHandleInstallmentPaid).not.toHaveBeenCalled()
    expect(mockHandleInstallmentOverdue).not.toHaveBeenCalled()
    expect(mockCancelSubscription).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
    expect(dbMock.transaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Seção 5: handleDigitalGuruEvent — installment.overdue
// ---------------------------------------------------------------------------

describe('handleDigitalGuruEvent — installment.overdue', () => {
  let dbMock: DbMock
  let mockCreatePending: Mock
  let mockApprove: Mock
  let mockRefuse: Mock
  let mockCreateSubscription: Mock
  let mockCancelSubscription: Mock
  let mockHandleInstallmentPaid: Mock
  let mockHandleInstallmentOverdue: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock
    mockCreatePending = vi.fn()
    mockApprove = vi.fn()
    mockRefuse = vi.fn()
    mockCreateSubscription = vi.fn()
    mockCancelSubscription = vi.fn()
    mockHandleInstallmentPaid = vi.fn()
    mockHandleInstallmentOverdue = vi.fn().mockResolvedValue({ id: INTERNAL_INSTALLMENT_ID, status: 'overdue' })
  })

  // dg.installment.overdue.happy
  it('installment.overdue: chama handleInstallmentOverdue com installmentId', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureInstallmentOverdue, 'installment.overdue', 'evt_inst_overdue_001')
    mockDbTransaction(dbMock, [
      // select installment by external_id → encontrada
      [{ id: INTERNAL_INSTALLMENT_ID }],
    ])
    mockWebhookLogUpdate(dbMock)

    // Act
    await handleDigitalGuruEvent(
      WEBHOOK_LOG_ID,
      mockCreatePending as unknown as CreatePendingFn,
      mockApprove as unknown as ApproveFn,
      mockRefuse as unknown as RefuseFn,
      mockCreateSubscription as unknown as CreateSubscriptionFn,
      mockCancelSubscription as unknown as CancelSubscriptionFn,
      mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
      mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
    )

    // Assert
    expect(mockHandleInstallmentOverdue).toHaveBeenCalledOnce()
    expect(mockHandleInstallmentOverdue).toHaveBeenCalledWith(
      expect.anything(), // tx
      INTERNAL_INSTALLMENT_ID,
    )
    expect(mockHandleInstallmentPaid).not.toHaveBeenCalled()
    expect(mockCancelSubscription).not.toHaveBeenCalled()
  })

  it('installment.overdue: noop quando installment não encontrada (sem crash)', async () => {
    // Arrange
    mockWebhookLogSelect(dbMock, fixtureInstallmentOverdue, 'installment.overdue', 'evt_inst_overdue_001')
    mockDbTransaction(dbMock, [
      [], // installment não encontrada
    ])
    mockWebhookLogUpdate(dbMock)

    // Act — não deve lançar
    await expect(
      handleDigitalGuruEvent(
        WEBHOOK_LOG_ID,
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
        mockCreateSubscription as unknown as CreateSubscriptionFn,
        mockCancelSubscription as unknown as CancelSubscriptionFn,
        mockHandleInstallmentPaid as unknown as HandleInstallmentPaidFn,
        mockHandleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
      ),
    ).resolves.toBeUndefined()

    expect(mockHandleInstallmentOverdue).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Seção 6: handleDigitalGuruEvent — subscription.renewed (noop de domínio)
// ---------------------------------------------------------------------------

describe('handleDigitalGuruEvent — subscription.renewed', () => {
  let dbMock: DbMock

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock
  })

  it('subscription.renewed: completa sem erro quando subscription encontrada', async () => {
    const mockCreatePending = vi.fn()
    const mockApprove = vi.fn()
    const mockRefuse = vi.fn()
    const mockCreateSubscription = vi.fn()
    const mockCancelSubscription = vi.fn()
    const mockInstPaid = vi.fn()
    const mockInstOverdue = vi.fn()

    mockWebhookLogSelect(dbMock, fixtureSubscriptionRenewed, 'subscription.renewed', 'evt_sub_renewed_001')
    mockDbTransaction(dbMock, [
      // subscription encontrada pelo external_id
      [{ id: INTERNAL_SUBSCRIPTION_ID, externalId: 'sub_ext_004' }],
    ])
    mockWebhookLogUpdate(dbMock)

    await expect(
      handleDigitalGuruEvent(
        WEBHOOK_LOG_ID,
        mockCreatePending as unknown as CreatePendingFn,
        mockApprove as unknown as ApproveFn,
        mockRefuse as unknown as RefuseFn,
        mockCreateSubscription as unknown as CreateSubscriptionFn,
        mockCancelSubscription as unknown as CancelSubscriptionFn,
        mockInstPaid as unknown as HandleInstallmentPaidFn,
        mockInstOverdue as unknown as HandleInstallmentOverdueFn,
      ),
    ).resolves.toBeUndefined()

    // Nenhuma função de domínio de billing deve ter sido chamada
    expect(mockCreateSubscription).not.toHaveBeenCalled()
    expect(mockCancelSubscription).not.toHaveBeenCalled()
    expect(mockInstPaid).not.toHaveBeenCalled()
    expect(mockInstOverdue).not.toHaveBeenCalled()
  })
})
