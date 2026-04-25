/**
 * MOD-TRANSACTION — Typed domain errors
 *
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 * Hierarquia: DomainError → NotFoundError | BusinessRuleViolation | ConflictError
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export class TransactionDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransactionDomainError'
  }
}

// ---------------------------------------------------------------------------
// NotFoundError — entidade não encontrada
// ---------------------------------------------------------------------------

export class TransactionNotFoundError extends TransactionDomainError {
  readonly transactionId: string

  constructor(transactionId: string) {
    super(`transaction ${transactionId} not found`)
    this.name = 'TransactionNotFoundError'
    this.transactionId = transactionId
  }
}

export class SnapshotNotFoundError extends TransactionDomainError {
  readonly snapshotId: string

  constructor(snapshotId: string) {
    super(`transaction_snapshot ${snapshotId} not found`)
    this.name = 'SnapshotNotFoundError'
    this.snapshotId = snapshotId
  }
}

// ---------------------------------------------------------------------------
// BusinessRuleViolation — regra de negócio violada
// ---------------------------------------------------------------------------

/**
 * Lançado quando se tenta recusar uma transação que não está em status 'pending'.
 * docs/20-domain/11-transaction-snapshot.md §6 — só pending pode ser recusado.
 */
export class InvalidTransactionStatusForRefusalError extends TransactionDomainError {
  readonly transactionId: string
  readonly currentStatus: string

  constructor(transactionId: string, currentStatus: string) {
    super(
      `transaction ${transactionId} cannot be refused from status '${currentStatus}' — only 'pending' transitions to 'refused'`,
    )
    this.name = 'InvalidTransactionStatusForRefusalError'
    this.transactionId = transactionId
    this.currentStatus = currentStatus
  }
}

// ---------------------------------------------------------------------------
// BusinessRuleViolation — snapshot não permitido para o status atual
// ---------------------------------------------------------------------------

/**
 * Lançado quando se tenta compor snapshot para uma transação cujo status
 * não permite snapshotting (ex.: refused, refunded, cancelled, chargeback).
 * BR-SNAPSHOT-IMMUTABILITY: snapshot só pode ser criado em status pending/approved.
 */
export class SnapshotNotAllowedError extends TransactionDomainError {
  readonly transactionId: string
  readonly status: string

  constructor(transactionId: string, status: string) {
    super(
      `Cannot compose snapshot for transaction ${transactionId} in status '${status}'. ` +
        `Only transactions in status 'pending' or 'approved' can be snapshotted.`,
    )
    this.name = 'SnapshotNotAllowedError'
    this.transactionId = transactionId
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// ConflictError — violação de unicidade de negócio
// ---------------------------------------------------------------------------

/**
 * Lançado quando o contato já possui uma transação approved para a mesma oferta.
 * BR-OFFER-UNIQUENESS: índice parcial uq_transaction_unique_offer_per_contact.
 */
export class DuplicateOfferPurchaseError extends TransactionDomainError {
  readonly contactId: string
  readonly offerId: string

  constructor(contactId: string, offerId: string) {
    super(
      `BR-OFFER-UNIQUENESS: contact ${contactId} already has an approved transaction for offer ${offerId}`,
    )
    this.name = 'DuplicateOfferPurchaseError'
    this.contactId = contactId
    this.offerId = offerId
  }
}
