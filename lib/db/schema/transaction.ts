/**
 * MOD-TRANSACTION — Transaction schema (T-8-01, T-8-02, T-8-03)
 *
 * Tables added per task:
 *   T-8-01: transaction
 *   T-8-02: transaction_snapshot, FK deferrable  ← this task
 *   T-8-03: transaction_snapshot_flag_history, transaction_item,
 *           transaction_status_history            ← this task
 *
 * Specs:
 *   docs/20-domain/11-transaction-snapshot.md §3.1–§3.6
 *   docs/50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md
 *   docs/50-business-rules/BR-OFFER-UNIQUENESS.md (INV-TRX-03)
 *   docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md (INV-TRX-06)
 *   docs/30-contracts/01-enums.md
 *   docs/30-contracts/02-db-schema-conventions.md
 */
import {
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { brand, userAccount } from './organization'
import { contact } from './contact'
import {
  offer,
  offerCondition,
  offerConditionItemKindEnum,
  offerPaymentOption,
} from './offer'
import { product, commercialBenefit } from './catalog'
import { integrationProviderEnum } from './webhook-log'

// ---------------------------------------------------------------------------
// Enums — docs/30-contracts/01-enums.md §Transação/Snapshot/Direito
// ---------------------------------------------------------------------------

// transaction_status
export const transactionStatusEnum = pgEnum('transaction_status', [
  'pending',
  'approved',
  'refused',
  'refunded',
  'chargeback',
  'cancelled',
])

// transaction_snapshot_flag
// Declared here because it is referenced by transaction_snapshot (T-8-02) and
// transaction_snapshot_flag_history (T-8-03), both in this same file eventually.
// Declaring early so T-8-02 / T-8-03 can import without circular dep.
export const transactionSnapshotFlagEnum = pgEnum('transaction_snapshot_flag', [
  'normal',
  'refunded',
  'disputed',
])

// ---------------------------------------------------------------------------
// transaction
// docs/20-domain/11-transaction-snapshot.md §3.1, §3.6
// ---------------------------------------------------------------------------
//
// NOTE (OQ-TRX-03): FK `snapshot_id → transaction_snapshot.id` is a circular
// reference (transaction ↔ snapshot). Per §3.6, it is added as a DEFERRABLE
// INITIALLY DEFERRED constraint by T-8-02 via a separate ALTER TABLE migration.
// This file declares snapshot_id as a plain uuid column (nullable, no FK) to
// avoid the circular dependency at schema-generation time.
//
// Indexes:
//   uq_transaction_external_provider_external_id  — BR-INTEGRATION-IDEMPOTENCY (INV-TRX-06)
//   uq_transaction_unique_offer_per_contact        — BR-OFFER-UNIQUENESS (INV-TRX-03)
//   idx_transaction_contact                        — lookup by contact + time
//   idx_transaction_offer                          — lookup by offer
//
// Checks (§3.6 coercion §3.6):
//   ck_transaction_amount          — amount >= 0
//   ck_transaction_approved        — status='approved' → approved_at NOT NULL AND snapshot_id NOT NULL
//   ck_transaction_refused         — status='refused'  → refused_at NOT NULL
// ---------------------------------------------------------------------------

export const transaction = pgTable(
  'transaction',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK brand — docs/30-contracts/02-db-schema-conventions.md §5
    // ON DELETE RESTRICT: brand deletion blocked while transactions exist.
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK contact — ON DELETE RESTRICT: contact deletion blocked while transactions exist.
    // INV-TRX-03: partial unique index uq_transaction_unique_offer_per_contact below.
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK offer — ON DELETE RESTRICT: offer deletion blocked while transactions exist.
    // INV-TRX-07: offer_id, offer_condition_id, offer_payment_option_id are all NOT NULL;
    //   direct product sale without an offer is impossible.
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offer.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK offer_condition — ON DELETE RESTRICT.
    offerConditionId: uuid('offer_condition_id')
      .notNull()
      .references(() => offerCondition.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK offer_payment_option — ON DELETE RESTRICT.
    offerPaymentOptionId: uuid('offer_payment_option_id')
      .notNull()
      .references(() => offerPaymentOption.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // docs/30-contracts/01-enums.md §Transação/Snapshot/Direito
    status: transactionStatusEnum('status').notNull().default('pending'),

    // ck_transaction_amount: amount >= 0
    // docs/30-contracts/02-db-schema-conventions.md §12
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),

    // docs/30-contracts/02-db-schema-conventions.md §12
    currency: char('currency', { length: 3 }).notNull().default('BRL'),

    // INV-TRX-06: external_id is unique per (external_provider, external_id) when present.
    // BR-INTEGRATION-IDEMPOTENCY: uq_transaction_external_provider_external_id below.
    // NULL when transaction was created directly (no external provider).
    externalProvider: integrationProviderEnum('external_provider'),

    // Provider-assigned transaction identifier.
    // NULL when externalProvider is NULL.
    externalId: text('external_id'),

    // Optional fee charged by the external provider.
    externalFee: numeric('external_fee', { precision: 12, scale: 2 }),

    // FK to transaction_snapshot — NULL when status='pending'.
    // NOT NULL when status='approved' (ck_transaction_approved enforces this).
    //
    // NOTE (OQ-TRX-03): FK `snapshot_id → transaction_snapshot.id` is circular
    // (transaction ↔ snapshot). The physical FK is added by T-8-02 as a separate
    // DEFERRABLE INITIALLY DEFERRED ALTER TABLE migration. Here we declare only the
    // column so the CHECK constraint can reference it.
    snapshotId: uuid('snapshot_id'),

    // INV-TRX-02: approved_at NOT NULL when status='approved' — ck_transaction_approved.
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    // refused_at NOT NULL when status='refused' — ck_transaction_refused.
    refusedAt: timestamp('refused_at', { withTimezone: true }),

    // docs/30-contracts/02-db-schema-conventions.md §3
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // BR-INTEGRATION-IDEMPOTENCY (INV-TRX-06):
    // Partial unique index — only covers rows where external_id IS NOT NULL.
    // Prevents duplicate processing of the same provider event.
    // docs/20-domain/11-transaction-snapshot.md §3.1 "Índices críticos"
    uqTransactionExternalProviderExternalId: uniqueIndex(
      'uq_transaction_external_provider_external_id',
    )
      .on(t.externalProvider, t.externalId)
      .where(sql`external_id IS NOT NULL`),

    // BR-OFFER-UNIQUENESS (INV-TRX-03):
    // Partial unique index — only covers rows where status='approved'.
    // Prevents a contact from having two approved transactions for the same offer.
    // Exceptions (renewal, after refund) handled at Server Action level per BR-OFFER-UNIQUENESS.
    uqTransactionUniqueOfferPerContact: uniqueIndex(
      'uq_transaction_unique_offer_per_contact',
    )
      .on(t.contactId, t.offerId)
      .where(sql`status = 'approved'`),

    // Fast lookup by contact ordered by most recent — used in CRM contact timeline.
    idxTransactionContact: index('idx_transaction_contact').on(
      t.contactId,
      t.createdAt,
    ),

    // Fast lookup by offer — used in offer analytics and sales counter verification.
    idxTransactionOffer: index('idx_transaction_offer').on(t.offerId),

    // ck_transaction_amount: amount must be non-negative.
    ckTransactionAmount: check('ck_transaction_amount', sql`${t.amount} >= 0`),

    // INV-TRX-02: approved transaction must have approved_at and snapshot_id.
    // docs/20-domain/11-transaction-snapshot.md §3.6
    ckTransactionApproved: check(
      'ck_transaction_approved_coherence',
      sql`(${t.status} = 'approved'
           AND ${t.approvedAt} IS NOT NULL
           AND ${t.snapshotId} IS NOT NULL)
          OR (${t.status} <> 'approved')`,
    ),

    // refused transaction must have refused_at.
    // docs/20-domain/11-transaction-snapshot.md §3.6
    ckTransactionRefused: check(
      'ck_transaction_refused_coherence',
      sql`(${t.status} = 'refused' AND ${t.refusedAt} IS NOT NULL)
          OR (${t.status} <> 'refused')`,
    ),
  }),
)

