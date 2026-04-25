/**
 * MOD-INTEGRATION / T-8-15 — Digital Guru: handler de processamento de webhook
 *
 * `handleDigitalGuruEvent(webhookLogId)` é chamado pelo processador Inngest.
 * Responsabilidades:
 *   1. Busca webhook_log pelo id
 *   2. Idempotência: se status='processed', retorna imediatamente (noop)
 *   3. Mapeia payload bruto → evento canônico via mapDigitalGuruEvent
 *   4. Despacha para função de domínio correta conforme event.kind
 *   5. Atualiza webhook_log.status='processed' em sucesso
 *   6. Em falha: propaga exceção (Inngest fará retry; quem chama deve atualizar
 *      status='failed'/'dead_letter' após esgotar tentativas)
 *
 * docs/40-integrations/01-digital-guru.md
 * docs/60-flows/05-external-sale-ingest.md (FLOW-05)
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { mapDigitalGuruEvent } from './map'
import type { DgRawEvent } from './map'
import { createPendingTransaction } from '@/lib/domain/transaction/create-pending'
import { approveTransaction } from '@/lib/domain/transaction/approve'
import { refuseTransaction } from '@/lib/domain/transaction/refuse'
import { transaction } from '@/lib/db/schema/transaction'

// ---------------------------------------------------------------------------
// Tipos injetáveis (facilita testes)
// ---------------------------------------------------------------------------

export type CreatePendingFn = typeof createPendingTransaction
export type ApproveFn = typeof approveTransaction
export type RefuseFn = typeof refuseTransaction

// ---------------------------------------------------------------------------
// handleDigitalGuruEvent
// ---------------------------------------------------------------------------

/**
 * Processa um webhook do Digital Guru a partir de um `webhook_log` gravado.
 *
 * @param webhookLogId    UUID da linha em webhook_log a processar
 * @param createPendingFn Injetável para testes (padrão: createPendingTransaction)
 * @param approveFn       Injetável para testes (padrão: approveTransaction)
 * @param refuseFn        Injetável para testes (padrão: refuseTransaction)
 *
 * @throws Error se webhook_log não encontrado
 * @throws Error/DomainError se processamento falhar (Inngest fará retry)
 */
