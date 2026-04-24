/**
 * MOD-INBOX — assignConversation
 *
 * docs/20-domain/05-conversation-inbox.md §2
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md §4 (responsável é da conversa)
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { conversation, conversationAssignmentHistory } from '@/lib/db/schema/conversation'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { ConversationNotFoundError } from './errors'

// ---------------------------------------------------------------------------
// assignConversation
// ---------------------------------------------------------------------------

/**
 * Atribui ou desatribui uma conversa a um usuário.
 *
 * Comportamento:
 * 1. Carrega a conversa para validar existência e obter o responsável atual.
 * 2. Se conversationId não existe → lança ConversationNotFoundError.
 * 3. UPDATE conversation.assigned_user_id = toUserId.
 * 4. INSERT em conversation_assignment_history (from = valor anterior, to = toUserId).
 * 5. Emite TE-CONVERSATION-ASSIGNED (toUserId != null) ou
 *    TE-CONVERSATION-UNASSIGNED (toUserId == null).
 *
 * INV-INBOX-04: assigned_user_id é da conversa, não do contato.
 * INV-INBOX-06: cada mudança de assigned_user_id gera linha em conversation_assignment_history.
 *
 * @param tx              Transação Drizzle ativa (ADR-11)
 * @param conversationId  UUID da conversa a atribuir
 * @param toUserId        UUID do novo responsável ou null para desatribuir
 * @param assignedByUserId UUID do usuário que está fazendo a atribuição
 */
export async function assignConversation(
  tx: DbTx,
  conversationId: string,
  toUserId: string | null,
  assignedByUserId: string,
): Promise<void> {
  // Carregar conversa para validar existência e obter campos necessários.
  const convRows = await tx
    .select({
      id: conversation.id,
      contactId: conversation.contactId,
      assignedUserId: conversation.assignedUserId,
    })
    .from(conversation)
    .where(eq(conversation.id, conversationId))

  const conv = convRows[0]
  if (!conv) {
    throw new ConversationNotFoundError(conversationId)
  }

  const previousUserId = conv.assignedUserId ?? null

  // UPDATE conversation.assigned_user_id.
  await tx
    .update(conversation)
    .set({ assignedUserId: toUserId, updatedAt: sql`now()` })
    .where(eq(conversation.id, conversationId))

  // INV-INBOX-06: INSERT em conversation_assignment_history.
  await tx.insert(conversationAssignmentHistory).values({
    conversationId,
    fromUserId: previousUserId,
    toUserId,
    assignedByUserId,
  })

  // BR-INBOX-CONVERSATION §4: emite evento de atribuição ou desatribuição.
  // TE-CONVERSATION-ASSIGNED quando toUserId != null.
  // TE-CONVERSATION-UNASSIGNED quando toUserId == null.
  const eventKind = toUserId !== null ? 'conversation_assigned' : 'conversation_unassigned'

  await emitTimelineEvent(
    {
      contactId: conv.contactId,
      kind: eventKind,
      source: 'MOD-INBOX',
      actorUserId: assignedByUserId,
      actorSystem: null,
      subjectKind: 'conversation',
      subjectId: conversationId,
      payload: {
        conversation_id: conversationId,
        from_user_id: previousUserId,
        to_user_id: toUserId,
        assigned_by_user_id: assignedByUserId,
      },
    },
    tx,
  )
}
