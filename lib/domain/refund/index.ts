/**
 * MOD-REFUND — Interface pública do módulo
 *
 * Alinhado com docs/30-contracts/07-module-interfaces.md §MOD-REFUND
 * docs/20-domain/14-refund.md §2 (interfaces expostas)
 *
 * ADR-10: funções retornam Promise<T> e lançam DomainError.
 * ADR-11: funções mutativas recebem tx: DbTx como primeiro argumento.
 *
 * Nota de nomenclatura: openRefund ↔ requestRefund (doc/contrato divergem em nome;
 * implementação segue nome canônico do domain doc §2 e tarefa T-8-18).
 * [SYNC-PENDING]: alinhar 07-module-interfaces.md para usar openRefund.
 */

// Abertura de solicitação de reembolso
export { openRefund } from './open'
export type { OpenRefundInput, EmitFn as OpenRefundEmitFn } from './open'

// Aprovação de reembolso (8 efeitos atômicos)
export { approveRefund } from './approve'
export type {
  ReclassifyFn as RefundReclassifyFn,
  RevertOpportunityFn,
  RevokeByTransactionFn,
  FlagSnapshotFn,
  EmitFn as ApproveRefundEmitFn,
} from './approve'

// Rejeição de reembolso
export { rejectRefund } from './reject'
export type { EmitFn as RejectRefundEmitFn } from './reject'

// Marcação como processado (confirmação do provedor)
export { markProcessed } from './mark-processed'
export type { MarkProcessedInput } from './mark-processed'

// Tipos de erro
export {
  RefundDomainError,
  RefundNotFoundError,
  RefundTransactionNotFoundError,
  TransactionNotApprovedError,
  ActiveRefundExistsError,
  InvalidRefundStatusError,
} from './errors'

// Re-exporta Refund type para consumidores
export type { Refund } from '@/lib/db/schema/refund'
