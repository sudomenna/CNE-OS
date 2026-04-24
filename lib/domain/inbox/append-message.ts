/**
 * MOD-INBOX — appendMessage
 *
 * docs/20-domain/05-conversation-inbox.md §2
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { conversation, message } from '@/lib/db/schema/conversation'
import type { Message } from '@/lib/db/schema/conversation'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { ConversationNotFoundError, ConversationClosedError } from './errors'

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type AppendMessageInput = {
  /** ID da conversa à qual a mensagem pertence. */
  conversationId: string
  /** Direção da mensagem: 'inbound' (do contato) ou 'outbound' (do atendente/sistema). */
  direction: 'inbound' | 'outbound'
  /** Corpo textual da mensagem. */
  body: string
  /**
   * ID da mensagem no provedor externo (ex: WhatsApp message id).
   * Quando informado, garante idempotência: segunda chamada com o mesmo ID
   * retorna o registro existente sem duplicar.
   * BR-INTEGRATION-IDEMPOTENCY
   */
  externalMessageId?: string | null
  /** ID do usuário humano que enviou (outbound por atendente). */
  actorUserId?: string | null
  /** Identificador do sistema que gerou a mensagem (ex: 'whatsapp-webhook'). */
  actorSystem?: string | null
  /** Timestamp de envio confirmado pelo provedor. Opcional. */
  sentAt?: Date | null
}

// ---------------------------------------------------------------------------
// appendMessage
// ---------------------------------------------------------------------------

/**
 * Persiste uma nova mensagem em uma conversa existente.
 *
 * Comportamento:
 * 1. Carrega a conversa para validar existência e status.
 * 2. Proíbe outbound em conversa 'closed' (BR-INBOX-CONVERSATION §enforcement).
 * 3. Se externalMessageId informado: tenta INSERT; em conflito (uq_message_external)
 *    → retorna mensagem existente (idempotência, BR-INTEGRATION-IDEMPOTENCY).
 * 4. Se sem externalMessageId: INSERT direto.
 * 5. UPDATE conversation.last_message_at = now().
 * 6. Emite TE-MESSAGE-INBOUND ou TE-MESSAGE-OUTBOUND.
 */
export async function appendMessage(
  tx: DbTx,
  input: AppendMessageInput,
): Promise<Message> {
  const { conversationId, direction, body, externalMessageId, actorUserId, actorSystem, sentAt } =
    input

  // Carregar conversa para validar existência e status.
  const convRows = await tx
    .select({
      id: conversation.id,
      status: conversation.status,
      contactId: conversation.contactId,
    })
    .from(conversation)
    .where(eq(conversation.id, conversationId))

  const conv = convRows[0]
  if (!conv) {
    throw new ConversationNotFoundError(conversationId)
  }

  // BR-INBOX-CONVERSATION §enforcement: outbound em conversa closed é proibido.
  // docs/20-domain/05-conversation-inbox.md §6
  if (direction === 'outbound' && conv.status === 'closed') {
    throw new ConversationClosedError(conversationId)
  }

  // BR-INTEGRATION-IDEMPOTENCY: se externalMessageId informado, tenta INSERT
  // com ON CONFLICT — em caso de conflito retorna mensagem existente.
  if (externalMessageId) {
    // Tenta INSERT primeiro.
    let insertedMessage: Message | undefined

    try {
      const insertedRows = await tx
        .insert(message)
        .values({
          conversationId,
          direction,
          body,
          externalMessageId,
          actorUserId: actorUserId ?? null,
          actorSystem: actorSystem ?? null,
          sentAt: sentAt ?? null,
        })
        .returning()

      insertedMessage = insertedRows[0]
    } catch (err) {
      // Detectar violação do índice único uq_message_external.
      // BR-INTEGRATION-IDEMPOTENCY: segunda entrega do mesmo external_message_id → retornar existente.
      const isUniqueViolation =
        err instanceof Error &&
        (err.message.includes('uq_message_external') ||
          err.message.includes('unique constraint') ||
          err.message.includes('duplicate key'))

      if (isUniqueViolation) {
        // Buscar e retornar a mensagem existente.
        const existingRows = await tx
          .select()
          .from(message)
          .where(
            and(
              eq(message.conversationId, conversationId),
              eq(message.externalMessageId, externalMessageId),
              isNotNull(message.externalMessageId),
            ),
          )

        const existing = existingRows[0]
        if (existing) {
          // Idempotência: não atualiza last_message_at nem emite evento novamente.
          return existing
        }
      }

      throw err
    }

    if (!insertedMessage) {
      throw new Error('appendMessage: INSERT message returned no row')
    }

    // Atualizar last_message_at na conversa.
    await tx
      .update(conversation)
      .set({ lastMessageAt: sql`now()`, updatedAt: sql`now()` })
      .where(eq(conversation.id, conversationId))

    // ADR-15: emits após todas as mutações.
    await emitTimelineEvent(
      {
        contactId: conv.contactId,
        kind: direction === 'inbound' ? 'message_inbound' : 'message_outbound',
        source: 'MOD-INBOX',
        actorUserId: actorUserId ?? null,
        actorSystem: actorSystem ?? null,
        subjectKind: 'message',
        subjectId: insertedMessage.id,
        payload: {
          conversation_id: conversationId,
          direction,
          body_preview: body.slice(0, 100),
        },
      },
      tx,
    )

    return insertedMessage
  }

  // Sem externalMessageId: INSERT direto.
  const insertedRows = await tx
    .insert(message)
    .values({
      conversationId,
      direction,
      body,
      externalMessageId: null,
      actorUserId: actorUserId ?? null,
      actorSystem: actorSystem ?? null,
      sentAt: sentAt ?? null,
    })
    .returning()

  const newMessage = insertedRows[0]
  if (!newMessage) {
    throw new Error('appendMessage: INSERT message returned no row')
  }

  // Atualizar last_message_at na conversa.
  await tx
    .update(conversation)
    .set({ lastMessageAt: sql`now()`, updatedAt: sql`now()` })
    .where(eq(conversation.id, conversationId))

  // ADR-15: emits após todas as mutações.
  await emitTimelineEvent(
    {
      contactId: conv.contactId,
      kind: direction === 'inbound' ? 'message_inbound' : 'message_outbound',
      source: 'MOD-INBOX',
      actorUserId: actorUserId ?? null,
      actorSystem: actorSystem ?? null,
      subjectKind: 'message',
      subjectId: newMessage.id,
      payload: {
        conversation_id: conversationId,
        direction,
        body_preview: body.slice(0, 100),
      },
    },
    tx,
  )

  return newMessage
}
