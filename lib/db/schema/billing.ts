/**
 * MOD-BILLING — Subscription & Installment schema (T-9-01)
 *
 * Tables:
 *   subscription         — recurring subscription entity (§3.1)
 *   installment          — individual charge linked to subscription XOR transaction (§3.2)
 *
 * Specs:
 *   docs/20-domain/13-subscription-billing.md §3.1, §3.2, §3.4, §5
 *   docs/30-contracts/01-enums.md §Assinatura/Cobrança
 *   docs/30-contracts/02-db-schema-conventions.md
 *
 * Invariants enforced here (via CHECK):
 *   INV-BILL-01: installment must link to exactly one parent (transaction XOR subscription)
 *   INV-BILL-02: current_period_end > current_period_start
 *   INV-BILL-03: status='trial' → trial_ends_at IS NOT NULL
 *   INV-BILL-04: status='cancelled' → cancelled_at IS NOT NULL
 *   INV-BILL-05: installment.external_id unique per provider (partial unique index)
 */
import {
  check,
  index,
  integer,
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

import { brand } from './organization'
import { contact } from './contact'
import { offer, offerCondition, offerPaymentOption } from './offer'
import { transaction } from './transaction'
import { integrationProviderEnum } from './webhook-log'

// ---------------------------------------------------------------------------
// Enums — docs/30-contracts/01-enums.md §Assinatura/Cobrança
// ---------------------------------------------------------------------------

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trial',
  'active',
  'past_due',
  'paused',
  'cancelled',
  'expired',
])

export const installmentStatusEnum = pgEnum('installment_status', [
  'scheduled',
  'paid',
  'overdue',
  'refunded',
  'cancelled',
])

// ---------------------------------------------------------------------------
// subscription
// docs/20-domain/13-subscription-billing.md §3.1, §3.4
//
// CHECKs:
//   ck_subscription_period    — INV-BILL-02: current_period_end > current_period_start
//   ck_subscription_trial     — INV-BILL-03: trial status requires trial_ends_at
//   ck_subscription_cancelled — INV-BILL-04: cancelled status requires cancelled_at
//
// Indexes:
//   idx_subscription_contact    ON (contact_id, status)
//   uq_subscription_external    UNIQUE ON (external_provider, external_id) WHERE external_id IS NOT NULL
// ---------------------------------------------------------------------------

export const subscription = pgTable(
  'subscription',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK contact — ON DELETE RESTRICT: contact deletion blocked while subscriptions exist.
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK brand — docs/30-contracts/02-db-schema-conventions.md §5
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK offer — ON DELETE RESTRICT
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offer.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK offer_condition — ON DELETE RESTRICT
    offerConditionId: uuid('offer_condition_id')
      .notNull()
      .references(() => offerCondition.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK offer_payment_option — ON DELETE RESTRICT
    offerPaymentOptionId: uuid('offer_payment_option_id')
      .notNull()
      .references(() => offerPaymentOption.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // FK transaction — ON DELETE RESTRICT: founding (first approved) transaction.
    // docs/20-domain/13-subscription-billing.md §3.1
    originTransactionId: uuid('origin_transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // docs/30-contracts/01-enums.md §Assinatura/Cobrança
    status: subscriptionStatusEnum('status').notNull().default('trial'),

    // INV-BILL-02: current_period_end > current_period_start (ck_subscription_period below)
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),

    // nullable — next charge date; NULL when subscription has no automatic renewal
    nextBillingAt: timestamp('next_billing_at', { withTimezone: true }),

    // INV-BILL-03: NOT NULL when status='trial' (ck_subscription_trial below)
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),

    // INV-BILL-04: NOT NULL when status='cancelled' (ck_subscription_cancelled below)
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),

    // BR-INTEGRATION-IDEMPOTENCY: external provider reference
    // Partial unique index uq_subscription_external enforces uniqueness when present.
    externalProvider: integrationProviderEnum('external_provider'),
    externalId: text('external_id'),

    // docs/30-contracts/02-db-schema-conventions.md §3
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-BILL-02: period coherence
    ckSubscriptionPeriod: check(
      'ck_subscription_period',
      sql`${t.currentPeriodEnd} > ${t.currentPeriodStart}`,
    ),

    // INV-BILL-03: trial status requires trial_ends_at
    ckSubscriptionTrial: check(
      'ck_subscription_trial',
      sql`(${t.status} = 'trial' AND ${t.trialEndsAt} IS NOT NULL)
          OR (${t.status} <> 'trial')`,
    ),

    // INV-BILL-04: cancelled status requires cancelled_at
    ckSubscriptionCancelled: check(
      'ck_subscription_cancelled',
      sql`(${t.status} = 'cancelled' AND ${t.cancelledAt} IS NOT NULL)
          OR (${t.status} <> 'cancelled')`,
    ),

    // Fast lookup by contact and status — used in CRM contact view and dunning
    idxSubscriptionContact: index('idx_subscription_contact').on(t.contactId, t.status),

    // BR-INTEGRATION-IDEMPOTENCY (INV-BILL-05):
    // Partial unique index — only covers rows where external_id IS NOT NULL.
    uqSubscriptionExternal: uniqueIndex('uq_subscription_external')
      .on(t.externalProvider, t.externalId)
      .where(sql`external_id IS NOT NULL`),
  }),
)

