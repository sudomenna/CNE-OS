/**
 * MOD-ENTITLEMENT — Entitlement schema (T-8-04 + T-8-05)
 *
 * Tables added per task:
 *   T-8-04: customer_entitlement  (initial table + unique partial index)
 *   T-8-05: entitlement_history, entitlement_status_history + append-only triggers
 *
 * Specs:
 *   docs/20-domain/12-entitlement.md §3.1-§3.3, §3.4
 *   docs/30-contracts/01-enums.md   (entitlement_kind, entitlement_status)
 *   docs/30-contracts/02-db-schema-conventions.md §8
 *
 * Invariants:
 *   INV-ENT-01: at most 1 active customer_entitlement per (contact_id, brand_id, ref_kind, ref_id).
 *               Enforced by partial unique index uq_customer_entitlement_active_per_ref WHERE status='active'.
 *   INV-ENT-02: ends_at IS NULL = perpetuous; ends_at NOT NULL → ends_at > started_at (CHECK).
 *   INV-ENT-03: entitlement_history is append-only (trigger blocks UPDATE/DELETE).
 *   INV-ENT-04: origin_transaction_id never changes after creation (trigger blocks column UPDATE).
 *   INV-ENT-05: quantity > 0 (CHECK).
 *   INV-ENT-06: status change generates a row in entitlement_status_history.
 */
