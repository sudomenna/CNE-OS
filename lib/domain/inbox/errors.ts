/**
 * MOD-INBOX — Typed domain errors
 *
 * docs/20-domain/05-conversation-inbox.md
 * docs/50-business-rules/BR-INBOX-CONVERSATION.md
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 */

export class InboxDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InboxDomainError'
  }
}

/**
 * Lançado quando a conversa solicitada não é encontrada pelo ID.
 */
export class ConversationNotFoundError extends InboxDomainError {
  readonly conversationId: string

  constructor(conversationId: string) {
    super(`conversation ${conversationId} not found`)
    this.name = 'ConversationNotFoundError'
    this.conversationId = conversationId
  }
}

/**
 * Lançado quando se tenta enviar mensagem outbound em conversa com status 'closed'.
 * BR-INBOX-CONVERSATION §enforcement: outbound em conversa closed é proibido.
 * docs/20-domain/05-conversation-inbox.md §6
 */
export class ConversationClosedError extends InboxDomainError {
  readonly conversationId: string

  constructor(conversationId: string) {
    super(
      `conversation ${conversationId} is closed — reopen it before sending outbound messages`,
    )
    this.name = 'ConversationClosedError'
    this.conversationId = conversationId
  }
}

/**
 * Lançado quando se tenta realizar uma transição de status inválida numa conversa.
 * A matriz de transições válidas está em docs/20-domain/05-conversation-inbox.md §6.
 */
export class InvalidConversationTransitionError extends InboxDomainError {
  readonly fromStatus: string
  readonly toStatus: string

  constructor(fromStatus: string, toStatus: string) {
    super(
      `invalid conversation status transition: ${fromStatus} → ${toStatus}`,
    )
    this.name = 'InvalidConversationTransitionError'
    this.fromStatus = fromStatus
    this.toStatus = toStatus
  }
}