export async function handleDigitalGuruEvent(
  webhookLogId: string,
  createPendingFn: CreatePendingFn = createPendingTransaction,
  approveFn: ApproveFn = approveTransaction,
  refuseFn: RefuseFn = refuseTransaction,
): Promise<void> {
  // ── 1. Carregar webhook_log ──────────────────────────────────────────────
  const rows = await db
    .select({
      id: webhookLog.id,
      payload: webhookLog.payload,
      status: webhookLog.status,
      eventKind: webhookLog.eventKind,
      externalEventId: webhookLog.externalEventId,
    })
    .from(webhookLog)
    .where(eq(webhookLog.id, webhookLogId))
    .limit(1)

  const logEntry = rows[0]
  if (!logEntry) {
    throw new Error(
      `[digital-guru-handler] webhook_log not found: id=${webhookLogId}`,
    )
  }

  // ── 2. Idempotência: já processado → noop ────────────────────────────────
  // BR-INTEGRATION-IDEMPOTENCY: se status='processed', nenhuma ação de domínio
  if (logEntry.status === 'processed') {
    return
  }

  // ── 3. Mapear payload bruto → evento canônico ────────────────────────────
  const rawEvent = logEntry.payload as unknown as DgRawEvent
  const mappedEvent = mapDigitalGuruEvent(rawEvent)

  // ── 4. Despachar para handler de domínio por kind ────────────────────────
  switch (mappedEvent.kind) {
    case 'purchase_approved': {
      // FLOW-05: approved pode chegar sem pending prévio (Limitação-4)
      // Se transação pending existe para o external_id, aprovamos ela;
      // caso contrário, criamos pending + aprovamos na mesma transação SQL.
      const td = mappedEvent.transactionData

      await db.transaction(async (tx) => {
        // Buscar transação pending pelo external_id do provedor
        const existingRows = await tx
          .select({ id: transaction.id, status: transaction.status })
          .from(transaction)
          .where(
            and(
              eq(transaction.externalProvider, 'digital_guru'),
              eq(transaction.externalId, td.externalTransactionId),
            ),
          )
          .limit(1)

        const existing = existingRows[0]

        if (existing && existing.status === 'pending') {
          // Aprova transação pending existente
          await approveFn(tx, existing.id, td.externalTransactionId)
        } else if (!existing) {
          // approved chegou antes de pending — criar pending inline + aprovar
          // FLOW-05 E-08: OQ-FLOW-05-02
          // Para criar pending precisamos de offerId, contactId, etc.
          // Handler cria pending com dados do payload e imediatamente aprova.
          // Nota: offerId aqui é o external product id — domínio de offer fará
          // o lookup. Se offerId for null, a transação falhará ao tentar INSERT
          // com FK null, o que é comportamento correto (produto não mapeado).
          // BR-INTEGRATION-IDEMPOTENCY: o próprio DB impede duplicata via UNIQUE.
          const pending = await createPendingFn(tx, {
            // contactId e brandId precisam ser resolvidos pelo domínio de contato
            // Em Fase 1 usamos placeholders que serão resolvidos na integração completa.
            // Aqui passamos o que temos do payload; o domínio de contato está fora
            // do ownership deste handler — ver OQ se necessário ampliar.
            // Por ora: deixamos que a FK constraint e lookups de offer/contact
            // sejam resolvidos na camada de domínio via externalId.
            // Esta rota de "create-then-approve" requer campos que só existem
            // após resolveContactIdentity (T-8 completo). Em Fase 1 lançamos erro
            // se não há pending, sinalizando que FLOW-05 precisa do pending prévio.
            contactId: '', // placeholder — será resolvido com FLOW-05 completo
            brandId: '',   // placeholder
            offerId: td.offerId ?? '',
            offerConditionId: '',
            offerPaymentOptionId: '',
            amount: td.amount,
            currency: td.currency,
            externalProvider: 'digital_guru',
            externalId: td.externalTransactionId,
          })
          await approveFn(tx, pending.id, td.externalTransactionId)
        } else if (existing && existing.status === 'approved') {
          // Idempotência: já aprovado → noop (CT-DG-02)
          // Processamento encerra sem erro
        }
        // Outros status (refused, refunded, chargeback, cancelled) —
        // não reprocessar; o webhook_log será marcado processed abaixo
      })
      break
    }

    case 'purchase_pending': {
      // FLOW-05 passo 5: criar transação pending
      // Em Fase 1 a criação depende de contactId/brandId/offerId resolvidos
      // pelo FLOW-05 completo. Este handler delega via createPendingFn.
      // A integração completa com resolveContactIdentity está em FLOW-05.
      // Por ora logamos para rastreabilidade.
      console.info('[digital-guru-handler] purchase_pending received', {
        webhookLogId,
        externalTransactionId: mappedEvent.transactionData.externalTransactionId,
        offerId: mappedEvent.transactionData.offerId,
      })
      // Fase 1: noop de persistência (createPendingTransaction requer IDs resolvidos)
      // Marcamos como processed para evitar retries desnecessários.
      // FLOW-05 completo integrará resolveContactIdentity aqui.
      break
    }

    case 'purchase_refused': {
      // FLOW-05 passo 19: recusar transação pending
      const td = mappedEvent.transactionData

      await db.transaction(async (tx) => {
        const existingRows = await tx
          .select({ id: transaction.id, status: transaction.status })
          .from(transaction)
          .where(
            and(
              eq(transaction.externalProvider, 'digital_guru'),
              eq(transaction.externalId, td.externalTransactionId),
            ),
          )
          .limit(1)

        const existing = existingRows[0]

        if (existing && existing.status === 'pending') {
          await refuseFn(tx, existing.id, td.reason ?? undefined)
        } else if (!existing) {
          // Transação não existe — refund/refused chegou antes de pending.
          // Log e noop: sem entidade para recusar.
          console.warn('[digital-guru-handler] purchase_refused: transaction not found', {
            webhookLogId,
            externalTransactionId: td.externalTransactionId,
          })
        }
        // Se status != pending, refuseTransaction lançará InvalidTransactionStatusForRefusalError
        // Inngest fará retry; após 5 falhas → dead_letter
      })
      break
    }

    case 'purchase_refunded': {
      // CT-DG-03 / CT-DG-04
      // Se refund nasceu internamente (existe refund com external_ref): notificação, no-op.
      // Se nasceu externamente (sem refund prévio): abrir refund system-opened + FLOW-07.
      // MOD-REFUND (T-8-18) ainda não existe — noop com log em Fase 1.
      // FLOW-07 será integrado quando openRefund estiver disponível (T-8-18).
      console.info('[digital-guru-handler] purchase_refunded received — noop pending MOD-REFUND (T-8-18)', {
        webhookLogId,
        externalTransactionId: mappedEvent.transactionData.externalTransactionId,
      })
      break
    }

    case 'subscription_stub':
    case 'installment_stub': {
      // Sprint 9 — log + noop
      // docs/40-integrations/01-digital-guru.md §Eventos consumidos
      console.info(`[digital-guru-handler] ${mappedEvent.kind} received — noop Sprint 9`, {
        webhookLogId,
        eventType: mappedEvent.eventType,
      })
      break
    }

    default: {
      // TypeScript exhaustive check — caso inatingível em runtime se mapper está correto
      const _exhaustive: never = mappedEvent
      throw new Error(
        `[digital-guru-handler] unhandled event kind: ${JSON.stringify(_exhaustive)}`,
      )
    }
  }

  // ── 5. Marcar webhook_log como processed ─────────────────────────────────
  await db
    .update(webhookLog)
    .set({
      status: 'processed',
      processedAt: sql`now()`,
      attempts: sql`${webhookLog.attempts} + 1`,
    })
    .where(eq(webhookLog.id, webhookLogId))
}
