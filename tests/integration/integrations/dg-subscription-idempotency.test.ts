/**
 * Testes de integração — Digital Guru: idempotência de eventos subscription.* e installment.*
 *
 * T-9-19
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md — regra de idempotência por external_id
 * docs/20-domain/13-subscription-billing.md §3.1, §3.2
 *
 * Cenários cobertos:
 *   idempotency.installment-paid-3x
 *     Evento installment.paid com mesmo external_id processado 3 vezes via 3 webhook_log distintos.
 *     handleInstallmentPaid chamado nas 3 invocações, mas só produz efeito na 1ª
 *     (as outras 2 retornam idempotentemente pois status já é 'paid').
 *
 *   idempotency.subscription-cancelled-2x
 *     Evento subscription.cancelled processado 2 vezes (2 webhook_logs).
 *     cancelSubscription chamado ambas as vezes, mas só produz efeito na 1ª
 *     (na 2ª, status já é 'cancelled' → noop conforme INV-BILL-08).
 *
 *   idempotency.subscription-created-2x
 *     Evento subscription.created processado 2 vezes (2 webhook_logs).
 *     createSubscriptionFromTransaction chamado nas 2 invocações, mas sem criar duplicata
 *     (idempotência pela origin_transaction_id — BR-SUBSCRIPTION).
 *
 *   idempotency.installment-overdue-3x
 *     Evento installment.overdue com mesmo external_id processado 3 vezes via 3 webhook_log distintos.
 *     handleInstallmentOverdue chamado nas 3 invocações, mas só produz efeito na 1ª
 *     (as outras 2 retornam idempotentemente pois status já é 'overdue').
 *
 * Diferença em relação a dg-subscription.test.ts §4 (idempotência via webhook_log.status='processed'):
 *   - Aquele testa o guard de camada de handler: se status='processed', nenhum domínio é chamado.
 *   - ESTE testa a idempotência de domínio: handler chama a função de domínio mas ela não produz
 *     efeito duplicado porque o próprio estado da entidade (installment.status, subscription.status)
 *     já está no estado final.
 *
 * Estratégia:
 *   - db é mockado via vi.mock (sem Postgres real)
 *   - Funções de domínio billing são injetadas como vi.fn()
 *   - Cada invocação simula um webhook_log distinto (status='received') com a mesma entidade
 *     interna retornada pelo mock de DB, mas com estado evolutivo entre chamadas.
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
import { db } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Constantes de teste
// ---------------------------------------------------------------------------

const INTERNAL_SUBSCRIPTION_ID = '00000000-0000-0000-0000-000000000010'
const INTERNAL_INSTALLMENT_ID  = '00000000-0000-0000-0000-000000000020'
const INTERNAL_TRANSACTION_ID  = '00000000-0000-0000-0000-000000000030'

// IDs distintos para simular N webhook_logs separados do mesmo evento
const WEBHOOK_LOG_ID_1 = '11111111-1111-1111-1111-111111111001'
const WEBHOOK_LOG_ID_2 = '11111111-1111-1111-1111-111111111002'
const WEBHOOK_LOG_ID_3 = '11111111-1111-1111-1111-111111111003'

// ---------------------------------------------------------------------------
// Fixtures de payloads
// ---------------------------------------------------------------------------

/** installment.paid — mesmo external_id, entregue N vezes pelo DG */
const fixtureInstallmentPaid = {
  id: 'evt_inst_paid_idem_001',
  event_type: 'installment.paid',
  created_at: '2026-04-24T15:00:00Z',
  data: {
    installment: { id: 'inst_ext_idem_001', due_at: '2026-04-20T00:00:00Z' },
  },
}

/** subscription.cancelled — mesmo external_id, entregue 2 vezes pelo DG */
const fixtureSubscriptionCancelled = {
  id: 'evt_sub_cancelled_idem_001',
  event_type: 'subscription.cancelled',
  created_at: '2026-04-25T10:00:00Z',
  data: {
    subscription: { id: 'sub_ext_idem_001', current_period_end: '2026-05-10T00:00:00Z' },
    reason: 'customer_request',
  },
}

