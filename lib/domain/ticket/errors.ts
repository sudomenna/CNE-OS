/**
 * MOD-TICKET — Typed domain errors
 *
 * docs/20-domain/06-ticket.md §6
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 */

export class TicketDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TicketDomainError'
  }
}

export class TicketNotFoundError extends TicketDomainError {
  constructor(id: string) {
    super(`ticket ${id} not found`)
    this.name = 'TicketNotFoundError'
  }
}

export class InvalidTicketTransitionError extends TicketDomainError {
  constructor(from: string, to: string) {
    super(`invalid ticket transition: ${from} → ${to}`)
    this.name = 'InvalidTicketTransitionError'
  }
}
