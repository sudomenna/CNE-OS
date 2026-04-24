/**
 * MOD-MERGE — Typed domain errors
 *
 * docs/20-domain/03-contact-merge-issues.md
 * docs/50-business-rules/BR-MERGE.md
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 */

export class MergeDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MergeDomainError'
  }
}

export class SameContactError extends MergeDomainError {
  constructor() {
    super('principal and secondary are the same contact')
    this.name = 'SameContactError'
  }
}

export class PrincipalAlreadyMergedError extends MergeDomainError {
  constructor(id: string) {
    super(`principal ${id} is already merged`)
    this.name = 'PrincipalAlreadyMergedError'
  }
}

export class SecondaryAlreadyMergedError extends MergeDomainError {
  constructor(id: string) {
    super(`secondary ${id} is already merged`)
    this.name = 'SecondaryAlreadyMergedError'
  }
}

export class MergeNotFoundError extends MergeDomainError {
  constructor(id: string) {
    super(`merge ${id} not found`)
    this.name = 'MergeNotFoundError'
  }
}

export class AlreadyUndoneError extends MergeDomainError {
  constructor(id: string) {
    super(`merge ${id} is already undone`)
    this.name = 'AlreadyUndoneError'
  }
}

export class MergeForbiddenError extends MergeDomainError {
  constructor(msg: string) {
    super(msg)
    this.name = 'MergeForbiddenError'
  }
}

export class ContactNotFoundForMergeError extends MergeDomainError {
  constructor(id: string) {
    super(`contact ${id} not found`)
    this.name = 'ContactNotFoundForMergeError'
  }
}