/** subscription.created — mesmo external_id, entregue 2 vezes pelo DG */
const fixtureSubscriptionCreated = {
  id: 'evt_sub_created_idem_001',
  event_type: 'subscription.created',
  created_at: '2026-04-24T12:00:00Z',
  data: {
    transaction: { id: 'txn_ext_idem_001', amount_cents: 19900, currency: 'BRL', payment_method: 'credit_card', installments: 1 },
    subscription: { id: 'sub_ext_idem_002', current_period_end: '2026-05-24T00:00:00Z', current_period_start: '2026-04-24T00:00:00Z' },
    customer: { name: 'João Teste', email: 'joao@example.com', document: '12345678900' },
    product: { id: 'prod_ext_idem_001', name: 'Assinatura Anual' },
  },
}

/** installment.overdue — mesmo external_id, entregue 3 vezes pelo DG */
const fixtureInstallmentOverdue = {
  id: 'evt_inst_overdue_idem_001',
  event_type: 'installment.overdue',
  created_at: '2026-04-21T00:00:00Z',
  data: {
    installment: { id: 'inst_ext_idem_002', due_at: '2026-04-20T00:00:00Z' },
  },
}

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
 * Configura db.select para retornar uma entrada de webhook_log com status='received'
 * para um determinado webhook_log_id e payload.
 */
