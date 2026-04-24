/**
 * MOD-MERGE — Public interface
 *
 * docs/30-contracts/07-module-interfaces.md §MOD-MERGE
 * docs/20-domain/03-contact-merge-issues.md
 * docs/50-business-rules/BR-MERGE.md
 *
 * ADR-10: throws DomainError subtypes, never returns Result<T,E>
 * ADR-11: tx is mandatory first argument for mutating functions
 */
export type { MergeInput, MergeResult, ContactSnapshot } from './apply'
export type { UndoInput } from './undo'
export {
  SameContactError,
  PrincipalAlreadyMergedError,
  SecondaryAlreadyMergedError,
  MergeNotFoundError,
  AlreadyUndoneError,
  MergeForbiddenError,
  ContactNotFoundForMergeError,
  MergeDomainError,
} from './errors'
export { mergeContacts } from './apply'
export { undoMerge } from './undo'
