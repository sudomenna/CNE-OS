/**
 * MOD-INTEGRATION / T-8-20 — Notazz outbound: envio de pedido de NF pós-aprovação
 *
 * `sendInvoiceRequest(transactionId, payload)` é chamado pelo processador Inngest
 * `notazz/invoice.requested` após `approveTransaction`.
 *
 * Fluxo:
 *   1. Verificar idempotência: buscar webhook_log com external_event_id='notazz:invoice:{transactionId}'
 *      - Se status='processed' → noop imediato (não reenviar NF já solicitada)
 *   2. Inserir (ou confirmar existência de) linha em webhook_log com status='received'
 *      - UNIQUE constraint previne duplicata — ON CONFLICT noop
 *   3. POST HTTP para NOTAZZ_BASE_URL/api/invoices com payload
 *   4. Sucesso 2xx → atualizar webhook_log.status='processed'
 *   5. Falha HTTP → lançar erro (Inngest fará retry; dead_letter após N tentativas)
 *
 * Idempotência:
 *   external_event_id = 'notazz:invoice:{transactionId}' — garante 1 pedido por transação
 *   docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 *   docs/40-integrations/04-notazz.md §Idempotência/retry/DLQ
 *
 * ADR-02: CNPJ emissor fixo por marca (issuing_legal_entity_cnpj vem do snapshot)
 * docs/90-meta/04-decision-log.md §ADR-02
 */

import { eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import type { TransactionSnapshotPayload } from '@/lib/domain/transaction/snapshot'

// ---------------------------------------------------------------------------
// Tipo do payload outbound Notazz
// docs/40-integrations/04-notazz.md §Mapeamento canônico (outbound)
// ---------------------------------------------------------------------------

export type NotazzInvoiceItem = {
  description: string
  quantity: number
  unit_price: number
  ncm?: string | undefined
  cfop?: string | undefined
}

export type NotazzCustomer = {
  name: string
  cpf: string
  email: string
  /** Endereço completo — opcional (Fase 1 envia quando disponível no snapshot) */
  address?: {
    street?: string | undefined
    number?: string | undefined
    complement?: string | undefined
    neighborhood?: string | undefined
    city?: string | undefined
    state?: string | undefined
    postal_code?: string | undefined
  } | undefined
}

export type NotazzIssuer = {
  /** CNPJ sem formatação (só dígitos) — ADR-02 */
  cnpj: string
  /** Inscrição Estadual — opcional */
  ie?: string | undefined
}

/**
 * Payload mínimo para pedido de emissão de NF.
 * docs/40-integrations/04-notazz.md §Eventos emitidos + §Mapeamento canônico
 *
 * Fase 1 usa campos mínimos. Campos avançados (NCM/CFOP por item, endereço)
 * são preenchidos quando disponíveis.
 */
export type NotazzInvoicePayload = {
  /** ID da transação interna — usado como external_ref na Notazz (idempotência) */
  transaction_id: string
  /** Valor total em reais (não centavos) */
  amount: number
  /** Dados do cliente (pessoa física — Fase 1: apenas PF; B2B = manual) */
  customer: NotazzCustomer
  /** Dados da entidade emissora */
  issuer: NotazzIssuer
  /** Itens da nota */
  items: NotazzInvoiceItem[]
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

/**
 * Lançado quando o HTTP POST para a Notazz retorna status de erro.
 * Inngest fará retry ao receber este erro.
 */
export class NotazzHttpError extends Error {
  readonly name = 'NotazzHttpError'
  readonly statusCode: number
  readonly responseBody: string

  constructor(statusCode: number, responseBody: string, transactionId: string) {
    super(
      `[notazz-send] HTTP ${statusCode} ao enviar pedido de NF para transação ${transactionId}: ${responseBody}`,
    )
    this.statusCode = statusCode
    this.responseBody = responseBody
  }
}

// ---------------------------------------------------------------------------
// sendInvoiceRequest
// ---------------------------------------------------------------------------

/**
 * Envia pedido de emissão de NF para a Notazz de forma idempotente.
 *
 * A idempotência é garantida via `webhook_log.external_event_id`:
 *   - Antes do HTTP: insere linha com status='received' (UNIQUE ON CONFLICT noop)
 *   - Se linha já existe com status='processed': retorna imediatamente sem novo POST
 *   - Após HTTP 2xx: atualiza status='processed'
 *   - Falha HTTP: lança NotazzHttpError; Inngest fará retry
 *
 * @param transactionId UUID da transação aprovada
 * @param payload       Dados para emissão de NF
 * @param fetchFn       Injetável para testes (padrão: fetch global)
 *
 * @throws NotazzHttpError  se POST retornar status 4xx/5xx
 * @throws Error             se variáveis de ambiente não configuradas
 *
 * @see docs/40-integrations/04-notazz.md
 * @see BR-INTEGRATION-IDEMPOTENCY
 */
export async function sendInvoiceRequest(
  transactionId: string,
  payload: NotazzInvoicePayload,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const externalEventId = `notazz:invoice:${transactionId}`

  // ── 1. Verificar idempotência: se já processado → noop ──────────────────
  // BR-INTEGRATION-IDEMPOTENCY: status='processed' significa que o pedido foi
  // enviado com sucesso em uma tentativa anterior.
  const existingRows = await db
    .select({ id: webhookLog.id, status: webhookLog.status })
    .from(webhookLog)
    .where(eq(webhookLog.externalEventId, externalEventId))
    .limit(1)

  const existing = existingRows[0]

  if (existing?.status === 'processed') {
    // Noop: NF já foi solicitada com sucesso — não reenviar
    // CT-NZ-06: falha + retry com mesma transactionId deve resultar em 1 NF
    return
  }

  // ── 2. Gravar linha em webhook_log antes do HTTP (idempotência) ──────────
  // INSERT com ON CONFLICT DO NOTHING — se linha já existe (tentativa anterior
  // que falhou), mantemos ela e atualizamos o status após sucesso.
  // A linha é gravada ANTES do HTTP para garantir rastreabilidade mesmo em crash.
  // BR-INTEGRATION-IDEMPOTENCY
  if (!existing) {
    await db.insert(webhookLog).values({
      provider: 'notazz',
      externalEventId,
      eventKind: 'invoice.issue',
      payload: payload as unknown as Record<string, unknown>,
      status: 'received',
    })
  }

  // ── 3. POST HTTP para Notazz ─────────────────────────────────────────────
  const baseUrl = process.env['NOTAZZ_BASE_URL'] ?? 'https://app.notazz.com'
  const apiKey = process.env['NOTAZZ_API_KEY']

  if (!apiKey) {
    throw new Error('[notazz-send] NOTAZZ_API_KEY não configurado')
  }

  const url = `${baseUrl}/api/invoices`
  const body = JSON.stringify({
    ...payload,
    // external_ref permite à Notazz detectar reenvio e retornar 2xx idempotente
    external_ref: transactionId,
  })

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  })

  // ── 4. Tratar resposta ───────────────────────────────────────────────────
  if (!response.ok) {
    const responseBody = await response.text().catch(() => '<não legível>')

    // Atualizar webhook_log com erro antes de lançar (rastreabilidade)
    await db
      .update(webhookLog)
      .set({
        status: 'failed',
        lastError: `HTTP ${response.status}: ${responseBody}`,
        attempts: sql`${webhookLog.attempts} + 1`,
      })
      .where(eq(webhookLog.externalEventId, externalEventId))

    // Lançar para Inngest fazer retry
    throw new NotazzHttpError(response.status, responseBody, transactionId)
  }

  // ── 5. Sucesso: marcar como processed ────────────────────────────────────
  // docs/40-integrations/04-notazz.md: 2xx → invoice_status='processing' aguarda webhook
  await db
    .update(webhookLog)
    .set({
      status: 'processed',
      processedAt: sql`now()`,
      attempts: sql`${webhookLog.attempts} + 1`,
    })
    .where(eq(webhookLog.externalEventId, externalEventId))
}

