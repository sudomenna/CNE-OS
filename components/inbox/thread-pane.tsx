/**
 * ThreadPane — coluna central do inbox (thread de mensagens).
 *
 * Server Component. Carrega mensagens da conversa selecionada por searchParams.conversation.
 * Se nenhuma conversa selecionada → placeholder.
 * Mensagens ordenadas por created_at ASC.
 * Distingue inbound (esquerda) de outbound (direita).
 * Inclui MessageComposer (tabs Mensagem/Template/Nota) no rodapé.
 *
 * docs/20-domain/05-conversation-inbox.md §3
 * docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-11)
 */

import { asc, eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { conversation, message } from '@/lib/db/schema/conversation'
import { contact } from '@/lib/db/schema/contact'
import { userAccount } from '@/lib/db/schema/organization'
import { MessageComposer } from './message-composer'

interface ThreadPaneProps {
  conversationId?: string | undefined
}

export async function ThreadPane({ conversationId }: ThreadPaneProps) {
  if (!conversationId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 text-sm p-6">
        <p>Selecione uma conversa</p>
      </div>
    )
  }

  // Verificar que a conversa existe
  const convRows = await db
    .select({
      id: conversation.id,
      status: conversation.status,
      contactName: contact.fullName,
    })
    .from(conversation)
    .innerJoin(contact, eq(contact.id, conversation.contactId))
    .where(eq(conversation.id, conversationId))
    .limit(1)

  const conv = convRows[0]

  if (!conv) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 text-sm p-6">
        <p>Conversa nao encontrada.</p>
      </div>
    )
  }

  // Buscar mensagens ordenadas por created_at ASC
  const messages = await db
    .select({
      id: message.id,
      direction: message.direction,
      body: message.body,
      createdAt: message.createdAt,
      actorUserId: message.actorUserId,
      actorSystem: message.actorSystem,
      authorName: userAccount.fullName,
    })
    .from(message)
    .leftJoin(userAccount, eq(userAccount.id, message.actorUserId))
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt))

  const isClosed = conv.status === 'closed'

  return (
    <div className="flex flex-col h-full">
      {/* Cabecalho */}
      <div className="border-b border-border px-4 py-3 flex-shrink-0">
        <h2 className="text-sm font-semibold text-foreground">{conv.contactName}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isClosed ? 'Conversa encerrada' : 'Conversa ativa'}
        </p>
      </div>

      {/* Thread de mensagens */}
      <div
        role="log"
        aria-label="Mensagens da conversa"
        aria-live="polite"
        className="flex-1 overflow-y-auto p-4 space-y-3"
      >
        {messages.length === 0 ? (
          <p className="text-center text-muted-foreground/60 text-sm">Nenhuma mensagem ainda.</p>
        ) : (
          messages.map((msg) => {
            const isOutbound = msg.direction === 'outbound'
            return (
              <div
                key={msg.id}
                className={[
                  'flex',
                  isOutbound ? 'justify-end' : 'justify-start',
                ].join(' ')}
              >
                <div
                  className={[
                    'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                    isOutbound
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : 'bg-muted text-foreground rounded-bl-sm',
                  ].join(' ')}
                >
                  {/* Autor (somente outbound) */}
                  {isOutbound && msg.authorName && (
                    <p className="text-[10px] text-muted-foreground/40 mb-1">{msg.authorName}</p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                  <time
                    dateTime={msg.createdAt.toISOString()}
                    className={[
                      'block text-[10px] mt-1',
                      isOutbound ? 'text-muted-foreground/60' : 'text-muted-foreground/60',
                    ].join(' ')}
                  >
                    {msg.createdAt.toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Formulario de envio — desabilitado se conversa encerrada */}
      {isClosed ? (
        <div className="border-t border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground/60 text-center flex-shrink-0">
          Conversa encerrada. Reabra para responder.
        </div>
      ) : (
        <div className="flex-shrink-0">
          <MessageComposer conversationId={conversationId} />
        </div>
      )}
    </div>
  )
}
