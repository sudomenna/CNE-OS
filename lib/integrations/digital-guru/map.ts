/**
 * MOD-INTEGRATION / T-8-14 — Digital Guru: mapper (DG event → domínio canônico)
 *
 * Função pura `mapDigitalGuruEvent` — sem I/O, determinística, testável isoladamente.
 *
 * Specs:
 *   docs/40-integrations/01-digital-guru.md §Mapeamento canônico
 *   docs/30-contracts/01-enums.md §Transação/Snapshot/Direito §Catálogo/Oferta
 *   docs/80-roadmap/05-sprint-8-snapshot-dg-integration.md T-8-14
 *
 * Fase 1 cobre 6 event_type:
 *   purchase.approved  → DgPurchaseApprovedEvent
 *   purchase.pending   → DgPurchasePendingEvent
 *   purchase.refused   → DgPurchaseRefusedEvent
 *   purchase.refunded  → DgPurchaseRefundedEvent
 *   subscription.*     → DgSubscriptionStubEvent  (Sprint 9)
 *   installment.*      → DgInstallmentStubEvent   (Sprint 9)
 *
 * Eventos desconhecidos lançam `IntegrationMappingError`.
 */

// ---------------------------------------------------------------------------
// Erro de mapeamento
// ---------------------------------------------------------------------------

export class IntegrationMappingError extends Error {
  constructor(
    public readonly eventType: string,
    message: string,
  ) {
    super(message)
    this.name = 'IntegrationMappingError'
  }
}

// ---------------------------------------------------------------------------
// Tipos de entrada (payload bruto do Digital Guru)
// ---------------------------------------------------------------------------

/**
 * Estrutura mínima de cliente no payload DG.
 */
export interface DgCustomer {
  email: string
  name: string
  document?: string | null
  phone_country?: string | null
  phone_area?: string | null
  phone_number?: string | null
}

/**
 * Estrutura mínima de transação no payload DG.
 *
 * docs/40-integrations/01-digital-guru.md §Mapeamento canônico
 */
export interface DgTransaction {
  id: string
  amount_cents: number
  currency?: string | null
  payment_method?: string | null
  installments?: number | null
  approved_at?: string | null
  refused_at?: string | null
  refunded_at?: string | null
  reason?: string | null
}

/**
 * Estrutura mínima de produto no payload DG.
 * `id` é o `product_code` / `external_ref` usado para lookup de oferta interna.
 */
export interface DgProduct {
  id: string
  name?: string | null
}

/**
 * Payload bruto recebido via webhook do Digital Guru.
 * `data` contém subchaves que variam por event_type.
 */
export interface DgRawEvent {
  /** ID único do evento — usado como external_event_id (ADR-16). */
  id: string
  /** Tipo do evento, ex: "purchase.approved". */
  event_type: string
  /** ISO-8601 de quando o evento foi gerado pelo provedor. */
  created_at?: string | null
  data: {
    transaction?: DgTransaction | null
    customer?: DgCustomer | null
    product?: DgProduct | null
    subscription?: Record<string, unknown> | null
    installment?: Record<string, unknown> | null
    checkout?: Record<string, unknown> | null
  }
}

// ---------------------------------------------------------------------------
// Tipos de saída (domínio canônico)
// ---------------------------------------------------------------------------

/**
 * Métodos de pagamento canônicos.
 * docs/30-contracts/01-enums.md §offer_payment_method
 */
export type CanonicalPaymentMethod =
  | 'pix'
  | 'credit_card'
  | 'installments'
  | 'boleto'
  | 'custom'

/**
 * Dados de transação mapeados para o domínio interno.
 * Usados por purchase.approved / pending / refused / refunded.
 */
