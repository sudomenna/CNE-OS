/**
 * Drizzle relations for MOD-TIMELINE (T-0-11)
 *
 * docs/20-domain/04-timeline.md §4
 * docs/30-contracts/02-db-schema-conventions.md §16
 *
 * NOTE: contact relation is intentionally absent — the contact table is
 * created in Sprint 1 (T-1-xx). Add the relation there once contact.ts exists.
 */
import { relations } from 'drizzle-orm'
import { timelineEvent } from '../timeline'
import { brand, userAccount } from '../organization'

export const timelineEventRelations = relations(timelineEvent, ({ one }) => ({
  brand: one(brand, {
    fields: [timelineEvent.brandId],
    references: [brand.id],
  }),
  actorUser: one(userAccount, {
    fields: [timelineEvent.actorUserId],
    references: [userAccount.id],
  }),
}))