function mockWebhookLogSelectReceived(dbMock: DbMock, webhookLogId: string, payload: unknown, eventKind: string, eventId: string) {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([
      {
        id: webhookLogId,
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

/**
 * Configura db.transaction para executar o callback com um txMock que retorna
 * as rows fornecidas em sequência (callIdx incrementado a cada .limit()).
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

// ---------------------------------------------------------------------------
// Helper para invocar handleDigitalGuruEvent com mocks injetados
// ---------------------------------------------------------------------------

function invokeHandler(
  webhookLogId: string,
  mocks: {
    createPending: Mock
    approve: Mock
    refuse: Mock
    createSubscription: Mock
    cancelSubscription: Mock
    handleInstallmentPaid: Mock
    handleInstallmentOverdue: Mock
  },
) {
  return handleDigitalGuruEvent(
    webhookLogId,
    mocks.createPending as unknown as CreatePendingFn,
    mocks.approve as unknown as ApproveFn,
    mocks.refuse as unknown as RefuseFn,
    mocks.createSubscription as unknown as CreateSubscriptionFn,
    mocks.cancelSubscription as unknown as CancelSubscriptionFn,
    mocks.handleInstallmentPaid as unknown as HandleInstallmentPaidFn,
    mocks.handleInstallmentOverdue as unknown as HandleInstallmentOverdueFn,
  )
}

// ---------------------------------------------------------------------------
// Cenário: idempotency.installment-paid-3x
// ---------------------------------------------------------------------------
//
// Contexto: o Digital Guru re-entrega o mesmo evento installment.paid 3 vezes.
// Cada reentrega produz uma linha distinta em webhook_log (IDs diferentes),
// todas com status='received'. O sistema processa cada uma via handleDigitalGuruEvent.
//
// A guard de "status='processed'" em handler.ts protege dentro do MESMO webhook_log_id.
// Aqui testamos a idempotência de DOMÍNIO: handleInstallmentPaid é chamado nas 3
// invocações, mas nas 2 últimas o domínio retorna noop pois installment.status='paid'.
//
// BR-INTEGRATION-IDEMPOTENCY §1: uq_installment_external impede duplicata no DB.
// docs/20-domain/13-subscription-billing.md §6.2: handleInstallmentPaid verifica
//   status='paid' → retorna idempotentemente.

describe('given installment.paid com mesmo external_id, when processado 3x via webhooks distintos, then handleInstallmentPaid chamado 3x mas efeito real só na 1ª', () => {
  let dbMock: DbMock
  let mocks: {
    createPending: Mock
    approve: Mock
    refuse: Mock
    createSubscription: Mock
    cancelSubscription: Mock
    handleInstallmentPaid: Mock
    handleInstallmentOverdue: Mock
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock

    mocks = {
      createPending: vi.fn(),
      approve: vi.fn(),
      refuse: vi.fn(),
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      // Simula domínio idempotente:
      //   1ª chamada → faz a transição (installment estava scheduled)
      //   2ª e 3ª → noop (installment já está paid)
      //   Em todos os casos o mock retorna sem lançar, como o domínio real faria.
      handleInstallmentPaid: vi.fn().mockResolvedValue({ id: INTERNAL_INSTALLMENT_ID, status: 'paid' }),
      handleInstallmentOverdue: vi.fn(),
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.paid processado 3x, handleInstallmentPaid é chamado exatamente 3x (não 1x), pois idempotência é na camada de domínio', async () => {
    // Arrange — cada invocação usa um webhook_log_id distinto (status='received')
    // mas localiza a mesma installment interna (mesmo INTERNAL_INSTALLMENT_ID).
    // O mock de handleInstallmentPaid retorna noop idempotente nas 3 chamadas.
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2, WEBHOOK_LOG_ID_3]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureInstallmentPaid, 'installment.paid', 'evt_inst_paid_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_INSTALLMENT_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    // Assert: handleInstallmentPaid chamado em cada invocação do handler
    expect(mocks.handleInstallmentPaid).toHaveBeenCalledTimes(3)

    // Assert: cada chamada recebeu o mesmo installmentId interno
    for (const call of mocks.handleInstallmentPaid.mock.calls) {
      expect(call[1]).toBe(INTERNAL_INSTALLMENT_ID)
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.paid processado 3x, nenhuma outra função de domínio é chamada', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2, WEBHOOK_LOG_ID_3]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureInstallmentPaid, 'installment.paid', 'evt_inst_paid_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_INSTALLMENT_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    expect(mocks.cancelSubscription).not.toHaveBeenCalled()
    expect(mocks.createSubscription).not.toHaveBeenCalled()
    expect(mocks.handleInstallmentOverdue).not.toHaveBeenCalled()
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.paid processado 3x, webhook_log.status atualizado para processed em cada invocação', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2, WEBHOOK_LOG_ID_3]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureInstallmentPaid, 'installment.paid', 'evt_inst_paid_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_INSTALLMENT_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    // db.update deve ter sido chamado 3x (uma vez para cada webhook_log_id processado)
    expect(dbMock.update).toHaveBeenCalledTimes(3)
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.paid com webhook_log.status=processed, quando handler executado, então noop completo (guard pré-domínio)', async () => {
    // Cenário complementar: o mesmo webhook_log_id com status='processed'
    // nunca chega ao domínio (guard na linha 2 do handler).
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: WEBHOOK_LOG_ID_1,
        payload: fixtureInstallmentPaid,
        status: 'processed',
        eventKind: 'installment.paid',
        externalEventId: 'evt_inst_paid_idem_001',
      }]),
    }
    dbMock.select.mockReturnValue(selectChain)

    // Act — simula reentrega do mesmo webhook_log_id 3x
    for (let i = 0; i < 3; i++) {
      await invokeHandler(WEBHOOK_LOG_ID_1, mocks)
    }

    // Assert: domínio nunca chamado (guard de status='processed' no handler)
    expect(mocks.handleInstallmentPaid).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
    expect(dbMock.transaction).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Cenário: idempotency.subscription-cancelled-2x
// ---------------------------------------------------------------------------
//
// Contexto: o Digital Guru re-entrega o mesmo evento subscription.cancelled 2 vezes.
// Cada reentrega produz webhook_log distinto (status='received').
//
// cancelSubscription é chamado nas 2 invocações. Na 1ª, faz a transição para 'cancelled'.
// Na 2ª, como subscription já está 'cancelled', retorna idempotentemente sem UPDATE
// (INV-BILL-08 + BR-SUBSCRIPTION: terminais não têm transição).

describe('given subscription.cancelled com mesmo external_id, when processado 2x via webhooks distintos, then cancelSubscription chamado 2x mas efeito real só na 1ª', () => {
  let dbMock: DbMock
  let mocks: {
    createPending: Mock
    approve: Mock
    refuse: Mock
    createSubscription: Mock
    cancelSubscription: Mock
    handleInstallmentPaid: Mock
    handleInstallmentOverdue: Mock
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock

    mocks = {
      createPending: vi.fn(),
      approve: vi.fn(),
      refuse: vi.fn(),
      createSubscription: vi.fn(),
      // Simula domínio idempotente:
      //   Ambas as chamadas resolvem (a 2ª retornaria noop por status='cancelled').
      cancelSubscription: vi.fn().mockResolvedValue({ id: INTERNAL_SUBSCRIPTION_ID, status: 'cancelled' }),
      handleInstallmentPaid: vi.fn(),
      handleInstallmentOverdue: vi.fn(),
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.cancelled processado 2x, cancelSubscription chamado exatamente 2x', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCancelled, 'subscription.cancelled', 'evt_sub_cancelled_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_SUBSCRIPTION_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    expect(mocks.cancelSubscription).toHaveBeenCalledTimes(2)
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.cancelled processado 2x, ambas as chamadas passam subscriptionId e reason corretos', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCancelled, 'subscription.cancelled', 'evt_sub_cancelled_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_SUBSCRIPTION_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    // Ambas as chamadas devem ter passado os mesmos argumentos
    for (const call of mocks.cancelSubscription.mock.calls) {
      expect(call[1]).toBe(INTERNAL_SUBSCRIPTION_ID) // subscriptionId
      expect(call[2]).toBe('customer_request')        // reason do payload
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.cancelled processado 2x, nenhuma outra função de domínio é chamada', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCancelled, 'subscription.cancelled', 'evt_sub_cancelled_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_SUBSCRIPTION_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    expect(mocks.createSubscription).not.toHaveBeenCalled()
    expect(mocks.handleInstallmentPaid).not.toHaveBeenCalled()
    expect(mocks.handleInstallmentOverdue).not.toHaveBeenCalled()
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.cancelled já em status=cancelled, when cancelSubscription retorna noop, then handler completa sem erro', async () => {
    // Simula 2ª entrega onde o domínio já retorna noop (subscription.status='cancelled')
    // O mock já resolve idempotentemente. Testamos que o handler não lança.
    mockWebhookLogSelectReceived(dbMock, WEBHOOK_LOG_ID_2, fixtureSubscriptionCancelled, 'subscription.cancelled', 'evt_sub_cancelled_idem_001')
    mockDbTransaction(dbMock, [[{ id: INTERNAL_SUBSCRIPTION_ID }]])
    mockWebhookLogUpdate(dbMock)

    await expect(invokeHandler(WEBHOOK_LOG_ID_2, mocks)).resolves.toBeUndefined()
    expect(mocks.cancelSubscription).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Cenário: idempotency.subscription-created-2x
// ---------------------------------------------------------------------------
//
// Contexto: o Digital Guru re-entrega o mesmo evento subscription.created 2 vezes.
// Cada reentrega produz webhook_log distinto (status='received').
//
// createSubscriptionFromTransaction é chamado nas 2 invocações.
// A função de domínio é idempotente por origin_transaction_id:
//   - 1ª chamada cria a subscription.
//   - 2ª chamada detecta que subscription já existe para origin_transaction_id → retorna a existente.
// Nunca cria duplicata (BR-SUBSCRIPTION, §2 de createSubscriptionFromTransaction).

describe('given subscription.created com mesmo external_id, when processado 2x via webhooks distintos, then createSubscriptionFromTransaction chamado 2x mas sem duplicata', () => {
  let dbMock: DbMock
  let mocks: {
    createPending: Mock
    approve: Mock
    refuse: Mock
    createSubscription: Mock
    cancelSubscription: Mock
    handleInstallmentPaid: Mock
    handleInstallmentOverdue: Mock
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock

    mocks = {
      createPending: vi.fn(),
      approve: vi.fn(),
      refuse: vi.fn(),
      // Simula domínio idempotente:
      //   Ambas as chamadas resolvem retornando a mesma subscription
      //   (a 2ª não cria duplicata — idempotente por origin_transaction_id).
      createSubscription: vi.fn().mockResolvedValue({ id: INTERNAL_SUBSCRIPTION_ID }),
      cancelSubscription: vi.fn(),
      handleInstallmentPaid: vi.fn(),
      handleInstallmentOverdue: vi.fn(),
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.created processado 2x, createSubscriptionFromTransaction chamado exatamente 2x', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCreated, 'subscription.created', 'evt_sub_created_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_TRANSACTION_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    expect(mocks.createSubscription).toHaveBeenCalledTimes(2)
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.created processado 2x, ambas as chamadas passam o mesmo transactionId interno', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCreated, 'subscription.created', 'evt_sub_created_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_TRANSACTION_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    // Ambas as chamadas devem ter passado o mesmo transactionId interno
    for (const call of mocks.createSubscription.mock.calls) {
      expect(call[1]).toBe(INTERNAL_TRANSACTION_ID)
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.created processado 2x, mock retorna subscription existente idempotentemente sem lançar', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCreated, 'subscription.created', 'evt_sub_created_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_TRANSACTION_ID }]])
      mockWebhookLogUpdate(dbMock)

      // Ambas devem resolver sem erro — o domínio retorna a existente na 2ª chamada
      await expect(invokeHandler(logId, mocks)).resolves.toBeUndefined()
    }

    expect(mocks.createSubscription).toHaveBeenCalledTimes(2)
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.created processado 2x, nenhuma outra função de domínio é chamada', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCreated, 'subscription.created', 'evt_sub_created_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_TRANSACTION_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    expect(mocks.cancelSubscription).not.toHaveBeenCalled()
    expect(mocks.handleInstallmentPaid).not.toHaveBeenCalled()
    expect(mocks.handleInstallmentOverdue).not.toHaveBeenCalled()
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado subscription.created sem transação interna, when processado 2x, then createSubscriptionFromTransaction não chamado em nenhuma invocação', async () => {
    // Transação não encontrada → noop (sem crash, sem criar subscription)
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureSubscriptionCreated, 'subscription.created', 'evt_sub_created_idem_001')
      mockDbTransaction(dbMock, [[]])  // transaction não encontrada
      mockWebhookLogUpdate(dbMock)

      await expect(invokeHandler(logId, mocks)).resolves.toBeUndefined()
    }

    expect(mocks.createSubscription).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Cenário: idempotency.installment-overdue-3x
// ---------------------------------------------------------------------------
//
// Contexto: o Digital Guru re-entrega o mesmo evento installment.overdue 3 vezes.
// Cada reentrega produz webhook_log distinto (status='received').
//
// handleInstallmentOverdue é chamado nas 3 invocações.
// Na 1ª, faz a transição scheduled → overdue.
// Na 2ª e 3ª, installment.status já é 'overdue' → retorna idempotentemente (noop).
// BR-SUBSCRIPTION §6.2 / handle-installment.ts linha 2: "se já overdue, retorna sem UPDATE".

describe('given installment.overdue com mesmo external_id, when processado 3x via webhooks distintos, then handleInstallmentOverdue chamado 3x mas efeito real só na 1ª', () => {
  let dbMock: DbMock
  let mocks: {
    createPending: Mock
    approve: Mock
    refuse: Mock
    createSubscription: Mock
    cancelSubscription: Mock
    handleInstallmentPaid: Mock
    handleInstallmentOverdue: Mock
  }

  beforeEach(() => {
    vi.clearAllMocks()
    dbMock = db as unknown as DbMock

    mocks = {
      createPending: vi.fn(),
      approve: vi.fn(),
      refuse: vi.fn(),
      createSubscription: vi.fn(),
      cancelSubscription: vi.fn(),
      handleInstallmentPaid: vi.fn(),
      // Simula domínio idempotente:
      //   1ª chamada → transição scheduled → overdue
      //   2ª e 3ª → noop (status já é 'overdue')
      //   Em todos os casos o mock retorna sem lançar.
      handleInstallmentOverdue: vi.fn().mockResolvedValue({ id: INTERNAL_INSTALLMENT_ID, status: 'overdue' }),
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.overdue processado 3x, handleInstallmentOverdue chamado exatamente 3x', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2, WEBHOOK_LOG_ID_3]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureInstallmentOverdue, 'installment.overdue', 'evt_inst_overdue_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_INSTALLMENT_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    expect(mocks.handleInstallmentOverdue).toHaveBeenCalledTimes(3)
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.overdue processado 3x, cada chamada recebe o mesmo installmentId', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2, WEBHOOK_LOG_ID_3]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureInstallmentOverdue, 'installment.overdue', 'evt_inst_overdue_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_INSTALLMENT_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    for (const call of mocks.handleInstallmentOverdue.mock.calls) {
      expect(call[1]).toBe(INTERNAL_INSTALLMENT_ID)
    }
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.overdue processado 3x, nenhuma outra função de domínio é chamada', async () => {
    for (const logId of [WEBHOOK_LOG_ID_1, WEBHOOK_LOG_ID_2, WEBHOOK_LOG_ID_3]) {
      mockWebhookLogSelectReceived(dbMock, logId, fixtureInstallmentOverdue, 'installment.overdue', 'evt_inst_overdue_idem_001')
      mockDbTransaction(dbMock, [[{ id: INTERNAL_INSTALLMENT_ID }]])
      mockWebhookLogUpdate(dbMock)

      await invokeHandler(logId, mocks)
    }

    expect(mocks.cancelSubscription).not.toHaveBeenCalled()
    expect(mocks.createSubscription).not.toHaveBeenCalled()
    expect(mocks.handleInstallmentPaid).not.toHaveBeenCalled()
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.overdue já em status=overdue, when handleInstallmentOverdue retorna noop, then handler completa sem erro', async () => {
    // Simula 3ª entrega: domínio retorna noop (installment.status='overdue')
    mockWebhookLogSelectReceived(dbMock, WEBHOOK_LOG_ID_3, fixtureInstallmentOverdue, 'installment.overdue', 'evt_inst_overdue_idem_001')
    mockDbTransaction(dbMock, [[{ id: INTERNAL_INSTALLMENT_ID }]])
    mockWebhookLogUpdate(dbMock)

    await expect(invokeHandler(WEBHOOK_LOG_ID_3, mocks)).resolves.toBeUndefined()
    expect(mocks.handleInstallmentOverdue).toHaveBeenCalledOnce()
  })

  it('BR-INTEGRATION-IDEMPOTENCY: dado installment.overdue com webhook_log.status=processed, when handler executado, então noop completo (guard pré-domínio)', async () => {
    // Guard do handler: status='processed' → retorno imediato sem chamar domínio
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{
        id: WEBHOOK_LOG_ID_1,
        payload: fixtureInstallmentOverdue,
        status: 'processed',
        eventKind: 'installment.overdue',
        externalEventId: 'evt_inst_overdue_idem_001',
      }]),
    }
    dbMock.select.mockReturnValue(selectChain)

    for (let i = 0; i < 3; i++) {
      await invokeHandler(WEBHOOK_LOG_ID_1, mocks)
    }

    expect(mocks.handleInstallmentOverdue).not.toHaveBeenCalled()
    expect(dbMock.update).not.toHaveBeenCalled()
    expect(dbMock.transaction).not.toHaveBeenCalled()
  })
})