// ---------------------------------------------------------------------------
// buildNotazzPayload — função pura
// ---------------------------------------------------------------------------

/**
 * Monta NotazzInvoicePayload a partir de dados da transação e snapshot.
 * Função pura: não acessa DB — todos os dados são injetados como parâmetros.
 *
 * docs/40-integrations/04-notazz.md §Mapeamento canônico (outbound)
 * ADR-02: CNPJ emissor fixo por marca (snapshot.legal_entity.cnpj)
 */
export function buildNotazzPayload(params: {
  transactionId: string
  amount: number
  contactName: string
  contactCpf: string
  contactEmail: string
  issuingCnpj: string
  issuingIe?: string | undefined
  snapshotPayload: TransactionSnapshotPayload
}): NotazzInvoicePayload {
  const {
    transactionId,
    amount,
    contactName,
    contactCpf,
    contactEmail,
    issuingCnpj,
    issuingIe,
    snapshotPayload,
  } = params

  // Montar itens a partir do snapshot — apenas itens de produto (main, bonus, upsell, etc.)
  // docs/40-integrations/04-notazz.md: snapshot.items[] → payload.items[]
  const defaultNcm = process.env['NOTAZZ_DEFAULT_NCM']
  const defaultCfop = process.env['NOTAZZ_DEFAULT_CFOP']

  const productItems: NotazzInvoiceItem[] = snapshotPayload.items
    .filter((item) => item.product != null)
    .map((item) => {
      const invoiceItem: NotazzInvoiceItem = {
        description: item.product!.name,
        quantity: item.quantity,
        // OQ-NZ-01: Fase 1 usa preço total para cada item com produto
        unit_price: amount,
      }
      if (defaultNcm != null) invoiceItem.ncm = defaultNcm
      if (defaultCfop != null) invoiceItem.cfop = defaultCfop
      return invoiceItem
    })

  // Fallback: se não há itens com produto, criar item genérico com nome da oferta
  const items: NotazzInvoiceItem[] =
    productItems.length > 0
      ? productItems
      : (() => {
          const fallback: NotazzInvoiceItem = {
            description: snapshotPayload.offer.name,
            quantity: 1,
            unit_price: amount,
          }
          if (defaultNcm != null) fallback.ncm = defaultNcm
          if (defaultCfop != null) fallback.cfop = defaultCfop
          return [fallback]
        })()

  const issuer: NotazzIssuer = {
    // ADR-02: strip de não-dígitos do CNPJ do emissor
    cnpj: issuingCnpj.replace(/\D/g, ''),
  }
  if (issuingIe != null) issuer.ie = issuingIe

  return {
    transaction_id: transactionId,
    amount,
    customer: {
      name: contactName,
      cpf: contactCpf,
      email: contactEmail,
    },
    issuer,
    items,
  }
}
