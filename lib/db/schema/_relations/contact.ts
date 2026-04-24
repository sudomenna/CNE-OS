/**
 * Drizzle relations for MOD-CONTACT (T-1-01 → T-1-05)
 *
 * docs/20-domain/02-contact-identity.md §4
 * docs/30-contracts/02-db-schema-conventions.md §16
 *
 * Relations declaradas aqui para evitar circularidades no arquivo principal.
 */
import { relations } from 'drizzle-orm'
import {
  contact,
  contactPhone,
  contactEmail,
  contactDocument,
  contactTag,
  contactCustomField,
  contactNote,
  contactStatusHistory,
} from '../contact'
import { brand, userAccount } from '../organization'

// ---------------------------------------------------------------------------
// contact
// ---------------------------------------------------------------------------

export const contactRelations = relations(contact, ({ one, many }) => ({
  // Self-referential: contato mergeado aponta para o principal
  mergedInto: one(contact, {
    fields: [contact.mergedIntoId],
    references: [contact.id],
    relationName: 'merged_contacts',
  }),
  mergedContacts: many(contact, { relationName: 'merged_contacts' }),

  phones: many(contactPhone),
  emails: many(contactEmail),
  documents: many(contactDocument),
  tags: many(contactTag),
  customFields: many(contactCustomField),
  notes: many(contactNote),
  statusHistory: many(contactStatusHistory),
}))

// ---------------------------------------------------------------------------
// contact_phone
// ---------------------------------------------------------------------------

export const contactPhoneRelations = relations(contactPhone, ({ one }) => ({
  contact: one(contact, {
    fields: [contactPhone.contactId],
    references: [contact.id],
  }),
}))

// ---------------------------------------------------------------------------
// contact_email
// ---------------------------------------------------------------------------

export const contactEmailRelations = relations(contactEmail, ({ one }) => ({
  contact: one(contact, {
    fields: [contactEmail.contactId],
    references: [contact.id],
  }),
}))

// ---------------------------------------------------------------------------
// contact_document
// ---------------------------------------------------------------------------

export const contactDocumentRelations = relations(contactDocument, ({ one }) => ({
  contact: one(contact, {
    fields: [contactDocument.contactId],
    references: [contact.id],
  }),
}))

// ---------------------------------------------------------------------------
// contact_tag
// ---------------------------------------------------------------------------

export const contactTagRelations = relations(contactTag, ({ one }) => ({
  contact: one(contact, {
    fields: [contactTag.contactId],
    references: [contact.id],
  }),
  appliedByUser: one(userAccount, {
    fields: [contactTag.appliedBy],
    references: [userAccount.id],
  }),
}))

// ---------------------------------------------------------------------------
// contact_custom_field
// ---------------------------------------------------------------------------

export const contactCustomFieldRelations = relations(contactCustomField, ({ one }) => ({
  contact: one(contact, {
    fields: [contactCustomField.contactId],
    references: [contact.id],
  }),
  brand: one(brand, {
    fields: [contactCustomField.brandId],
    references: [brand.id],
  }),
}))

// ---------------------------------------------------------------------------
// contact_note
// ---------------------------------------------------------------------------

export const contactNoteRelations = relations(contactNote, ({ one }) => ({
  contact: one(contact, {
    fields: [contactNote.contactId],
    references: [contact.id],
  }),
  authorUser: one(userAccount, {
    fields: [contactNote.authorUserId],
    references: [userAccount.id],
  }),
}))

// ---------------------------------------------------------------------------
// contact_status_history
// ---------------------------------------------------------------------------

export const contactStatusHistoryRelations = relations(contactStatusHistory, ({ one }) => ({
  contact: one(contact, {
    fields: [contactStatusHistory.contactId],
    references: [contact.id],
  }),
  changedByUser: one(userAccount, {
    fields: [contactStatusHistory.changedBy],
    references: [userAccount.id],
  }),
}))
