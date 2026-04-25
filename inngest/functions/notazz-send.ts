/**
 * MOD-INTEGRATION / T-8-20 — Inngest function: Notazz outbound invoice request
 *
 * Evento: 'notazz/invoice.requested'
 * Payload: { transactionId: string, correlationId: string }
 *
 * Fluxo:
 *   1. Carrega transaction + snapshot para montar NotazzInvoicePayload.
 *   2. Chama sendInvoiceRequest (idempotente via webhook_log).
 *   3. Sucesso → webhook_log.status='processed' (gerenciado por sendInvoiceRequest).
 *   4. Falha → Inngest retentar com backoff; após MAX_ATTEMPTS → dead_letter.
 *
 * Retry: 3 tentativas (docs/40-integrations/04-notazz.md §Idempotência/retry/DLQ
 *        define 5×, mas T-8-20 especifica 3 tentativas para stub Fase 1).
 * DLQ: após 3 falhas → webhook_log.status='dead_letter' + log estruturado.
 *
 * Disparado por: approveTransaction → inngest.send('notazz/invoice.requested')
 * Chamado de: lib/domain/transaction/approve.ts (via Server Action ou DG handler)
 *
 * docs/40-integrations/04-notazz.md §Eventos emitidos
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 * ADR-02: CNPJ emissor fixo por marca (snapshot.legal_entity.cnpj)
 */

import { and, eq, sql } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { transaction, transactionSnapshot } from '@/lib/db/schema/transaction'
import { contact, contactEmail, contactDocument } from '@/lib/db/schema/contact'
import {
  sendInvoiceRequest,
  buildNotazzPayload,
} from '@/lib/integrations/notazz/send'
import type { TransactionSnapshotPayload } from '@/lib/domain/transaction/snapshot'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

