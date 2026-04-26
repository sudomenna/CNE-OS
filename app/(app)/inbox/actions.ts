'use server'

/**
 * MOD-INBOX — Server Actions
 *
 * docs/20-domain/05-conversation-inbox.md §2, §7
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md
 * docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-10)
 *
 * ADR-10: retornam ActionResult<T> via toActionResult; erros de domínio são capturados
 * ADR-11: mutações chamam funções de domínio com tx como primeiro argumento
 */

import { z } from 'zod'
import { eq, count } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { conversation, conversationInternalNote } from '@/lib/db/schema/conversation'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult } from '@/lib/actions/result'
import { appendMessage } from '@/lib/domain/inbox/append-message'
import { assignConversation } from '@/lib/domain/inbox/assign'
import { setConversationStatus } from '@/lib/domain/inbox/set-status'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const sendMessageSchema = z.object({
  conversationId: z.string().uuid('conversationId deve ser UUID'),
  body: z.string().min(1, 'Corpo da mensagem não pode ser vazio'),
})

const assignSchema = z.object({
  conversationId: z.string().uuid('conversationId deve ser UUID'),
  toUserId: z.string().uuid('toUserId deve ser UUID').nullable(),
})

const changeConversationStatusSchema = z.object({
  conversationId: z.string().uuid('conversationId deve ser UUID'),
  toStatus: z.enum(['open', 'waiting_reply', 'closed']),
  reason: z.string().optional(),
})

// BR-INBOX-CONVERSATION: 'waiting_reply' é mapeado para o status interno do domínio
// O contrato público da action usa 'waiting_reply' para clareza da UI;
// o domínio usa 'waiting_customer' ou 'waiting_team'.
// Fase 1: waiting_reply → waiting_customer (atende ao cenário mais comum de aguardar cliente).
const STATUS_MAP = {
  open: 'open',
  waiting_reply: 'waiting_customer',
  closed: 'closed',
} as const satisfies Record<string, 'open' | 'waiting_customer' | 'waiting_team' | 'closed'>

const addInternalNoteSchema = z.object({
  conversationId: z.string().uuid('conversationId deve ser UUID'),
  body: z.string().min(1, 'Corpo da nota não pode ser vazio'),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * getUnreadInboxCount — retorna a contagem de conversas abertas (status = 'open').
 *
 * Usado pelo Sidebar para exibir o badge numérico no item Inbox.
 * Retorna 0 em caso de erro para não bloquear a renderização do layout.
 *
 * Guard: inbox.reply (permissão de acesso ao inbox — a mais restritiva disponível na Fase 1)
 */
export async function getUnreadInboxCount(): Promise<number> {
  try {
    const ctx = await requireSession()
    await requirePermission(ctx, 'inbox.reply', { kind: 'global' })

    const [row] = await db
      .select({ value: count() })
      .from(conversation)
      .where(eq(conversation.status, 'open'))

    return row?.value ?? 0
  } catch {
    return 0
  }
}

/**
 * sendMessage — registra mensagem outbound em uma conversa ativa.
 *
 * Guard: inbox.reply
 * Fase 1: apenas persiste na DB; envio real pelo canal externo virá quando
 * o adapter de canal for integrado com routing (T-3-07/T-3-09).
 *
 * BR-INBOX-CONVERSATION §enforcement: outbound em conversa closed é proibido
 * (erro ConversationClosedError, capturado por toActionResult como INTERNAL).
 */
export async function sendMessage(
  conversationId: string,
  body: string,
): Promise<ReturnType<typeof toActionResult<{ messageId: string }>>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'inbox.reply', { kind: 'global' })

    const input = sendMessageSchema.parse({ conversationId, body })

    const msg = await db.transaction(async (tx) => {
      return appendMessage(tx, {
        conversationId: input.conversationId,
        direction: 'outbound',
        body: input.body,
        actorUserId: ctx.user.id,
        actorSystem: null,
      })
    })

    revalidatePath('/inbox')

    return { messageId: msg.id }
  })
}

/**
 * assign — atribui ou desatribui responsável de uma conversa.
 *
 * Guard: inbox.reply
 * toUserId = null → desatribui conversa.
 */
export async function assign(
  conversationId: string,
  toUserId: string | null,
): Promise<ReturnType<typeof toActionResult<void>>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'inbox.reply', { kind: 'global' })

    const input = assignSchema.parse({ conversationId, toUserId })

    await db.transaction(async (tx) => {
      await assignConversation(tx, input.conversationId, input.toUserId, ctx.user.id)
    })

    revalidatePath('/inbox')
  })
}

/**
 * changeConversationStatus — altera o status de uma conversa.
 *
 * Guard: inbox.reply
 * Aceita 'open' | 'waiting_reply' | 'closed'.
 * 'waiting_reply' é mapeado internamente para 'waiting_customer' (Fase 1).
 *
 * BR-INBOX-CONVERSATION §6: transições inválidas lançam InvalidConversationTransitionError.
 */
export async function changeConversationStatus(
  conversationId: string,
  toStatus: 'open' | 'waiting_reply' | 'closed',
  reason?: string,
): Promise<ReturnType<typeof toActionResult<{ conversationId: string }>>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'inbox.reply', { kind: 'global' })

    const input = changeConversationStatusSchema.parse({ conversationId, toStatus, reason })

    // BR-INBOX-CONVERSATION: mapear status público para status interno do domínio
    const domainStatus = STATUS_MAP[input.toStatus]

    await db.transaction(async (tx) => {
      await setConversationStatus(tx, input.conversationId, domainStatus, ctx.user.id, input.reason ?? null)
    })

    revalidatePath('/inbox')

    return { conversationId: input.conversationId }
  })
}

/**
 * addInternalNote — adiciona nota interna a uma conversa (não visível ao contato).
 *
 * Guard: inbox.reply
 * INSERT direto em conversation_internal_note via db.transaction.
 */
export async function addInternalNote(
  conversationId: string,
  body: string,
): Promise<ReturnType<typeof toActionResult<void>>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'inbox.reply', { kind: 'global' })

    const input = addInternalNoteSchema.parse({ conversationId, body })

    await db.transaction(async (tx) => {
      await tx.insert(conversationInternalNote).values({
        conversationId: input.conversationId,
        authorUserId: ctx.user.id,
        body: input.body,
      })
    })

    revalidatePath('/inbox')
  })
}
