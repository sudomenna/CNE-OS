/**
 * MOD-ENTITLEMENT — interface pública do módulo
 *
 * docs/30-contracts/07-module-interfaces.md §MOD-ENTITLEMENT
 * ADR-10: funções retornam Promise<T> e lançam DomainError.
 * ADR-11: funções mutativas recebem tx: DbTx como primeiro argumento.
 */

// Função pura de consolidação (sem I/O)
export { consolidate } from './consolidate'
export type {
  CustomerEntitlement,
  IncomingEntitlement,
  ConsolidationResult,
  EntitlementKind,
  EntitlementStatus,
  RefKind,
} from './consolidate'

// Concessão de direitos a partir de uma transação aprovada
export { grantFromTransaction } from './grant'
export type { EmitFn } from './grant'
export {
  EntitlementDomainError,
  TransactionSnapshotNotFoundError,
  TransactionNotFoundError as EntitlementTransactionNotFoundError,
} from './grant'

// Revogação de direitos por transação (reembolso)
export { revokeByTransaction } from './revoke'
export { EntitlementNotFoundError } from './revoke'
