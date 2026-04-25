/**
 * T-8-14 — Digital Guru mapper unit tests
 *
 * Cobre os 6 event_types da Fase 1 + IntegrationMappingError para evento desconhecido.
 * Função pura — sem I/O, sem mocks de módulo externo.
 *
 * Fixtures baseadas em docs/40-integrations/01-digital-guru.md §Mapeamento canônico.
 */
import { describe, it, expect } from 'vitest'
import {
  mapDigitalGuruEvent,
  IntegrationMappingError,
} from '@/lib/integrations/digital-guru/map'
import type {
  DgRawEvent,
  DgPurchaseApprovedEvent,
  DgPurchasePendingEvent,
  DgPurchaseRefusedEvent,
  DgPurchaseRefundedEvent,
  DgSubscriptionCreatedEvent,
  DgSubscriptionRenewedEvent,
  DgSubscriptionCancelledEvent,
  DgInstallmentPaidEvent,
  DgInstallmentOverdueEvent,
} from '@/lib/integrations/digital-guru/map'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Fixture base de cliente (dados anonimizados) */
const baseCustomer = {
  email: 'maria.silva@example.com',
  name: 'Maria da Silva',
  document: '123.456.789-09',
  phone_country: '55',
  phone_area: '11',
  phone_number: '912345678',
}

/** Fixture base de transação */
const baseTransaction = {
  id: 'txn_001',
  amount_cents: 29700,
  currency: 'BRL',
  payment_method: 'credit_card',
  installments: 1,
  approved_at: '2024-03-15T14:30:00Z',
  refused_at: null,
  refunded_at: null,
  reason: null,
}

/** Fixture base de produto */
const baseProduct = {
  id: 'prod_abc123',
  name: 'Curso de TypeScript Avançado',
}