export type Transaction = InferSelectModel<typeof transaction>
export type NewTransaction = InferInsertModel<typeof transaction>

// ---------------------------------------------------------------------------
// transaction_snapshot  (T-8-02)
// docs/20-domain/11-transaction-snapshot.md §3.2, §3.6
// BR-SNAPSHOT-IMMUTABILITY: append-only; trigger in supabase/migrations/0050_snapshot_immutable.sql
//
// FK circular note (OQ-TRX-03):
//   transaction_snapshot.transaction_id → transaction(id)  — normal FK declared here.
//   transaction.snapshot_id → transaction_snapshot(id)     — DEFERRABLE INITIALLY DEFERRED;
//     added via ALTER TABLE in supabase/migrations/0050_snapshot_immutable.sql AFTER both
//     tables exist, to break the circular dependency.
//
// `flag` column: value remains 'normal' after INSERT; trigger blocks UPDATE.
//   Effective flag resolved at read time via transaction_snapshot_flag_history.
//   See BR-SNAPSHOT-IMMUTABILITY §Mutação controlada de flag.
// ---------------------------------------------------------------------------

export const transactionSnapshot = pgTable(
  'transaction_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK transaction — ON DELETE RESTRICT: snapshot must not be deleted when transaction exists.
    // uq_transaction_snapshot_transaction_id: one snapshot per transaction.
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // flag: initial value is 'normal'; never updated (trigger blocks UPDATE).
    // Effective flag is computed via transaction_snapshot_flag_history.
    // docs/30-contracts/01-enums.md §Transação/Snapshot/Direito
    flag: transactionSnapshotFlagEnum('flag').notNull().default('normal'),

    // payload: JSONB snapshot of the sale moment — immutable after INSERT.
    // Schema: TransactionSnapshotPayload v1
    // docs/20-domain/11-transaction-snapshot.md §3.2 "Schema do payload"
    payload: jsonb('payload').notNull(),

    // docs/30-contracts/02-db-schema-conventions.md §3
    // No updated_at — table is append-only (no UPDATEs allowed).
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-TRX-01: one snapshot per transaction.
    // docs/20-domain/11-transaction-snapshot.md §3.2
    uqTransactionSnapshotTransactionId: uniqueIndex(
      'uq_transaction_snapshot_transaction_id',
    ).on(t.transactionId),

    // Lookup snapshots by transaction (also covered by unique index above, but explicit).
    idxTransactionSnapshotTransaction: index('idx_transaction_snapshot_transaction').on(
      t.transactionId,
    ),
  }),
)

