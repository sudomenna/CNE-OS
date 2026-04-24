/**
 * MOD-INBOX / T-3-09 — Inngest cron: email IMAP polling
 *
 * Roda a cada 1 minuto. Para cada e-mail não-lido:
 *   1. Verifica idempotência via webhook_log (UNIQUE provider + external_event_id)
 *   2. Resolve/cria contato via resolveContactIdentity
 *   3. Abre/reabre conversa via openOrReopenConversation
 *   4. Persiste mensagem via appendMessage
 *   5. Atualiza webhook_log.status = 'processed'
 *
 * Se EMAIL_IMAP_HOST não configurado, sai silenciosamente (canal não ativado).
 *
 * docs/20-domain/05-conversation-inbox.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 * ADR-16: externalMessageId = messageId sem < >
 */
import { eq, and, sql } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { channelAccount, channel } from '@/lib/db/schema/conversation'
import { contact as contactTable, contactEmail } from '@/lib/db/schema/contact'
import { resolveContactIdentity } from '@/lib/domain/contact/resolve-identity'
import { openOrReopenConversation } from '@/lib/domain/inbox/open-or-reopen'
import { appendMessage } from '@/lib/domain/inbox/append-message'
import { pollImap } from '@/lib/integrations/email/poll'
import type { ParsedEmail } from '@/lib/integrations/email/map'

// ---------------------------------------------------------------------------
// Inngest cron function
// ---------------------------------------------------------------------------

export const emailPoll = inngest.createFunction(
  {
    id: 'email-imap-poll',
    name: 'Email IMAP Poll (cron)',
    retries: 0, // cron: falha nesta rodada, tenta na próxima
    concurrency: { limit: 1 }, // evita overlap de duas rodadas simultâneas
  },
  { cron: '0/1 * * * *' }, // a cada 1 minuto
  async ({ step }) => {
    // ── Verificar se canal está configurado ─────────────────────────────
    const imapHost = process.env['EMAIL_IMAP_HOST']
    if (!imapHost) {
      // Canal de e-mail não ativado — saída silenciosa
      return { skipped: true, reason: 'EMAIL_IMAP_HOST not configured' }
    }

    const imapPort = parseInt(process.env['EMAIL_IMAP_PORT'] ?? '993', 10)
    const imapUser = process.env['EMAIL_IMAP_USER'] ?? ''
    const imapPassword = process.env['EMAIL_IMAP_PASSWORD'] ?? ''
    const channelAccountId = process.env['EMAIL_CHANNEL_ACCOUNT_ID'] ?? ''

    if (!imapUser || !imapPassword || !channelAccountId) {
      console.warn('[email-poll] missing required env vars: EMAIL_IMAP_USER, EMAIL_IMAP_PASSWORD or EMAIL_CHANNEL_ACCOUNT_ID')
      return { skipped: true, reason: 'missing required env vars' }
    }

    // ── Buscar channel_account configurada para e-mail ───────────────────
    const channelAccountRow = await step.run('lookup-channel-account', async () => {
      const rows = await db
        .select({ id: channelAccount.id, brandId: channelAccount.brandId })
        .from(channelAccount)
        .innerJoin(channel, eq(channelAccount.channelId, channel.id))
        .where(
          and(
            eq(channelAccount.id, channelAccountId),
            eq(channel.kind, 'email'),
            eq(channelAccount.isActive, true),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })

    if (!channelAccountRow) {
      console.warn('[email-poll] channel_account not found or inactive', { channelAccountId })
      return { skipped: true, reason: 'channel_account not found' }
    }

    // ── Coletar e-mails via IMAP ─────────────────────────────────────────
    const collectedEmails: ParsedEmail[] = []

    await step.run('poll-imap', async () => {
      await pollImap(
        { host: imapHost, port: imapPort, user: imapUser, password: imapPassword },
        async (email) => {
          collectedEmails.push(email)
        },
      )
    })

    if (collectedEmails.length === 0) {
      return { processed: 0 }
    }

    // ── Processar cada e-mail coletado ───────────────────────────────────
    let processedCount = 0

    for (const email of collectedEmails) {
      const externalEventId = email.messageId

      await step.run(`process-email-${externalEventId}`, async () => {
        // ── Idempotência: verificar webhook_log ──────────────────────────
        // BR-INTEGRATION-IDEMPOTENCY: INSERT ON CONFLICT DO NOTHING
        const insertResult = await db
          .insert(webhookLog)
          .values({
            provider: 'email',
            externalEventId,
            eventKind: 'email_inbound',
            payload: email as unknown as Record<string, unknown>,
            status: 'received',
          })
          .onConflictDoNothing()
          .returning({ id: webhookLog.id })

        if (!insertResult || insertResult.length === 0) {
          // Evento já existia — idempotência garantida, sair sem reprocessar
          return { duplicate: true }
        }

        const logId = insertResult[0]!.id

        // ── Processar dentro de transação ────────────────────────────────
        await db.transaction(async (tx) => {
          // Resolver/criar contato via e-mail
          const resolution = await resolveContactIdentity(
            {
              email: email.from,
              fullName: email.fromName || email.from,
              origin: 'message',
              sourceRef: `email:${email.messageId}`,
            },
            tx,
          )

          let contactId: string

          if (resolution.action === 'create') {
            // Criar novo contato com e-mail como identidade primária
            const [created] = await tx
              .insert(contactTable)
              .values({
                fullName: email.fromName || email.from,
                origin: 'message',
                status: 'active',
                classification: 'lead',
              })
              .returning()

            if (!created) {
              throw new Error('[email-poll] failed to insert contact')
            }

            contactId = created.id

            // Inserir e-mail primário do contato
            await tx.insert(contactEmail).values({
              contactId,
              email: email.from,
              status: 'primary',
            })
          } else {
            contactId = resolution.contactId
          }

          // Abrir/reabrir conversa
          const conv = await openOrReopenConversation(tx, {
            contactId,
            channelAccountId: channelAccountRow.id,
            // Para e-mail, externalThreadId = messageId (ou In-Reply-To para threading)
            externalThreadId: email.inReplyTo ?? email.messageId,
            actorSystem: 'email-poll',
          })

          // Persistir mensagem inbound (idempotente via external_message_id)
          await appendMessage(tx, {
            conversationId: conv.id,
            direction: 'inbound',
            body: email.body,
            externalMessageId: email.messageId,
            actorSystem: 'email-poll',
            sentAt: email.sentAt,
          })

          // Marcar webhook_log como processado (dentro da mesma transação)
          await tx
            .update(webhookLog)
            .set({
              status: 'processed',
              processedAt: new Date(),
              attempts: sql`attempts + 1`,
            })
            .where(eq(webhookLog.id, logId))
        })

        processedCount++
        return { processed: true }
      })
    }

    return { processed: processedCount, total: collectedEmails.length }
  },
)