/** Constrói evento DG base com overrides */
function buildEvent(overrides: Partial<DgRawEvent> & { event_type: string }): DgRawEvent {
  return {
    id: 'evt_test_001',
    created_at: '2024-03-15T14:30:00Z',
    data: {
      transaction: { ...baseTransaction },
      customer: { ...baseCustomer },
      product: { ...baseProduct },
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// 1. purchase.approved
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — purchase.approved', () => {
  it('mapeia purchase.approved para kind=purchase_approved com campos canônicos', () => {
    const event = buildEvent({ event_type: 'purchase.approved' })
    const result = mapDigitalGuruEvent(event) as DgPurchaseApprovedEvent

    expect(result.kind).toBe('purchase_approved')
    expect(result.externalEventId).toBe('evt_test_001')

    const txn = result.transactionData
    expect(txn.externalTransactionId).toBe('txn_001')
    expect(txn.contactEmail).toBe('maria.silva@example.com')
    expect(txn.contactName).toBe('Maria da Silva')
    expect(txn.contactPhone).toBe('+5511912345678')
    // CPF: strip não-dígitos
    expect(txn.contactDocument).toBe('12345678909')
    expect(txn.offerId).toBe('prod_abc123')
    // 29700 centavos = 297.00
    expect(txn.amount).toBe('297.00')
    expect(txn.currency).toBe('BRL')
    expect(txn.paymentMethod).toBe('credit_card')
    expect(txn.installmentsCount).toBe(1)
    // occurredAt usa approved_at
    expect(txn.occurredAt).toBe('2024-03-15T14:30:00Z')
    expect(txn.reason).toBeNull()
  })

  it('mapeia transaction.approved (alias legado) para kind=purchase_approved', () => {
    const event = buildEvent({ event_type: 'transaction.approved' })
    const result = mapDigitalGuruEvent(event)
    expect(result.kind).toBe('purchase_approved')
  })
})

// ---------------------------------------------------------------------------
// 2. purchase.pending
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — purchase.pending', () => {
  it('mapeia purchase.pending para kind=purchase_pending', () => {
    const event = buildEvent({
      event_type: 'purchase.pending',
      data: {
        transaction: {
          ...baseTransaction,
          approved_at: null,
          payment_method: 'pix',
        },
        customer: { ...baseCustomer },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchasePendingEvent

    expect(result.kind).toBe('purchase_pending')
    expect(result.externalEventId).toBe('evt_test_001')
    expect(result.transactionData.paymentMethod).toBe('pix')
    // occurredAt cai para created_at quando approved_at é null
    expect(result.transactionData.occurredAt).toBe('2024-03-15T14:30:00Z')
  })
})

// ---------------------------------------------------------------------------
// 3. purchase.refused
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — purchase.refused', () => {
  it('mapeia purchase.refused para kind=purchase_refused com reason e refused_at', () => {
    const event = buildEvent({
      event_type: 'purchase.refused',
      data: {
        transaction: {
          ...baseTransaction,
          approved_at: null,
          refused_at: '2024-03-15T14:35:00Z',
          reason: 'insufficient_funds',
        },
        customer: { ...baseCustomer },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseRefusedEvent

    expect(result.kind).toBe('purchase_refused')
    expect(result.transactionData.reason).toBe('insufficient_funds')
    expect(result.transactionData.occurredAt).toBe('2024-03-15T14:35:00Z')
  })
})

// ---------------------------------------------------------------------------
// 4. purchase.refunded
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — purchase.refunded', () => {
  it('mapeia purchase.refunded para kind=purchase_refunded com refunded_at', () => {
    const event = buildEvent({
      event_type: 'purchase.refunded',
      data: {
        transaction: {
          ...baseTransaction,
          approved_at: '2024-03-15T14:30:00Z',
          refunded_at: '2024-03-20T10:00:00Z',
          reason: 'customer_requested',
        },
        customer: { ...baseCustomer },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseRefundedEvent

    expect(result.kind).toBe('purchase_refunded')
    expect(result.transactionData.occurredAt).toBe('2024-03-20T10:00:00Z')
    expect(result.transactionData.reason).toBe('customer_requested')
  })
})

// ---------------------------------------------------------------------------
// 5. subscription.* eventos completos (Sprint 9)
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — subscription.created', () => {
  it('mapeia subscription.created para kind=subscription_created com externalSubscriptionId', () => {
    const event = buildEvent({
      event_type: 'subscription.created',
      data: {
        transaction: { ...baseTransaction },
        subscription: { id: 'sub_xyz', current_period_end: '2025-03-15T00:00:00Z' },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgSubscriptionCreatedEvent

    expect(result.kind).toBe('subscription_created')
    expect(result.externalEventId).toBe('evt_test_001')
    expect(result.externalSubscriptionId).toBe('sub_xyz')
    expect(result.externalTransactionId).toBe('txn_001')
  })
})

describe('mapDigitalGuruEvent — subscription.renewed', () => {
  it('mapeia subscription.renewed para kind=subscription_renewed com periodEnd', () => {
    const event = buildEvent({
      event_type: 'subscription.renewed',
      data: {
        subscription: { id: 'sub_xyz', current_period_end: '2025-03-15T00:00:00Z', current_period_start: '2025-02-15T00:00:00Z' },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgSubscriptionRenewedEvent

    expect(result.kind).toBe('subscription_renewed')
    expect(result.externalSubscriptionId).toBe('sub_xyz')
    expect(result.periodEnd).toBe('2025-03-15T00:00:00Z')
  })
})

describe('mapDigitalGuruEvent — subscription.cancelled / subscription.canceled', () => {
  it('mapeia subscription.cancelled para kind=subscription_cancelled', () => {
    const event = buildEvent({
      event_type: 'subscription.cancelled',
      data: {
        subscription: { id: 'sub_xyz' },
        reason: 'churn',
      },
    })
    const result = mapDigitalGuruEvent(event) as DgSubscriptionCancelledEvent

    expect(result.kind).toBe('subscription_cancelled')
    expect(result.externalSubscriptionId).toBe('sub_xyz')
    expect(result.reason).toBe('churn')
  })

  it('mapeia subscription.canceled (alias americano) para kind=subscription_cancelled', () => {
    const event = buildEvent({
      event_type: 'subscription.canceled',
      data: {
        subscription: { id: 'sub_xyz2' },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgSubscriptionCancelledEvent

    expect(result.kind).toBe('subscription_cancelled')
    expect(result.reason).toBe('external') // fallback
  })
})

// ---------------------------------------------------------------------------
// 6. installment.* eventos completos (Sprint 9)
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — installment.paid / installment.overdue', () => {
  it('mapeia installment.paid para kind=installment_paid com externalInstallmentId', () => {
    const event = buildEvent({
      event_type: 'installment.paid',
      data: {
        installment: { id: 'inst_abc', due_at: '2024-04-01T00:00:00Z' },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgInstallmentPaidEvent

    expect(result.kind).toBe('installment_paid')
    expect(result.externalInstallmentId).toBe('inst_abc')
    expect(result.externalEventId).toBe('evt_test_001')
  })

  it('mapeia installment.overdue para kind=installment_overdue com externalInstallmentId', () => {
    const event = buildEvent({
      event_type: 'installment.overdue',
      data: {
        installment: { id: 'inst_def', due_at: '2024-04-01T00:00:00Z' },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgInstallmentOverdueEvent

    expect(result.kind).toBe('installment_overdue')
    expect(result.externalInstallmentId).toBe('inst_def')
  })
})

// ---------------------------------------------------------------------------
// 7. Evento desconhecido → IntegrationMappingError
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — evento desconhecido', () => {
  it('lança IntegrationMappingError para event_type não mapeado', () => {
    const event = buildEvent({ event_type: 'some.unknown_event' })

    expect(() => mapDigitalGuruEvent(event)).toThrow(IntegrationMappingError)
  })

  it('IntegrationMappingError contém eventType correto', () => {
    const event = buildEvent({ event_type: 'chargeback.opened' })

    let caught: unknown
    try {
      mapDigitalGuruEvent(event)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(IntegrationMappingError)
    expect((caught as IntegrationMappingError).eventType).toBe('chargeback.opened')
  })
})

// ---------------------------------------------------------------------------
// Edge cases de normalização
// ---------------------------------------------------------------------------

describe('mapDigitalGuruEvent — edge cases', () => {
  it('email é normalizado para lowercase + trim', () => {
    const event = buildEvent({
      event_type: 'purchase.approved',
      data: {
        transaction: { ...baseTransaction },
        customer: { ...baseCustomer, email: '  JOAO@EXAMPLE.COM  ' },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseApprovedEvent
    expect(result.transactionData.contactEmail).toBe('joao@example.com')
  })

  it('phone retorna null quando todos os campos de telefone estão ausentes', () => {
    const event = buildEvent({
      event_type: 'purchase.approved',
      data: {
        transaction: { ...baseTransaction },
        customer: {
          email: 'sem.fone@example.com',
          name: 'Sem Fone',
          phone_country: null,
          phone_area: null,
          phone_number: null,
        },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseApprovedEvent
    expect(result.transactionData.contactPhone).toBeNull()
  })

  it('document retorna null quando ausente', () => {
    const event = buildEvent({
      event_type: 'purchase.approved',
      data: {
        transaction: { ...baseTransaction },
        customer: { email: 'sem.doc@example.com', name: 'Sem Doc', document: null },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseApprovedEvent
    expect(result.transactionData.contactDocument).toBeNull()
  })

  it('offerId retorna null quando product está ausente', () => {
    const event = buildEvent({
      event_type: 'purchase.pending',
      data: {
        transaction: { ...baseTransaction, approved_at: null },
        customer: { ...baseCustomer },
        // sem product
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchasePendingEvent
    expect(result.transactionData.offerId).toBeNull()
  })

  it('currency é uppercase com fallback para BRL', () => {
    const event = buildEvent({
      event_type: 'purchase.approved',
      data: {
        transaction: { ...baseTransaction, currency: null },
        customer: { ...baseCustomer },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseApprovedEvent
    expect(result.transactionData.currency).toBe('BRL')
  })

  it('payment_method desconhecido mapeia para custom', () => {
    const event = buildEvent({
      event_type: 'purchase.approved',
      data: {
        transaction: { ...baseTransaction, payment_method: 'crypto' },
        customer: { ...baseCustomer },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseApprovedEvent
    expect(result.transactionData.paymentMethod).toBe('custom')
  })

  it('amount_cents é convertido corretamente para string decimal', () => {
    const event = buildEvent({
      event_type: 'purchase.approved',
      data: {
        transaction: { ...baseTransaction, amount_cents: 9990 },
        customer: { ...baseCustomer },
        product: { ...baseProduct },
      },
    })
    const result = mapDigitalGuruEvent(event) as DgPurchaseApprovedEvent
    expect(result.transactionData.amount).toBe('99.90')
  })

  it('lança IntegrationMappingError quando data.transaction está ausente em purchase event', () => {
    const event: DgRawEvent = {
      id: 'evt_no_txn',
      event_type: 'purchase.approved',
      created_at: '2024-01-01T00:00:00Z',
      data: {
        customer: { ...baseCustomer },
        // sem transaction
      },
    }
    expect(() => mapDigitalGuruEvent(event)).toThrow(IntegrationMappingError)
  })
})
