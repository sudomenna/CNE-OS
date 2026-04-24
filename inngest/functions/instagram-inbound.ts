/**
 * MOD-INBOX — Inngest function: instagram-inbound
 *
 * Processes Instagram Direct webhook events asynchronously.
 *
 * Flow (canonical per docs/10-architecture/04-integrations-canonical.md):
 *   1. Read raw payload from webhook_log (by webhookLogId from event data)
 *   2. mapInstagramInbound → if null, mark processed and exit
 *   3. Lookup channel_account by pageId (external_id)
 *   4. resolveContactIdentity → create/update contact in transaction
 *   5. openOrReopenConversation
 *   6. appendMessage
 *   7. Mark webhook_log status = 'processed'
 *
 * BR-INTEGRATION-IDEMPOTENCY: idempotency is enforced at the route handler
 * level via webhook_log UNIQUE (provider, external_event_id). The Inngest
 * function only runs once per unique event.
 *
 * docs/20-domain/05-conversation-inbox.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { eq, and } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { channelAccount, channel } from '@/lib/db/schema/conversation'
import { contact } from '@/lib/db/schema/contact'
import { mapInstagramInbound } from '@/lib/integrations/instagram/map'
import { resolveContactIdentity } from '@/lib/domain/contact/resolve-identity'
import { openOrReopenConversation } from '@/lib/domain/inbox/open-or-reopen'
import { appendMessage } from '@/lib/domain/inbox/append-message'

// ---------------------------------------------------------------------------
// Event type published by the route handler
// ---------------------------------------------------------------------------

export type InstagramInboundEventData = {
  webhookLogId: string
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const instagramInbound = inngest.createFunction(
  {
    id: 'instagram-inbound',
    name: 'Instagram Inbound Message',
    retries: 5,
  },
  { event: 'instagram/webhook.received' },
  async ({ event, step }) => {
    const { webhookLogId } = event.data as InstagramInboundEventData

    // ── Step 1: Read payload from webhook_log ──────────────────────────────
    const logRow = await step.run('load-webhook-log', async () => {
      const rows = await db
        .select()
        .from(webhookLog)
        .where(eq(webhookLog.id, webhookLogId))
        .limit(1)
      return rows[0] ?? null
    })

    if (!logRow) {
      throw new Error(`instagram-inbound: webhook_log ${webhookLogId} not found`)
    }

    // ── Step 2: Map payload to canonical event ─────────────────────────────
    const mapped = await step.run('map-payload', async () => {
      return mapInstagramInbound(logRow.payload)
    })

    if (!mapped) {
      // Non-message event (read receipt, delivery, echo) — mark processed and exit
      await step.run('mark-processed-noop', async () => {
        await db
          .update(webhookLog)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookLog.id, webhookLogId))
      })
      return { skipped: true, reason: 'non-message event' }
    }

    // ── Step 3: Lookup channel_account by pageId ───────────────────────────
    const channelAccountRow = await step.run('lookup-channel-account', async () => {
      // channel_account.external_id = Instagram Page ID
      // Join channel to filter by kind='instagram'
      const rows = await db
        .select({ id: channelAccount.id, brandId: channelAccount.brandId })
        .from(channelAccount)
        .innerJoin(channel, eq(channelAccount.channelId, channel.id))
        .where(
          and(
            eq(channelAccount.externalId, mapped.pageId),
            eq(channel.kind, 'instagram'),
            eq(channelAccount.isActive, true),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    })

    if (!channelAccountRow) {
      throw new Error(
        `instagram-inbound: channel_account not found for pageId=${mapped.pageId}`,
      )
    }

    // ── Steps 4-6: Resolve contact + open conversation + append message ────
    // All in a single DB transaction for atomicity (ADR-11, ADR-15)
    await step.run('process-message', async () => {
      await db.transaction(async (tx) => {
        // Step 4a: resolve or create contact
        // Instagram webhook does not carry CPF, phone or email — only Instagram user ID.
        // BR-IDENTITY caso #9: nada bate → create (with empty name as placeholder).
        // The 'message' origin is correct per resolveContactIdentity signature.
        const resolution = await resolveContactIdentity(
          {
            fullName: mapped.fromDisplayName || `Instagram ${mapped.fromInstagramId}`,
            origin: 'message',
            sourceRef: `instagram:${mapped.fromInstagramId}`,
          },
          tx,
        )

        let contactId: string

        if (resolution.action === 'create') {
          // Insert new contact — placeholder name, will be enriched later
          const inserted = await tx
            .insert(contact)
            .values({
              fullName: mapped.fromDisplayName || `Instagram ${mapped.fromInstagramId}`,
              origin: 'message',
              status: 'active',
              classification: 'lead',
            })
            .returning({ id: contact.id })
          const newContact = inserted[0]
          if (!newContact) throw new Error('instagram-inbound: failed to insert contact')
          contactId = newContact.id
        } else {
          // 'noop' or 'update' — use existing contactId
          contactId = resolution.contactId
        }

        // Step 5: Open or reopen conversation
        const conv = await openOrReopenConversation(tx, {
          contactId,
          channelAccountId: channelAccountRow.id,
          externalThreadId: mapped.externalThreadId,
          actorSystem: 'instagram-webhook',
        })

        // Step 6: Append message (idempotent via external_message_id)
        // Note: Inngest step.run serialises return values as JSON, so Date objects
        // become ISO strings. We convert back here before passing to appendMessage.
        const sentAt = new Date(mapped.sentAt as unknown as string)
        await appendMessage(tx, {
          conversationId: conv.id,
          direction: 'inbound',
          body: mapped.body,
          externalMessageId: mapped.externalMessageId,
          actorSystem: 'instagram-webhook',
          sentAt,
        })

        // Mark webhook_log as processed within the same transaction
        await tx
          .update(webhookLog)
          .set({ status: 'processed', processedAt: new Date() })
          .where(eq(webhookLog.id, webhookLogId))
      })
    })

    return { processed: true, messageId: mapped.externalMessageId }
  },
)
