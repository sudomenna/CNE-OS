/**
 * Drizzle relations for MOD-REFUND (T-8-06)
 *
 * docs/20-domain/14-refund.md §4
 * docs/30-contracts/02-db-schema-conventions.md §16
 *
 * Relations declaradas aqui para evitar circularidades no arquivo principal.
 */
import { relations } from 'drizzle-orm'
import {
  refund,
  refundEffectLog,
  refundStatusHistory,
} from '../refund'
import { transaction } from '../transaction'
import { userAccount } from '../organization'

// ---------------------------------------------------------------------------
// refund
// ---------------------------------------------------------------------------

export const refundRelations = relations(refund, ({ one, many }) => ({
  transaction: one(transaction, {
    fields: [refund.transactionId],
    references: [transaction.id],
  }),

  openedByUser: one(userAccount, {
    fields: [refund.openedByUserId],
    references: [userAccount.id],
    relationName: 'refund_opened_by',
  }),

  approvedByUser: one(userAccount, {
    fields: [refund.approvedByUserId],
    references: [userAccount.id],
    relationName: 'refund_approved_by',
  }),

  effectLogs: many(refundEffectLog),
  statusHistory: many(refundStatusHistory),
}))

// ---------------------------------------------------------------------------
// refund_effect_log
// ---------------------------------------------------------------------------

export const refundEffectLogRelations = relations(refundEffectLog, ({ one }) => ({
  refund: one(refund, {
    fields: [refundEffectLog.refundId],
    references: [refund.id],
  }),
}))

// ---------------------------------------------------------------------------
// refund_status_history
// ---------------------------------------------------------------------------

export const refundStatusHistoryRelations = relations(refundStatusHistory, ({ one }) => ({
  refund: one(refund, {
    fields: [refundStatusHistory.refundId],
    references: [refund.id],
  }),

  changedByUser: one(userAccount, {
    fields: [refundStatusHistory.changedBy],
    references: [userAccount.id],
  }),
}))