export type Subscription = InferSelectModel<typeof subscription>
export type NewSubscription = InferInsertModel<typeof subscription>

// ---------------------------------------------------------------------------
// installment
// docs/20-domain/13-subscription-billing.md §3.2, §3.4
//
// Dual-parent: linked to exactly one of transaction_id XOR subscription_id
// INV-BILL-01: ck_installment_parent_exclusive enforces this
//
// CHECKs:
//   ck_installment_amount           — amount >= 0
//   ck_installment_paid_coherence   — status='paid' → paid_at IS NOT NULL
//   ck_installment_parent_exclusive — exactly one parent (XOR)
//
// Indexes:
//   uq_installment_external           UNIQUE (external_provider, external_id) WHERE external_id IS NOT NULL
//   uq_installment_seq_sub            UNIQUE (subscription_id, sequence) WHERE subscription_id IS NOT NULL
//   uq_installment_seq_trx            UNIQUE (transaction_id, sequence) WHERE transaction_id IS NOT NULL
//   idx_installment_status_due        ON (status, due_at) — used by dunning cron
// ---------------------------------------------------------------------------

export const installment = pgTable(
  'installment',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK transaction — ON DELETE RESTRICT; NULL when parent is subscription.
    // INV-BILL-01: exactly one of (transaction_id, subscription_id) must be NOT NULL.
    transactionId: uuid('transaction_id').references(() => transaction.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),

    // FK subscription — ON DELETE RESTRICT; NULL when parent is transaction.
    // Declared without .references() to avoid circular dep at schema-generation time.
    // Physical FK declared in migration SQL.
    subscriptionId: uuid('subscription_id').references(() => subscription.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),

    // Sequence number starting at 1 within the parent (transaction or subscription).
    // uq_installment_seq_sub and uq_installment_seq_trx indexes enforce uniqueness.
    sequence: integer('sequence').notNull(),

    due_at: timestamp('due_at', { withTimezone: true }).notNull(),

    // docs/30-contracts/02-db-schema-conventions.md §12
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),

    // docs/30-contracts/01-enums.md §Assinatura/Cobrança
    status: installmentStatusEnum('status').notNull().default('scheduled'),

    // NOT NULL when status='paid' (ck_installment_paid_coherence below)
    paidAt: timestamp('paid_at', { withTimezone: true }),

    // BR-INTEGRATION-IDEMPOTENCY: external provider reference
    externalProvider: integrationProviderEnum('external_provider'),
    externalId: text('external_id'),

    // Provider-provided boleto URL; NULL when not applicable
    boletoUrl: text('boleto_url'),

    // Dunning retry tracking
    retryCount: integer('retry_count').notNull().default(0),
    lastRetryAt: timestamp('last_retry_at', { withTimezone: true }),

    // docs/30-contracts/02-db-schema-conventions.md §3
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // amount must be non-negative
    ckInstallmentAmount: check('ck_installment_amount', sql`${t.amount} >= 0`),

    // paid status requires paid_at
    ckInstallmentPaidCoherence: check(
      'ck_installment_paid_coherence',
      sql`(${t.status} = 'paid' AND ${t.paidAt} IS NOT NULL)
          OR (${t.status} <> 'paid')`,
    ),

    // INV-BILL-01: installment must link to exactly one parent
    ckInstallmentParentExclusive: check(
      'ck_installment_parent_exclusive',
      sql`(${t.transactionId} IS NOT NULL AND ${t.subscriptionId} IS NULL)
          OR (${t.transactionId} IS NULL AND ${t.subscriptionId} IS NOT NULL)`,
    ),

    // BR-INTEGRATION-IDEMPOTENCY (INV-BILL-05):
    // Partial unique index — only covers rows where external_id IS NOT NULL.
    uqInstallmentExternal: uniqueIndex('uq_installment_external')
      .on(t.externalProvider, t.externalId)
      .where(sql`external_id IS NOT NULL`),

    // Unique sequence per subscription parent
    uqInstallmentSeqSub: uniqueIndex('uq_installment_seq_sub')
      .on(t.subscriptionId, t.sequence)
      .where(sql`subscription_id IS NOT NULL`),

    // Unique sequence per transaction parent
    uqInstallmentSeqTrx: uniqueIndex('uq_installment_seq_trx')
      .on(t.transactionId, t.sequence)
      .where(sql`transaction_id IS NOT NULL`),

    // Used by dunning cron to find overdue installments
    idxInstallmentStatusDue: index('idx_installment_status_due').on(t.status, t.due_at),
  }),
)

