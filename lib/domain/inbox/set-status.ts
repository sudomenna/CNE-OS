/**
 * MOD-INBOX — setConversationStatus
 *
 * docs/20-domain/05-conversation-inbox.md §2, §6
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md §3
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { conversation, conversationStatusHistory } from '@/lib/db/schema/conversation'
import type { Conversation } from '@/lib/db/schema/conversation'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { ConversationNotFoundError, InvalidConversationTransitionError } from './errors'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

/** Status válidos para transições explícitas via setConversationStatus. */
export type ConversationStatus = 'open' | 'waiting_customer' | 'waiting_team' | 'closed'

// ---------------------------------------------------------------------------
// Matriz de transições válidas
// docs/20-domain/05-conversation-inbox.md §6
// ---------------------------------------------------------------------------

/**
 * Mapa de transições permitidas: fromStatus → Set<toStatus>.
 *
 * Regras:
 * - open → waiting_customer, waiting_team, closed
 * - waiting_customer → open, waiting_team, closed
 * - waiting_team → open, waiting_customer, closed
 * - closed → open (reabertura manual)
 *
 * docs/20-domain/05-conversation-inbox.md §6
 */
const VALID_TRANSITIONS: Record<ConversationStatus, Set<ConversationStatus>> = {
  open: new Set(['waiting_customer', 'waiting_team', 'closed']),
  waiting_customer: new Set(['open', 'waiting_team', 'closed']),
  waiting_team: new Set(['open', 'waiting_customer', 'closed']),
  closed: new Set(['open']),
}

// ---------------------------------------------------------------------------
// setConversationStatus
// ---------------------------------------------------------------------------

/**
 * Aplica uma transição explícita de status em uma conversa.
 *
 * Comportamento:
 * 1. Carrega a conversa para validar existência e status atual.
 * 2. Se conversationId não existe → lança ConversationNotFoundError.
 * 3. Se transição (fromStatus → toStatus) não é válida → lança InvalidConversationTransitionError.
 * 4. UPDATE conversation.status.
 * 5. INSERT em conversation_status_history.
 * 6. Emite o evento de timeline adequado conforme o toStatus:
 *    - → closed: TE-CONVERSATION-CLOSED
 *    - closed → open: TE-CONVERSATION-REOPENED
 *    - outros: TE-CONVERSATION-STATUS-CHANGED
 * 7. Retorna a conversa atualizada.
 *
 * @param tx              Transação Drizzle ativa (ADR-11)
 * @param conversationId  UUID da conversa
 * @param toStatus        Status de destino
 * @param changedByUserId UUID do usuário que alterou o status (null para sistema)
 * @param reason          Motivo opcional da mudança
 */
export async function setConversationStatus(
  tx: DbTx,
  conversationId: string,
  toStatus: ConversationStatus,
  changedByUserId: string | null,
  reason?: string | null,
): Promise<Conversation> {
  // Carregar conversa para validar existência e status atual.
  const convRows = await tx
    .select()
    .from(conversation)
    .where(eq(conversation.id, conversationId))

  const conv = convRows[0]
  if (!conv) {
    throw new ConversationNotFoundError(conversationId)
  }

  const fromStatus = conv.status as ConversationStatus

  // BR-INBOX-CONVERSATION: validar transição conforme matriz.
  // docs/20-domain/05-conversation-inbox.md §6
  const allowed = VALID_TRANSITIONS[fromStatus]
  if (!allowed || !allowed.has(toStatus)) {
    throw new InvalidConversationTransitionError(fromStatus, toStatus)
  }

  // UPDATE conversation.status.
  const updatedRows = await tx
    .update(conversation)
    .set({
      status: toStatus,
      updatedAt: sql`now()`,
    })
    .where(eq(conversation.id, conversationId))
    .returning()

  const updated = updatedRows[0] ?? { ...conv, status: toStatus }

  // INV-INBOX-06: INSERT em conversation_status_history.
  await tx.insert(conversationStatusHistory).values({
    conversationId,
    fromStatus,
    toStatus,
    changedByUserId,
    reason: reason ?? null,
  })

  // Determinar evento de timeline conforme transição.
  // docs/20-domain/05-conversation-inbox.md §8
  let eventKind: string
  if (toStatus === 'closed') {
    // TE-CONVERSATION-CLOSED
    eventKind = 'conversation_closed'
  } else if (fromStatus === 'closed' && toStatus === 'open') {
    // TE-CONVERSATION-REOPENED (reabertura manual)
    eventKind = 'conversation_reopened'
  } else {
    // TE-CONVERSATION-STATUS-CHANGED para demais transições
    eventKind = 'conversation_status_changed'
  }

  // BR-TIMELINE INV-TIMELINE-02: actorUserId XOR actorSystem — ao menos um obrigatório.
  // Quando changedByUserId é null (ex: sistema fecha por SLA), usa actorSystem padrão.
  const actorUserId = changedByUserId ?? null
  const actorSystem = changedByUserId ? null : 'MOD-INBOX'

  await emitTimelineEvent(
    {
      contactId: conv.contactId,
      kind: eventKind,
      source: 'MOD-INBOX',
      actorUserId,
      actorSystem,
      subjectKind: 'conversation',
      subjectId: conversationId,
      payload: {
        conversation_id: conversationId,
        from_status: fromStatus,
        to_status: toStatus,
        reason: reason ?? null,
      },
    },
    tx,
  )

  return updated
}
