/**
 * MOD-REFUND — Typed domain errors
 *
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 * Hierarquia: RefundDomainError → NotFoundError | BusinessRuleViolation | ConflictError
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export class RefundDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefundDomainError'
  }
}

// ---------------------------------------------------------------------------
// NotFoundError — entidade não encontrada
// ---------------------------------------------------------------------------

/**
 * Lançado quando o refund solicitado não é encontrado.
 * ADR-10: NotFoundError
 */
export class RefundNotFoundError extends RefundDomainError {
  readonly refundId: string

  constructor(refundId: string) {
    super(`refund ${refundId} not found`)
    this.name = 'RefundNotFoundError'
    this.refundId = refundId
  }
}

/**
 * Lançado quando a transação referenciada não é encontrada ou não está em status válido.
 * ADR-10: NotFoundError
 */
export class TransactionNotApprovedError extends RefundDomainError {
  readonly transactionId: string
  readonly currentStatus: string

  constructor(transactionId: string, currentStatus: string) {
    super(
      `transaction ${transactionId} is not approved — current status: '${currentStatus}'. ` +
        `Only approved transactions can have refunds opened.`,
    )
    this.name = 'TransactionNotApprovedError'
    this.transactionId = transactionId
    this.currentStatus = currentStatus
  }
}

/**
 * Lançado quando a transação não é encontrada ao tentar abrir um refund.
 */
export class RefundTransactionNotFoundError extends RefundDomainError {
  readonly transactionId: string

  constructor(transactionId: string) {
    super(`transaction ${transactionId} not found`)
    this.name = 'RefundTransactionNotFoundError'
    this.transactionId = transactionId
  }
}

// ---------------------------------------------------------------------------
// ConflictError — violação de invariante de negócio
// ---------------------------------------------------------------------------

/**
 * Lançado quando já existe um refund ativo (requested|approved) para a transação.
 * INV-REFUND-01: índice parcial único uq_refund_active_per_transaction.
 */
export class ActiveRefundExistsError extends RefundDomainError {
  readonly transactionId: string
  readonly existingRefundId: string

  constructor(transactionId: string, existingRefundId: string) {
    super(
      `INV-REFUND-01: transaction ${transactionId} already has an active refund ` +
        `(requested|approved) with id ${existingRefundId}`,
    )
    this.name = 'ActiveRefundExistsError'
    this.transactionId = transactionId
    this.existingRefundId = existingRefundId
  }
}

// ---------------------------------------------------------------------------
// BusinessRuleViolation — status inválido para a operação
// ---------------------------------------------------------------------------

/**
 * Lançado quando se tenta aprovar/rejeitar/processar um refund em status inválido.
 * docs/20-domain/14-refund.md §6 — máquina de estados.
 */
export class InvalidRefundStatusError extends RefundDomainError {
  readonly refundId: string
  readonly currentStatus: string
  readonly expectedStatus: string

  constructor(refundId: string, currentStatus: string, expectedStatus: string) {
    super(
      `refund ${refundId} cannot transition from '${currentStatus}' — expected status '${expectedStatus}'`,
    )
    this.name = 'InvalidRefundStatusError'
    this.refundId = refundId
    this.currentStatus = currentStatus
    this.expectedStatus = expectedStatus
  }
}
