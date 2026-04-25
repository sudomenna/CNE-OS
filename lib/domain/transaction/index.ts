/**
 * MOD-TRANSACTION — Interface pública
 *
 * Alinhado com docs/30-contracts/07-module-interfaces.md §MOD-TRANSACTION
 *
 * Exports ativos (T-8-11, T-8-12):
 *   - approveTransaction
 *   - createPendingTransaction
 *   - refuseTransaction
 *   - flagSnapshotRefunded
 *   - Tipos de input
 *   - Tipos de erro
 */

export {
  approveTransaction,
  TransactionAlreadyApprovedError,
  InvalidTransactionStatusError,
} from './approve'
export type { GrantFn, ReclassifyFn, MarkWonFn } from './approve'

export { createPendingTransaction } from './create-pending'
export type { CreateTransactionInput } from './create-pending'

export { refuseTransaction } from './refuse'

export { flagSnapshotRefunded } from './flag-snapshot'

export {
  TransactionDomainError,
  TransactionNotFoundError,
  SnapshotNotFoundError,
  SnapshotNotAllowedError,
  InvalidTransactionStatusForRefusalError,
  DuplicateOfferPurchaseError,
} from './errors'

// T-8-07: composeSnapshot — composes TransactionSnapshotPayload v1
export { composeSnapshot } from './snapshot'
export type { TransactionSnapshotPayload, RuleNode } from './snapshot'
