/**
 * MOD-BILLING — interface pública do módulo
 *
 * docs/30-contracts/07-module-interfaces.md §MOD-BILLING
 * ADR-10: funções retornam Promise<T> e lançam DomainError.
 * ADR-11: funções mutativas recebem tx: DbTx como primeiro argumento.
 */

// Criação de assinatura a partir de transação aprovada
export { createSubscriptionFromTransaction } from './create-subscription'
export type { EmitFn } from './create-subscription'
export { BillingDomainError, TransactionNotFoundError } from './create-subscription'

// Tratamento de eventos de parcela (paid / overdue)
export { handleInstallmentPaid, handleInstallmentOverdue } from './handle-installment'
export {
  InstallmentDomainError,
  InstallmentNotFoundError,
  InvalidStatusTransitionError,
} from './handle-installment'

// Avanço de ciclo de assinatura (chamado por cron Inngest)
export { advanceSubscription, SubscriptionNotFoundError } from './advance'
export type { SubscriptionStatus } from './advance'

// Cancelamento de assinatura (manual ou automático por dunning)
export {
  cancelSubscription,
  SubscriptionCancelError,
  SubscriptionNotFoundForCancelError,
} from './cancel'
