/**
 * MOD-INBOX — openOrReopenConversation
 *
 * docs/20-domain/05-conversation-inbox.md §2
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { and, eq, ne, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  conversation,
  conversationStatusHistory,
} from '@/lib/db/schema/conversation'
import type { Conversation } from '@/lib/db/schema/conversation'
import { emitTimelineEvent } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type OpenConversationInput = {
  /** ID do contato que inicia a conversa. */
  contactId: string
  /** ID da conta de canal (channel_account) em que a conversa ocorre. */
  channelAccountId: string
  /** ID externo do thread no provedor (ex: WhatsApp conversation id). Opcional. */
  externalThreadId?: string | null
  /**
   * Identificador do sistema que está abrindo a conversa (ex: 'whatsapp-webhook').
   * Usado para preencher o campo actorSystem nos eventos de timeline.
   */
  actorSystem?: string
  /**
   * ID do usuário humano que está abrindo a conversa (para reabertura manual).
   * Quando fornecido, é usado como changed_by_user_id em conversation_status_history.
   */
  actorUserId?: string | null
}

// ---------------------------------------------------------------------------
// openOrReopenConversation
// ---------------------------------------------------------------------------

/**
 * Abre uma nova conversa ou reabre uma existente para um par (contactId, channelAccountId).
 *
 * Comportamento (BR-INBOX-CONVERSATION):
 * 1. Busca conversa ativa (status != 'closed') para o par.
 * 2. Se encontrada com status != 'closed' → retorna idempotentemente (sem efeitos).
 * 3. Se encontrada com status == 'closed' → reabre: UPDATE status='open',
 *    insere em conversation_status_history, emite TE-CONVERSATION-REOPENED.
 * 4. Se não encontrada → cria nova conversa com status='open',
 *    insere em conversation_status_history (from_status=null), emite TE-CONVERSATION-OPENED.
 */
export async function openOrReopenConversation(
  tx: DbTx,
  input: OpenConversationInput,
): Promise<Conversation> {
  const { contactId, channelAccountId, externalThreadId, actorSystem, actorUserId } = input

  // BR-INBOX-CONVERSATION §2: unicidade ativa por par (contact_id, channel_account_id).
  // Busca conversa com status != 'closed' via o índice uq_conversation_active.
  const activeRows = await tx
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.contactId, contactId),
        eq(conversation.channelAccountId, channelAccountId),
        ne(conversation.status, 'closed'),
      ),
    )

  const activeConversation = activeRows[0]

  // BR-INBOX-CONVERSATION §2 (idempotente): conversa já ativa → retornar sem efeitos.
  if (activeConversation) {
    return activeConversation
  }

  // Busca conversa fechada para o mesmo par (para reabertura em vez de nova criação).
  // BR-INBOX-CONVERSATION §3: reabertura automática.
  const closedRows = await tx
    .select()
    .from(conversation)
    .where(
      and(
        eq(conversation.contactId, contactId),
        eq(conversation.channelAccountId, channelAccountId),
        eq(conversation.status, 'closed'),
      ),
    )

  const closedConversation = closedRows[0]

  if (closedConversation) {
    // BR-INBOX-CONVERSATION §3: reabre conversa fechada → status='open'.
    const updatedRows = await tx
      .update(conversation)
      .set({ status: 'open', updatedAt: sql`now()` })
      .where(eq(conversation.id, closedConversation.id))
      .returning()

    const reopened = updatedRows[0] ?? closedConversation

    // INV-INBOX-06: cada transição de status gera linha em conversation_status_history.
    await tx.insert(conversationStatusHistory).values({
      conversationId: closedConversation.id,
      fromStatus: 'closed',
      toStatus: 'open',
      changedByUserId: actorUserId ?? null,
      reason: 'Reaberta por nova mensagem inbound',
    })

    // ADR-15: emits após todas as mutações.
    await emitTimelineEvent(
      {
        contactId,
        kind: 'conversation_reopened',
        source: 'MOD-INBOX',
        actorUserId: actorUserId ?? null,
        actorSystem: actorSystem ?? null,
        subjectKind: 'conversation',
        subjectId: closedConversation.id,
        payload: {
          conversation_id: closedConversation.id,
        },
      },
      tx,
    )

    return reopened
  }

  // Não existe conversa ativa nem fechada → cria nova.
  // BR-INBOX-CONVERSATION §4: cria conversa e emite TE-CONVERSATION-OPENED.
  const insertedRows = await tx
    .insert(conversation)
    .values({
      contactId,
      channelAccountId,
      status: 'open',
      externalThreadId: externalThreadId ?? null,
    })
    .returning()

  const newConversation = insertedRows[0]
  if (!newConversation) {
    throw new Error('openOrReopenConversation: INSERT conversation returned no row')
  }

  // INV-INBOX-06: registro do status inicial em conversation_status_history.
  // from_status = NULL indica criação (sem transição anterior).
  await tx.insert(conversationStatusHistory).values({
    conversationId: newConversation.id,
    fromStatus: null,
    toStatus: 'open',
    changedByUserId: actorUserId ?? null,
    reason: null,
  })

  // ADR-15: emits após todas as mutações.
  await emitTimelineEvent(
    {
      contactId,
      kind: 'conversation_opened',
      source: 'MOD-INBOX',
      actorUserId: actorUserId ?? null,
      actorSystem: actorSystem ?? null,
      subjectKind: 'conversation',
      subjectId: newConversation.id,
      payload: {
        conversation_id: newConversation.id,
        channel_account_id: channelAccountId,
      },
    },
    tx,
  )

  return newConversation
}
