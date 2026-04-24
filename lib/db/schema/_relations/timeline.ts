/**
 * Drizzle relations for MOD-TIMELINE (T-0-11)
 *
 * docs/20-domain/04-timeline.md §4
 * docs/30-contracts/02-db-schema-conventions.md §16
 */
import { relations } from 'drizzle-orm'
import { timelineEvent } from '../timeline'
import { brand, userAccount } from '../organization'
import { contact } from '../contact'

export const timelineEventRelations = relations(timelineEvent, ({ one }) => ({
  contact: one(contact, {
    fields: [timelineEvent.contactId],
    references: [contact.id],
  }),
  brand: one(brand, {
    fields: [timelineEvent.brandId],
    references: [brand.id],
  }),
  actorUser: one(userAccount, {
    fields: [timelineEvent.actorUserId],
    references: [userAccount.id],
  }),
}))
