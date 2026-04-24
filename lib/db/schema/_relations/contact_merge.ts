/**
 * Drizzle relations for MOD-MERGE (T-1-07)
 *
 * docs/20-domain/03-contact-merge-issues.md §4
 * docs/30-contracts/02-db-schema-conventions.md §16
 *
 * Relations declaradas aqui para evitar circularidades no arquivo principal.
 */
import { relations } from 'drizzle-orm'
import { contact } from '../contact'
import { userAccount } from '../organization'
import { contactIssue, contactMerge, contactMergeUndo } from '../contact_merge'

// ---------------------------------------------------------------------------
// contact_issue
// ---------------------------------------------------------------------------

export const contactIssueRelations = relations(contactIssue, ({ one, many }) => ({
  // Contato foco da pendência
  contact: one(contact, {
    fields: [contactIssue.contactId],
    references: [contact.id],
    relationName: 'contact_issue_focus',
  }),
  // Outro contato envolvido (opcional)
  relatedContact: one(contact, {
    fields: [contactIssue.relatedContactId],
    references: [contact.id],
    relationName: 'contact_issue_related',
  }),
  openedByUser: one(userAccount, {
    fields: [contactIssue.openedByUserId],
    references: [userAccount.id],
    relationName: 'contact_issue_opened_by',
  }),
  resolvedByUser: one(userAccount, {
    fields: [contactIssue.resolvedByUserId],
    references: [userAccount.id],
    relationName: 'contact_issue_resolved_by',
  }),
  // Um contact_merge pode ser vinculado a esta issue
  merges: many(contactMerge),
}))

// ---------------------------------------------------------------------------
// contact_merge
// ---------------------------------------------------------------------------

export const contactMergeRelations = relations(contactMerge, ({ one }) => ({
  principalContact: one(contact, {
    fields: [contactMerge.principalContactId],
    references: [contact.id],
    relationName: 'contact_merge_principal',
  }),
  secondaryContact: one(contact, {
    fields: [contactMerge.secondaryContactId],
    references: [contact.id],
    relationName: 'contact_merge_secondary',
  }),
  issue: one(contactIssue, {
    fields: [contactMerge.issueId],
    references: [contactIssue.id],
  }),
  mergedByUser: one(userAccount, {
    fields: [contactMerge.mergedByUserId],
    references: [userAccount.id],
  }),
  // INV-MERGE-04: 0 ou 1 undo por merge
  undo: one(contactMergeUndo, {
    fields: [contactMerge.id],
    references: [contactMergeUndo.mergeId],
  }),
}))

// ---------------------------------------------------------------------------
// contact_merge_undo
// ---------------------------------------------------------------------------

export const contactMergeUndoRelations = relations(contactMergeUndo, ({ one }) => ({
  merge: one(contactMerge, {
    fields: [contactMergeUndo.mergeId],
    references: [contactMerge.id],
  }),
  undoneByUser: one(userAccount, {
    fields: [contactMergeUndo.undoneByUserId],
    references: [userAccount.id],
  }),
}))