export type TransactionSnapshot = InferSelectModel<typeof transactionSnapshot>
export type NewTransactionSnapshot = InferInsertModel<typeof transactionSnapshot>

// ---------------------------------------------------------------------------
// transaction_snapshot_flag_history  (T-8-03)
// docs/20-domain/11-transaction-snapshot.md §3.3
// Append-only. Records flag mutations WITHOUT mutating transaction_snapshot.payload.
// BR-SNAPSHOT-IMMUTABILITY CT-SNAP-04, CT-SNAP-06.
// Trigger append-only guard in supabase/migrations/0050_snapshot_immutable.sql.
// ---------------------------------------------------------------------------

export const transactionSnapshotFlagHistory = pgTable(
  'transaction_snapshot_flag_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK transaction_snapshot — ON DELETE RESTRICT.
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => transactionSnapshot.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // from_flag: nullable — first flag transition has no prior state.
    fromFlag: transactionSnapshotFlagEnum('from_flag'),

    // to_flag: the new effective flag value.
    toFlag: transactionSnapshotFlagEnum('to_flag').notNull(),

    // reason: mandatory human-readable reason (e.g., 'customer_requested', 'chargeback_received').
    reason: text('reason').notNull(),

    // caused_by_refund_id: logical FK to refund.id (no physical FK to avoid cross-module cycle).
    // docs/20-domain/11-transaction-snapshot.md §3.3
    causedByRefundId: uuid('caused_by_refund_id'),

    // changed_by: user who triggered the flag change; NULL for system-initiated changes.
    changedBy: uuid('changed_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // docs/30-contracts/02-db-schema-conventions.md §3 — append-only, no updated_at.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Fast lookup of flag history for a given snapshot.
    idxTsfhSnapshot: index('idx_tsfh_snapshot').on(t.snapshotId),
  }),
)

export type TransactionSnapshotFlagHistory = InferSelectModel<
  typeof transactionSnapshotFlagHistory
>
export type NewTransactionSnapshotFlagHistory = InferInsertModel<
  typeof transactionSnapshotFlagHistory
>