export interface DgTransactionData {
  /** transaction.external_ref — payload.data.transaction.id */
  externalTransactionId: string
  /** contact lookup — lowercase + trim */
  contactEmail: string
  /** contact.full_name — trim */
  contactName: string
  /** contact_phone: E.164 normalizado; null se ausente */
  contactPhone: string | null
  /** contact.cpf — só dígitos; null se ausente ou inválido */
  contactDocument: string | null
  /**
   * offer.external_refs.digital_guru — payload.data.product.id.
   * Null quando product não presente (handler deve tratar como unmapped_product).
   */
  offerId: string | null
  /** numeric(12,2) como string — amount_cents / 100 */
  amount: string
  /** currency uppercase, default 'BRL' */
  currency: string
  /** Método de pagamento canônico */
  paymentMethod: CanonicalPaymentMethod
  /** Número de parcelas; 1 para métodos não-parcelados */
  installmentsCount: number
  /** ISO-8601 do momento do evento (approved_at, refused_at, refunded_at ou created_at) */
  occurredAt: string
  /** Motivo de recusa / estorno, quando presente */
  reason: string | null
}

/** Resultado de purchase.approved */
export interface DgPurchaseApprovedEvent {
  kind: 'purchase_approved'
  externalEventId: string
  transactionData: DgTransactionData
}

/** Resultado de purchase.pending */
export interface DgPurchasePendingEvent {
  kind: 'purchase_pending'
  externalEventId: string
  transactionData: DgTransactionData
}

/** Resultado de purchase.refused */
export interface DgPurchaseRefusedEvent {
  kind: 'purchase_refused'
  externalEventId: string
  transactionData: DgTransactionData
}

/** Resultado de purchase.refunded */
export interface DgPurchaseRefundedEvent {
  kind: 'purchase_refunded'
  externalEventId: string
  transactionData: DgTransactionData
}

/**
 * Stub para subscription.* — processado no Sprint 9.
 * Preserva payload bruto para reprocess futuro.
 */
export interface DgSubscriptionStubEvent {
  kind: 'subscription_stub'
  externalEventId: string
  eventType: string
  raw: DgRawEvent
}

/**
 * Stub para installment.* — processado no Sprint 9.
 * Preserva payload bruto para reprocess futuro.
 */
export interface DgInstallmentStubEvent {
  kind: 'installment_stub'
  externalEventId: string
  eventType: string
  raw: DgRawEvent
}

/** Union discriminada de todos os eventos mapeados (Fase 1). */
export type DgMappedEvent =
  | DgPurchaseApprovedEvent
  | DgPurchasePendingEvent
  | DgPurchaseRefusedEvent
  | DgPurchaseRefundedEvent
  | DgSubscriptionStubEvent
  | DgInstallmentStubEvent

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

/**
 * Mapeia payment_method externo para enum canônico.
 * docs/40-integrations/01-digital-guru.md §Mapeamento canônico
 */
function mapPaymentMethod(raw: string | null | undefined): CanonicalPaymentMethod {
  switch (raw) {
    case 'pix':
      return 'pix'
    case 'credit_card':
      return 'credit_card'
    case 'installments':
      return 'installments'
    case 'boleto':
      return 'boleto'
    default:
      return 'custom'
  }
}

/**
 * Normaliza número de telefone para E.164 a partir dos campos fracionados do DG.
 * Retorna null se todos os campos estiverem ausentes.
 */
function normalizePhone(
  country: string | null | undefined,
  area: string | null | undefined,
  number: string | null | undefined,
): string | null {
  if (!country && !area && !number) return null
  const digits = [country, area, number]
    .filter(Boolean)
    .join('')
    .replace(/\D/g, '')
  if (!digits) return null
  return `+${digits}`
}

/**
 * Strip de não-dígitos do CPF. Retorna null se ausente.
 * Validação completa de CPF (checksum) é responsabilidade do domínio de contato.
 * docs/40-integrations/01-digital-guru.md §Mapeamento canônico
 */
function normalizeDocument(raw: string | null | undefined): string | null {
  if (!raw) return null
  return raw.replace(/\D/g, '') || null
}

/**
 * Converte amount_cents em string numeric(12,2).
 * docs/40-integrations/01-digital-guru.md §Mapeamento canônico
 */
function centsToCurrencyString(amountCents: number): string {
  return (amountCents / 100).toFixed(2)
}

