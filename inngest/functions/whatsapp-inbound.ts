/**
 * MOD-INBOX / T-3-07 — Inngest function: processamento de mensagem inbound WhatsApp
 *
 * Fluxo:
 *   1. Recebe evento 'whatsapp/message.inbound' com { webhookLogId, correlationId }
 *   2. Lê payload bruto do webhook_log
 *   3. Chama mapWhatsAppInbound — se null, sai sem erro (status/read receipt)
 *   4. Busca channel_account por external_id = phoneNumberId
 *   5. Se não encontrado, loga e sai (canal não configurado — sem erro Inngest)
 *   6. Resolve/cria contato via resolveContactIdentity + persistência
 *   7. Abre/reabre conversa via openOrReopenConversation
 *   8. Persiste mensagem via appendMessage
 *   9. Se mídia: insere message_attachment
 *  10. Atualiza webhook_log.status = 'processed'
 *
 * docs/30-contracts/04-webhook-contracts.md §3
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { eq } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { channelAccount } from '@/lib/db/schema/conversation'
import { messageAttachment } from '@/lib/db/schema/conversation'
import { contact as contactTable, contactPhone } from '@/lib/db/schema/contact'
import { openOrReopenConversation } from '@/lib/domain/inbox/open-or-reopen'
import { appendMessage } from '@/lib/domain/inbox/append-message'
import { resolveContactIdentity } from '@/lib/domain/contact/resolve-identity'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { mapWhatsAppInbound } from '@/lib/integrations/whatsapp/map'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const whatsappInbound = inngest.createFunction(
  {
    id: 'whatsapp-message-inbound',
    retries: 5,
    concurrency: { limit: 20, key: 'event.data.webhookLogId' },
  },
  { event: 'whatsapp/message.inbound' as const },
  async ({ event, step }) => {
    const { webhookLogId, correlationId } = event.data as {
      webhookLogId: string
      correlationId: string
    }

    await step.run('process-whatsapp-message', async () => {
      // ── 1. Carregar payload bruto do webhook_log ────────────────────────
      const logRows = await db
        .select({
          id: webhookLog.id,
          payload: webhookLog.payload,
          status: webhookLog.status,
        })
        .from(webhookLog)
        .where(eq(webhookLog.id, webhookLogId))

      const logEntry = logRows[0]
      if (!logEntry) {
        // Linha não encontrada — não lançar erro (evita retry infinito)
        console.warn('[whatsapp-inbound] webhook_log not found', { webhookLogId, correlationId })
        return
      }

      // Idempotência dupla: se já processado, sair
      if (logEntry.status === 'processed') {
        return
      }

      // ── 2. Mapear payload → tipo canônico ─────────────────────────────
      const event_ = mapWhatsAppInbound(logEntry.payload)

      if (!event_) {
        // Payload sem mensagem inbound (status update, read receipt) — marcar como processed
        await db
          .update(webhookLog)
          .set({ status: 'processed', processedAt: sql`now()`, attempts: sql`attempts + 1` })
          .where(eq(webhookLog.id, webhookLogId))
        return
      }

      // ── 3. Buscar channel_account por phoneNumberId ────────────────────
      // O external_id de channel_account para WhatsApp é o phone_number_id da Meta
      const channelAccountRows = await db
        .select()
        .from(channelAccount)
        .where(eq(channelAccount.externalId, event_.phoneNumberId))

      const ca = channelAccountRows[0]
      if (!ca) {
        // Canal não configurado — logar e sair sem erro (não queremos retry)
        console.warn('[whatsapp-inbound] channel_account not found for phoneNumberId', {
          phoneNumberId: event_.phoneNumberId,
          correlationId,
        })
        await db
          .update(webhookLog)
          .set({
            status: 'failed',
            lastError: `channel_account not found for phoneNumberId=${event_.phoneNumberId}`,
            attempts: sql`attempts + 1`,
          })
          .where(eq(webhookLog.id, webhookLogId))
        return
      }

      // ── 4. Resolver/criar contato ────────────────────────────────────
      await db.transaction(async (tx) => {
        const resolution = await resolveContactIdentity(
          {
            phoneE164: event_.fromPhoneNumber,
            fullName: event_.fromDisplayName,
            origin: 'message',
            sourceRef: `whatsapp:${event_.externalMessageId}`,
          },
          tx,
        )

        let contactId: string

        if (resolution.action === 'create') {
          // Criar novo contato
          const [created] = await tx
            .insert(contactTable)
            .values({
              fullName: event_.fromDisplayName,
              origin: 'message',
            })
            .returning()

          if (!created) {
            throw new Error('[whatsapp-inbound] failed to insert contact')
          }

          contactId = created.id

          // Inserir telefone primário
          await tx.insert(contactPhone).values({
            contactId,
            e164: event_.fromPhoneNumber,
            status: 'primary',
          })

          await emitTimelineEvent(
            {
              contactId,
              kind: 'contact_created',
              source: 'MOD-INBOX',
              actorSystem: 'whatsapp-webhook',
              payload: {
                origin: 'message',
                source_ref: `whatsapp:${event_.externalMessageId}`,
              },
            },
            tx,
          )
        } else {
          contactId = resolution.contactId
        }

        // ── 5. Abrir/reabrir conversa ──────────────────────────────────
        const conv = await openOrReopenConversation(tx, {
          contactId,
          channelAccountId: ca.id,
          externalThreadId: event_.externalThreadId ?? null,
          actorSystem: 'whatsapp-webhook',
        })

        // ── 6. Persistir mensagem ─────────────────────────────────────
        const msg = await appendMessage(tx, {
          conversationId: conv.id,
          direction: 'inbound',
          body: event_.body,
          externalMessageId: event_.externalMessageId,
          actorSystem: 'whatsapp-webhook',
          sentAt: event_.sentAt,
        })

        // ── 7. Anexo de mídia (se houver) ─────────────────────────────
        if (event_.kind !== 'text' && event_.mediaId) {
          await tx.insert(messageAttachment).values({
            messageId: msg.id,
            kind: event_.kind,
            // URL será resolvida pela camada de download de mídia (FLOW-INBOX-MEDIA)
            // Por ora, armazena o media_id como placeholder
            url: `whatsapp-media:${event_.mediaId}`,
            mimeType: event_.mediaMimeType ?? null,
          })
        }

        // ── 8. Marcar como processado ────────────────────────────────
        await db
          .update(webhookLog)
          .set({
            status: 'processed',
            processedAt: sql`now()`,
            attempts: sql`attempts + 1`,
          })
          .where(eq(webhookLog.id, webhookLogId))
      })
    })
  },
)