export const NOTAZZ_MAX_ATTEMPTS = 3

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const notazzSend = inngest.createFunction(
  {
    id: 'notazz-invoice-send',
    retries: NOTAZZ_MAX_ATTEMPTS,
    concurrency: {
      // Serializar por transactionId para evitar envios duplicados simultâneos
      limit: 1,
      key: 'event.data.transactionId',
    },
  },
  { event: 'notazz/invoice.requested' as const },
  async ({ event, step, attempt }) => {
    const { transactionId, correlationId } = event.data as {
      transactionId: string
      correlationId?: string
    }

    const externalEventId = `notazz:invoice:${transactionId}`

    // ── Passo 1: Guard de idempotência ────────────────────────────────────
    // Se webhook_log já está 'processed', a NF foi solicitada com sucesso.
    // Não reprocessar — cobre replay manual e race entre retries.
    // BR-INTEGRATION-IDEMPOTENCY
    const idempotencyStatus = await step.run('check-idempotency', async () => {
      const rows = await db
        .select({ status: webhookLog.status })
        .from(webhookLog)
        .where(eq(webhookLog.externalEventId, externalEventId))
        .limit(1)

      return rows[0]?.status ?? null
    })

    if (idempotencyStatus === 'processed') {
      return { skipped: true, reason: 'already_processed' }
    }

    // ── Passo 2: Carregar dados da transação ──────────────────────────────
    const transactionData = await step.run('load-transaction', async () => {
      const rows = await db
        .select({
          id: transaction.id,
          amount: transaction.amount,
          contactId: transaction.contactId,
          snapshotId: transaction.snapshotId,
          status: transaction.status,
        })
        .from(transaction)
        .where(eq(transaction.id, transactionId))
        .limit(1)

      const trx = rows[0]
      if (!trx) {
        throw new Error(
          `[notazz-send] transaction not found: id=${transactionId}`,
        )
      }
      if (trx.status !== 'approved') {
        throw new Error(
          `[notazz-send] transaction ${transactionId} not approved (status=${trx.status}) — cannot emit invoice`,
        )
      }
      if (!trx.snapshotId) {
        throw new Error(
          `[notazz-send] transaction ${transactionId} has no snapshot — cannot emit invoice`,
        )
      }
      return trx
    })

    // ── Passo 3: Carregar snapshot ────────────────────────────────────────
    const snapshotPayload = await step.run('load-snapshot', async () => {
      const rows = await db
        .select({ payload: transactionSnapshot.payload })
        .from(transactionSnapshot)
        .where(eq(transactionSnapshot.id, transactionData.snapshotId!))
        .limit(1)

      const snap = rows[0]
      if (!snap) {
        throw new Error(
          `[notazz-send] snapshot not found: id=${transactionData.snapshotId} (transaction=${transactionId})`,
        )
      }

      // CT-NZ-09: snapshot sem legal_entity → falha fatal (DLQ imediato)
      const payload = snap.payload as unknown as TransactionSnapshotPayload
      if (!payload.legal_entity?.cnpj) {
        // NonRetryableError seria ideal aqui, mas usamos Error + flag para o catch
        // tratar como fatal. Em produção pode ser substituído por NonRetryableError
        // do SDK Inngest quando disponível.
        throw Object.assign(
          new Error(
            `[notazz-send] snapshot ${transactionData.snapshotId} has no legal_entity.cnpj — fatal, cannot emit invoice`,
          ),
          { fatal: true },
        )
      }

      return payload
    })

    // ── Passo 4: Carregar dados do contato ────────────────────────────────
    const contactData = await step.run('load-contact', async () => {
      const contactRows = await db
        .select({
          id: contact.id,
          fullName: contact.fullName,
          cpf: contact.cpf,
        })
        .from(contact)
        .where(eq(contact.id, transactionData.contactId))
        .limit(1)

      const c = contactRows[0]
      if (!c) {
        throw new Error(
          `[notazz-send] contact not found: id=${transactionData.contactId}`,
        )
      }

      // Buscar email primário do contato
      const emailRows = await db
        .select({ email: contactEmail.email })
        .from(contactEmail)
        .where(eq(contactEmail.contactId, c.id))
        .limit(1)

      const primaryEmail = emailRows[0]?.email ?? ''

      // CPF: do contato (campo direto) ou de contact_document
      let cpf = c.cpf ?? ''
      if (!cpf) {
        const docRows = await db
          .select({ value: contactDocument.value })
          .from(contactDocument)
          .where(
            and(
              eq(contactDocument.contactId, c.id),
              eq(contactDocument.kind, 'cpf'),
            ),
          )
          .limit(1)

        cpf = docRows[0]?.value ?? ''
      }

      return {
        fullName: c.fullName,
        cpf,
        email: primaryEmail,
      }
    })

    // ── Passo 5: Montar payload e enviar ──────────────────────────────────
    try {
      await step.run('send-invoice-request', async () => {
        const notazzPayload = buildNotazzPayload({
          transactionId,
          amount: parseFloat(transactionData.amount),
          contactName: contactData.fullName,
          contactCpf: contactData.cpf,
          contactEmail: contactData.email,
          issuingCnpj: snapshotPayload.legal_entity.cnpj,
          snapshotPayload,
        })

        await sendInvoiceRequest(transactionId, notazzPayload)
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      const isFatal = err instanceof Error && (err as Error & { fatal?: boolean }).fatal === true
      const isLastAttempt = attempt >= NOTAZZ_MAX_ATTEMPTS - 1

      // Atualizar webhook_log para dead_letter na última tentativa ou erro fatal
      if (isLastAttempt || isFatal) {
        await step.run('mark-dead-letter', async () => {
          await db
            .update(webhookLog)
            .set({
              status: 'dead_letter',
              lastError: errorMessage,
              deadLetteredAt: sql`now()`,
            })
            .where(eq(webhookLog.externalEventId, externalEventId))

          // DLQ: log estruturado para Sentry/Axiom + alerta financeiro
          // docs/40-integrations/04-notazz.md §Idempotência/retry/DLQ
          console.error('[notazz-send] dead_letter after max attempts or fatal error', {
            transactionId,
            correlationId,
            externalEventId,
            attempt,
            maxAttempts: NOTAZZ_MAX_ATTEMPTS,
            lastError: errorMessage,
            isFatal,
          })
        })

        // Não re-lançar erro fatal — evita loop infinito de retries
        if (isFatal) {
          return { dead_letter: true, reason: 'fatal_error', error: errorMessage }
        }
      }

      if (!isLastAttempt && !isFatal) {
        // Re-lançar para Inngest executar retry com backoff
        throw err
      }
    }

    return { sent: true, transactionId }
  },
)
