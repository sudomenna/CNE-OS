/**
 * MOD-TICKET — Public interface
 *
 * docs/30-contracts/07-module-interfaces.md §MOD-TICKET
 * docs/20-domain/06-ticket.md
 *
 * ADR-10: throws DomainError subtypes, never returns Result<T,E>
 * ADR-11: tx is mandatory first argument for mutating functions
 */
export type { OpenTicketInput } from './open'
export type { TicketStatus } from './set-status'

export {
  TicketDomainError,
  TicketNotFoundError,
  InvalidTicketTransitionError,
} from './errors'

export { openTicket } from './open'
export { setTicketStatus } from './set-status'
// Alias for docs/30-contracts/07-module-interfaces.md §MOD-TICKET (changeTicketStatus)
export { setTicketStatus as changeTicketStatus } from './set-status'
export { assignTicket } from './assign'
export { addTicketNote } from './add-note'