export type Installment = InferSelectModel<typeof installment>
export type NewInstallment = InferInsertModel<typeof installment>

// ---------------------------------------------------------------------------
// subscriptionStatusHistory
// docs/20-domain/13-subscription-billing.md §3.3
// docs/30-contracts/02-db-schema-conventions.md §8 (padrão append-only de histórico)
//
// Trilha de mudanças de status da assinatura. Append-only.
// INV-BILL-06: trigger bloqueia UPDATE/DELETE.
//
// FK:
//   subscription_id → subscription(id) ON DELETE CASCADE
//   changed_by      → uuid nullable (auth user or system)
// ---------------------------------------------------------------------------

export const subscriptionStatusHistory = pgTable(
  'subscription_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK subscription — ON DELETE CASCADE: histórico removido junto com a assinatura.
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscription.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // NULL na primeira linha (criação sem estado anterior).
    oldStatus: subscriptionStatusEnum('old_status'),

    newStatus: subscriptionStatusEnum('new_status').notNull(),

    // Timestamp da transição — append-only, nunca atualizado.
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),

    // Usuário que causou a transição (NULL para transições de sistema, ex: cron/webhook).
    changedBy: uuid('changed_by'),

    // Motivo opcional da transição.
    note: text('note'),
  },
  (t) => ({
    // Fast lookup por assinatura ordenado por data — usado em detalhe de assinatura e auditoria.
    idxSubscriptionStatusHistorySub: index('idx_subscription_status_history_sub').on(
      t.subscriptionId,
      t.changedAt,
    ),
  }),
)

export type SubscriptionStatusHistory = InferSelectModel<typeof subscriptionStatusHistory>
export type NewSubscriptionStatusHistory = InferInsertModel<typeof subscriptionStatusHistory>

// ---------------------------------------------------------------------------
// installmentStatusHistory
// docs/20-domain/13-subscription-billing.md §3.3
// docs/30-contracts/02-db-schema-conventions.md §8 (padrão append-only de histórico)
//
// Trilha de mudanças de status da parcela. Append-only.
// INV-BILL-06: trigger bloqueia UPDATE/DELETE.
//
// FK:
//   installment_id → installment(id) ON DELETE CASCADE
//   changed_by     → uuid nullable (auth user or system)
// ---------------------------------------------------------------------------

export const installmentStatusHistory = pgTable(
  'installment_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK installment — ON DELETE CASCADE: histórico removido junto com a parcela.
    installmentId: uuid('installment_id')
      .notNull()
      .references(() => installment.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // NULL na primeira linha (criação sem estado anterior).
    oldStatus: installmentStatusEnum('old_status'),

    newStatus: installmentStatusEnum('new_status').notNull(),

    // Timestamp da transição — append-only, nunca atualizado.
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),

    // Usuário que causou a transição (NULL para transições de sistema, ex: cron/webhook).
    changedBy: uuid('changed_by'),

    // Motivo opcional da transição.
    note: text('note'),
  },
  (t) => ({
    // Fast lookup por parcela ordenado por data — usado em dunning e auditoria.
    idxInstallmentStatusHistoryInst: index('idx_installment_status_history_inst').on(
      t.installmentId,
      t.changedAt,
    ),
  }),
)

export type InstallmentStatusHistory = InferSelectModel<typeof installmentStatusHistory>
export type NewInstallmentStatusHistory = InferInsertModel<typeof installmentStatusHistory>