import {
  check,
  index,
  integer,
  jsonb,
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
import { transaction } from './transaction'

// ---------------------------------------------------------------------------
// Enums — docs/30-contracts/01-enums.md §Transação/Snapshot/Direito
// ---------------------------------------------------------------------------

// entitlement_status: active, suspended, expired, revoked
export const entitlementStatusEnum = pgEnum('entitlement_status', [
  'active',
  'suspended',
  'expired',
  'revoked',
])

// entitlement_kind: product_access, benefit, other
export const entitlementKindEnum = pgEnum('entitlement_kind', [
  'product_access',
  'benefit',
  'other',
])

// ---------------------------------------------------------------------------
// customer_entitlement
// docs/20-domain/12-entitlement.md §3.1, §3.4
// ---------------------------------------------------------------------------
//
// ref_id is a logical FK to either product.id or commercial_benefit.id depending
// on ref_kind. Physical FK is omitted because both tables are valid targets
// (OQ-ENT-03). Referential integrity is enforced at domain layer.
//
// Indexes:
//   uq_customer_entitlement_active_per_ref  — INV-ENT-01 (partial unique, WHERE status='active')
//   idx_customer_entitlement_contact        — fast lookup by contact
//
// Checks:
//   ck_customer_entitlement_quantity        — quantity > 0 (INV-ENT-05)
//   ck_customer_entitlement_ref_kind        — ref_kind IN ('product','benefit')
//   ck_customer_entitlement_ends_after_started — ends_at IS NULL OR ends_at > started_at (INV-ENT-02)
// ---------------------------------------------------------------------------

export const customerEntitlement = pgTable(
  'customer_entitlement',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK contact — ON DELETE RESTRICT: contact deletion blocked while entitlements exist.
    // docs/30-contracts/02-db-schema-conventions.md §14
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK brand — docs/30-contracts/02-db-schema-conventions.md §5
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // entitlement_kind: product_access | benefit | other
    // docs/30-contracts/01-enums.md §Transação/Snapshot/Direito
    kind: entitlementKindEnum('kind').notNull(),

    // ref_kind: discriminates whether ref_id points to product or commercial_benefit.
    // ck_customer_entitlement_ref_kind enforces value set.
    refKind: text('ref_kind').notNull(),

    // ref_id: logical FK to product.id or commercial_benefit.id (see OQ-ENT-03).
    // No physical FK — target table varies with ref_kind; enforced at domain layer.
    refId: uuid('ref_id').notNull(),

    // INV-ENT-05: quantity > 0 enforced by ck_customer_entitlement_quantity.
    quantity: integer('quantity').notNull().default(1),

    // started_at: when the entitlement became effective.
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),

    // ends_at: NULL = perpetuous; NOT NULL → must be > started_at (INV-ENT-02).
    endsAt: timestamp('ends_at', { withTimezone: true }),

    // entitlement_status: active, suspended, expired, revoked
    status: entitlementStatusEnum('status').notNull().default('active'),

    // FK to the transaction that originally granted this entitlement.
    // INV-ENT-04: origin_transaction_id never changes after creation.
    // Trigger enforcing immutability is added in T-8-05.
    // docs/20-domain/12-entitlement.md §3.1
    originTransactionId: uuid('origin_transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK to the most recent transaction that touched this entitlement
    // (may equal originTransactionId for the initial grant).
    lastUpdateTransactionId: uuid('last_update_transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // Snapshot of the effective access rule at time of grant/consolidation.
    // Immutable per row; consolidation writes new value via UPDATE which triggers history.
    // docs/30-contracts/02-db-schema-conventions.md §7
    accessRule: jsonb('access_rule').notNull().default(sql`'{}'::jsonb`),

    // docs/30-contracts/02-db-schema-conventions.md §3
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-ENT-01: at most 1 active entitlement per (contact_id, brand_id, ref_kind, ref_id).
    // Partial unique index — only covers rows WHERE status = 'active'.
    // Consolidation merges into the existing active row; never creates a second one.
    // docs/20-domain/12-entitlement.md §3.1 "Unicidade efetiva"
    uqCustomerEntitlementActivePerRef: uniqueIndex(
      'uq_customer_entitlement_active_per_ref',
    )
      .on(t.contactId, t.brandId, t.refKind, t.refId)
      .where(sql`status = 'active'`),

    // Fast lookup by contact — used in CRM contact view and grantFromTransaction.
    idxCustomerEntitlementContact: index('idx_customer_entitlement_contact').on(
      t.contactId,
    ),

    // INV-ENT-05: quantity must be positive; use status='revoked' to represent loss.
    ckCustomerEntitlementQuantity: check(
      'ck_customer_entitlement_quantity',
      sql`${t.quantity} > 0`,
    ),

    // ref_kind discriminator — only 'product' and 'benefit' are valid targets.
    ckCustomerEntitlementRefKind: check(
      'ck_customer_entitlement_ref_kind',
      sql`${t.refKind} IN ('product', 'benefit')`,
    ),

    // INV-ENT-02: ends_at must be after started_at when not perpetuous.
    ckCustomerEntitlementEndsAfterStarted: check(
      'ck_customer_entitlement_ends_after_started',
      sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startedAt}`,
    ),
  }),
)

export type CustomerEntitlement = InferSelectModel<typeof customerEntitlement>
export type NewCustomerEntitlement = InferInsertModel<typeof customerEntitlement>

// ---------------------------------------------------------------------------
// entitlement_history
// docs/20-domain/12-entitlement.md §3.2
// docs/30-contracts/02-db-schema-conventions.md §8
//
// Append-only log of every state transition on customer_entitlement.
// Each grant/extend/revoke/expire/consolidate operation writes one row.
//
// Trigger (0051_entitlement_triggers.sql):
//   trg_entitlement_history_append_only      — blocks UPDATE/DELETE (INV-ENT-03)
//   trg_entitlement_history_origin_immutable — blocks UPDATE of origin_transaction_id on parent (INV-ENT-04)
//
// FK:
//   entitlement_id          → customer_entitlement(id) ON DELETE CASCADE
//   caused_by_transaction_id→ transaction(id) ON DELETE SET NULL (NULL = automatic expiration)
// ---------------------------------------------------------------------------

export const entitlementHistory = pgTable(
  'entitlement_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK to the parent entitlement.
    // ON DELETE CASCADE: history follows entitlement lifecycle (if entitlement is deleted, history goes too).
    // docs/30-contracts/02-db-schema-conventions.md §14
    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => customerEntitlement.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // Snapshot of state BEFORE the change. NULL on the first row (initial grant — no prior state).
    // Shape: { started_at, ends_at, quantity, status }
    // docs/30-contracts/02-db-schema-conventions.md §7
    from: jsonb('from'),

    // Snapshot of state AFTER the change. Always present.
    // Shape: { started_at, ends_at, quantity, status }
    to: jsonb('to').notNull(),

    // Human-readable reason for the transition.
    // e.g. 'initial_grant', 'consolidate_extend', 'consolidate_promote_perpetuous',
    //      'refund_revoke', 'reactivate_after_revoke', 'auto_expire'
    // docs/20-domain/12-entitlement.md §3.2
    reason: text('reason').notNull(),

    // FK to the transaction that caused this change. NULL when caused by automatic expiration job.
    // docs/20-domain/12-entitlement.md §3.2
    causedByTransactionId: uuid('caused_by_transaction_id').references(
      () => transaction.id,
      { onDelete: 'set null', onUpdate: 'cascade' },
    ),

    // Append-only — no updatedAt; createdAt is the immutable record timestamp.
    // docs/30-contracts/02-db-schema-conventions.md §8
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Fast lookup of history by entitlement, ordered by time (most recent first).
    // docs/20-domain/12-entitlement.md §3.4 DDL reference
    idxEntitlementHistoryEnt: index('idx_entitlement_history_ent').on(
      t.entitlementId,
      t.createdAt,
    ),
  }),
)

export type EntitlementHistory = InferSelectModel<typeof entitlementHistory>
export type NewEntitlementHistory = InferInsertModel<typeof entitlementHistory>

// ---------------------------------------------------------------------------
// entitlement_status_history
// docs/20-domain/12-entitlement.md §3.3
// docs/30-contracts/02-db-schema-conventions.md §8 (padrão de status history)
//
// Lean log of status transitions only (INV-ENT-06).
// Co-exists with entitlement_history (which stores full snapshots).
// Append-only.
//
// Trigger (0051_entitlement_triggers.sql):
//   trg_entitlement_status_history_append_only — blocks UPDATE/DELETE
//
// FK:
//   entitlement_id → customer_entitlement(id) ON DELETE CASCADE
//   changed_by     → user_account(id) ON DELETE SET NULL
// ---------------------------------------------------------------------------

export const entitlementStatusHistory = pgTable(
  'entitlement_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK to the parent entitlement.
    // ON DELETE CASCADE: mirrors entitlement lifecycle.
    entitlementId: uuid('entitlement_id')
      .notNull()
      .references(() => customerEntitlement.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // NULL on the first row (no prior status — initial grant).
    // docs/30-contracts/02-db-schema-conventions.md §8
    fromStatus: entitlementStatusEnum('from_status'),

    // Target status after transition.
    toStatus: entitlementStatusEnum('to_status').notNull(),

    // User who triggered the change. NULL for automated transitions (webhook, expiration job).
    changedBy: uuid('changed_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // Optional reason / note (mandatory for revocations by convention at domain layer).
    reason: text('reason'),

    // Append-only — no updatedAt.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Fast lookup of status history per entitlement.
    idxEntitlementStatusHistoryEntId: index('idx_entitlement_status_history_ent_id').on(
      t.entitlementId,
    ),
  }),
)

export type EntitlementStatusHistory = InferSelectModel<typeof entitlementStatusHistory>
export type NewEntitlementStatusHistory = InferInsertModel<typeof entitlementStatusHistory>