/**
 * Determina o ISO-8601 do evento a partir dos campos disponíveis.
 * Prioridade: campo específico do evento > created_at do payload raiz.
 */
function resolveOccurredAt(
  specificTimestamp: string | null | undefined,
  fallback: string | null | undefined,
): string {
  return specificTimestamp ?? fallback ?? new Date(0).toISOString()
}

/**
 * Extrai e normaliza os campos de transação comuns a todos os purchase events.
 */
function extractTransactionData(event: DgRawEvent, specificOccurredAt: string | null | undefined): DgTransactionData {
  const txn = event.data.transaction
  const customer = event.data.customer
  const product = event.data.product

  if (!txn) {
    throw new IntegrationMappingError(
      event.event_type,
      `Payload DG "${event.event_type}" (id=${event.id}) sem data.transaction`,
    )
  }

  if (!customer) {
    throw new IntegrationMappingError(
      event.event_type,
      `Payload DG "${event.event_type}" (id=${event.id}) sem data.customer`,
    )
  }

  return {
    externalTransactionId: txn.id,
    contactEmail: customer.email.toLowerCase().trim(),
    contactName: customer.name.trim(),
    contactPhone: normalizePhone(
      customer.phone_country,
      customer.phone_area,
      customer.phone_number,
    ),
    contactDocument: normalizeDocument(customer.document),
    offerId: product?.id ?? null,
    amount: centsToCurrencyString(txn.amount_cents),
    currency: (txn.currency ?? 'BRL').toUpperCase(),
    paymentMethod: mapPaymentMethod(txn.payment_method),
    installmentsCount: txn.installments ?? 1,
    occurredAt: resolveOccurredAt(specificOccurredAt, event.created_at),
    reason: txn.reason ?? null,
  }
}

// ---------------------------------------------------------------------------
// Função pura principal
// ---------------------------------------------------------------------------

/**
 * Mapeia payload bruto do Digital Guru para estrutura canônica interna.
 *
 * Função pura: sem I/O, determinística (mesma entrada = mesma saída).
 * Lança `IntegrationMappingError` para event_type desconhecido.
 *
 * @param event - Payload bruto recebido via webhook DG
 * @returns DgMappedEvent discriminado por `kind`
 */
export function mapDigitalGuruEvent(event: DgRawEvent): DgMappedEvent {
  const { event_type, id: externalEventId } = event

  // purchase events --------------------------------------------------------
  if (event_type === 'purchase.approved' || event_type === 'transaction.approved') {
    return {
      kind: 'purchase_approved',
      externalEventId,
      transactionData: extractTransactionData(event, event.data.transaction?.approved_at),
    }
  }

  if (event_type === 'purchase.pending' || event_type === 'transaction.pending') {
    return {
      kind: 'purchase_pending',
      externalEventId,
      transactionData: extractTransactionData(event, event.created_at),
    }
  }

  if (event_type === 'purchase.refused' || event_type === 'transaction.refused') {
    return {
      kind: 'purchase_refused',
      externalEventId,
      transactionData: extractTransactionData(event, event.data.transaction?.refused_at),
    }
  }

  if (event_type === 'purchase.refunded' || event_type === 'transaction.refunded') {
    return {
      kind: 'purchase_refunded',
      externalEventId,
      transactionData: extractTransactionData(event, event.data.transaction?.refunded_at),
    }
  }

  // subscription stubs (Sprint 9) ------------------------------------------
  if (event_type.startsWith('subscription.')) {
    return {
      kind: 'subscription_stub',
      externalEventId,
      eventType: event_type,
      raw: event,
    }
  }

  // installment stubs (Sprint 9) -------------------------------------------
  if (event_type.startsWith('installment.')) {
    return {
      kind: 'installment_stub',
      externalEventId,
      eventType: event_type,
      raw: event,
    }
  }

  // Evento desconhecido — lançar erro para DLQ / alerta ---------------------
  throw new IntegrationMappingError(
    event_type,
    `Evento DG desconhecido: "${event_type}" (id=${externalEventId}). Adicionar ao mapper ou escalar.`,
  )
}