// ---------------------------------------------------------------------------
// transaction_item  (T-8-03)
// docs/20-domain/11-transaction-snapshot.md §3.4
// Materialized items from snapshot; used for UI, delivery tracking and analytics.
// NOT the source of truth (snapshot.payload is).
// ---------------------------------------------------------------------------

export const transactionItem = pgTable(
  'transaction_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK transaction — ON DELETE CASCADE: items are subordinate to transaction.
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // item_kind: from offer_condition_item_kind enum.
    // docs/30-contracts/01-enums.md §Catálogo/Oferta
    itemKind: offerConditionItemKindEnum('item_kind').notNull(),

    // FK product — ON DELETE RESTRICT; nullable (item may be commercial_benefit only).
    productId: uuid('product_id').references(() => product.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),

    // FK commercial_benefit — ON DELETE RESTRICT; nullable (item may be product only).
    commercialBenefitId: uuid('commercial_benefit_id').references(
      () => commercialBenefit.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),

    // quantity must be > 0.
    quantity: integer('quantity').notNull(),

    // resolved_rules: copy of access_rule + applied vigency from snapshot.
    // Default: empty JSON object.
    resolvedRules: jsonb('resolved_rules').notNull().default(sql`'{}'::jsonb`),

    // delivery_status: text with CHECK constraint.
    // OQ-TRX-02: enum `commercial_benefit_delivery_status` not yet in 01-enums.md.
    // Using CHECK text until enum is serialized per BR convention.
    deliveryStatus: text('delivery_status').notNull().default('pending'),

    // FK user_account (responsible for delivery) — ON DELETE SET NULL.
    responsibleUserId: uuid('responsible_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // FK transaction_snapshot — ON DELETE RESTRICT: item references the snapshot.
    // docs/20-domain/11-transaction-snapshot.md §3.4
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => transactionSnapshot.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // docs/30-contracts/02-db-schema-conventions.md §3
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // OQ-TRX-02: delivery_status CHECK text (enum pending).
    // Allowed values: 'pending','scheduled','in_progress','delivered','not_applicable'
    ckTransactionItemDeliveryStatus: check(
      'ck_transaction_item_delivery_status',
      sql`${t.deliveryStatus} IN ('pending','scheduled','in_progress','delivered','not_applicable')`,
    ),

    // quantity > 0
    ckTransactionItemQuantity: check(
      'ck_transaction_item_quantity',
      sql`${t.quantity} > 0`,
    ),

    // Lookup items by transaction.
    idxTransactionItemTransaction: index('idx_transaction_item_transaction').on(
      t.transactionId,
    ),

    // Lookup items by snapshot.
    idxTransactionItemSnapshot: index('idx_transaction_item_snapshot').on(t.snapshotId),
  }),
)

export type TransactionItem = InferSelectModel<typeof transactionItem>
export type NewTransactionItem = InferInsertModel<typeof transactionItem>

// ---------------------------------------------------------------------------
// transaction_status_history  (T-8-03)
// docs/20-domain/11-transaction-snapshot.md §3.5
// Append-only. Records all status transitions for audit trail.
// docs/30-contracts/02-db-schema-conventions.md §8
// Trigger append-only guard in supabase/migrations/0050_snapshot_immutable.sql.
// ---------------------------------------------------------------------------

export const transactionStatusHistory = pgTable(
  'transaction_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK transaction — ON DELETE CASCADE: status history is subordinate to transaction.
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // from_status: nullable — initial creation has no prior status.
    fromStatus: transactionStatusEnum('from_status'),

    // to_status: the new status value.
    toStatus: transactionStatusEnum('to_status').notNull(),

    // changed_by: user who triggered the transition; NULL for system/webhook-triggered.
    changedBy: uuid('changed_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // actor_system: identifies the system actor (e.g., 'digital_guru_webhook', 'inngest_retry').
    actorSystem: text('actor_system'),

    // reason: optional human-readable reason.
    reason: text('reason'),

    // docs/30-contracts/02-db-schema-conventions.md §3 — append-only, no updated_at.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Fast lookup of status history for a given transaction.
    idxTransactionStatusHistoryTransaction: index(
      'idx_transaction_status_history_transaction',
    ).on(t.transactionId),
  }),
)

export type TransactionStatusHistory = InferSelectModel<typeof transactionStatusHistory>
export type NewTransactionStatusHistory = InferInsertModel<typeof transactionStatusHistory>

