/**
 * MOD-OFFER — Offer Engine schema (T-6-05 … T-6-12)
 *
 * Tables added per task:
 *   T-6-05: offer
 *   T-6-06: offer_condition           ✓
 *   T-6-07: offer_condition_rule_group  ✓
 *   T-6-08: offer_condition_rule       ✓
 *   T-6-09: offer_condition_item       ✓
 *   T-6-10: offer_payment_option       ✓
 *   T-6-11: offer_sales_counter        (to be added)
 *   T-6-12: offer_status_history, offer_condition_priority_history (to be added)
 *
 * Specs:
 *   docs/20-domain/10-offer-engine.md §3.1, §3.9
 *   docs/30-contracts/02-db-schema-conventions.md
 *   docs/30-contracts/01-enums.md
 *   docs/50-business-rules/BR-OFFER-UNIQUENESS.md
 */
import {
  bigint,
  boolean,
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
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { brand, legalEntity, userAccount } from './organization'
import { product, commercialBenefit } from './catalog'

// ---------------------------------------------------------------------------
// Enums — docs/30-contracts/01-enums.md
// ---------------------------------------------------------------------------

export const offerStatusEnum = pgEnum('offer_status', [
  'draft',
  'active',
  'paused',
  'archived',
])

export const offerConditionStatusEnum = pgEnum('offer_condition_status', [
  'draft',
  'active',
  'paused',
  'archived',
])

// offer_rule_operator — docs/30-contracts/01-enums.md §Catálogo/Oferta
export const offerRuleOperatorEnum = pgEnum('offer_rule_operator', ['and', 'or'])

// offer_rule_kind — docs/30-contracts/01-enums.md §Catálogo/Oferta
// Kinds: date_range, sales_count_reached, campaign, channel, creative, internal_use
export const offerRuleKindEnum = pgEnum('offer_rule_kind', [
  'date_range',
  'sales_count_reached',
  'campaign',
  'channel',
  'creative',
  'internal_use',
])

// offer_payment_method — docs/30-contracts/01-enums.md §Catálogo/Oferta
// INV-OFFER-08: when method='installments', installments must be > 1.
export const offerPaymentMethodEnum = pgEnum('offer_payment_method', [
  'pix',
  'credit_card',
  'installments',
  'boleto',
  'custom',
])

// offer_condition_item_kind — docs/30-contracts/01-enums.md §Catálogo/Oferta
// INV-OFFER-07: kind='commercial_benefit' → commercial_benefit_id; others → product_id.
export const offerConditionItemKindEnum = pgEnum('offer_condition_item_kind', [
  'main',
  'bonus',
  'upsell',
  'order_bump',
  'complement',
  'commercial_benefit',
])

// ---------------------------------------------------------------------------
// offer
// docs/20-domain/10-offer-engine.md §3.1, §3.9
// ---------------------------------------------------------------------------

export const offer = pgTable(
  'offer',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK brand — docs/30-contracts/02-db-schema-conventions.md §5
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // INV-OFFER-03: issuing_legal_entity_id is immutable after first approved transaction.
    // Enforced by Server Action guard + trigger (T-6-22). FK: ON DELETE RESTRICT per ADR-02.
    issuingLegalEntityId: uuid('issuing_legal_entity_id')
      .notNull()
      .references(() => legalEntity.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    name: text('name').notNull(),

    // Kebab-case enforced by ck_offer_slug_kebab below.
    // Uniqueness per brand enforced by uq_offer_brand_slug below.
    slug: text('slug').notNull(),

    description: text('description'),

    // 'regular' | 'renewal' — ck_offer_type + ck_offer_renewal_requires_ref enforce consistency.
    type: text('type').notNull().default('regular'),

    // INV-OFFER-04: required when type='renewal'. Self-reference FK.
    // ON DELETE RESTRICT: prevents deletion of an offer that is renewed by another.
    // AnyPgColumn required for circular/self FK — docs/30-contracts/02-db-schema-conventions.md §14
    renewsOfferId: uuid('renews_offer_id').references((): AnyPgColumn => offer.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),

    status: offerStatusEnum('status').notNull().default('draft'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    // SET NULL when the creating user is deleted (accessory reference).
    createdBy: uuid('created_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
  },
  (t) => ({
    // Unique slug per brand
    uqOfferBrandSlug: uniqueIndex('uq_offer_brand_slug').on(t.brandId, t.slug),

    // INV-OFFER-04: slug must be kebab-case
    ckOfferSlugKebab: check(
      'ck_offer_slug_kebab',
      sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]*$'`,
    ),

    // type must be one of the two recognised values
    ckOfferType: check(
      'ck_offer_type',
      sql`${t.type} IN ('regular', 'renewal')`,
    ),

    // INV-OFFER-04 / BR-OFFER-UNIQUENESS:
    //   type='regular'  ⟺  renews_offer_id IS NULL
    //   type='renewal'  ⟺  renews_offer_id IS NOT NULL
    // BR-OFFER-UNIQUENESS: renewal offer_id is distinct from original, so the unique index
    // on transaction(contact_id, offer_id) WHERE status='approved' is never violated.
    ckOfferRenewalRequiresRef: check(
      'ck_offer_renewal_requires_ref',
      sql`(${t.type} = 'regular' AND ${t.renewsOfferId} IS NULL)
          OR (${t.type} = 'renewal' AND ${t.renewsOfferId} IS NOT NULL)`,
    ),

    // Index to speed up FK lookup on renews_offer_id (self-reference)
    idxOfferRenewsOfferId: index('idx_offer_renews_offer_id').on(t.renewsOfferId),
  }),
)

export type Offer = InferSelectModel<typeof offer>
export type NewOffer = InferInsertModel<typeof offer>

// ---------------------------------------------------------------------------
// offer_condition
// docs/20-domain/10-offer-engine.md §3.2, INV-OFFER-01
// T-6-06
// ---------------------------------------------------------------------------

export const offerCondition = pgTable(
  'offer_condition',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK offer — ON DELETE CASCADE: condition is subordinate to offer.
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    name: text('name').notNull(),

    description: text('description'),

    // ck_offer_condition_priority_range: BETWEEN -1000 AND 1000
    priority: integer('priority').notNull().default(0),

    // Manual commercial advantage score — used for tiebreak in selectCondition.
    advantageScore: numeric('advantage_score', { precision: 8, scale: 2 })
      .notNull()
      .default('0'),

    status: offerConditionStatusEnum('status').notNull().default('draft'),

    // When false, condition applies only when ctx.isInternal === true.
    isPublic: boolean('is_public').notNull().default(true),

    // INV-OFFER-01: exactly 1 is_default=true per offer with deleted_at IS NULL.
    // Enforced by uq_offer_condition_default_per_offer (partial unique index below).
    isDefault: boolean('is_default').notNull().default(false),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

    // SET NULL when the creating user is deleted (accessory reference).
    createdBy: uuid('created_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // Soft-delete — required by the partial unique index on is_default.
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // INV-OFFER-01: at most 1 active default condition per offer.
    // Partial index: only rows where is_default=true AND deleted_at IS NULL are covered.
    // BR-OFFER-UNIQUENESS §DDL canônica: uniqueness enforced at DB level for defence-in-depth.
    uqOfferConditionDefaultPerOffer: uniqueIndex(
      'uq_offer_condition_default_per_offer',
    )
      .on(t.offerId)
      .where(sql`is_default = true AND deleted_at IS NULL`),

    // General lookup by offer_id (used heavily in selectCondition).
    idxOfferConditionOffer: index('idx_offer_condition_offer').on(t.offerId),

    // ck_offer_condition_priority_range: priority BETWEEN -1000 AND 1000
    ckOfferConditionPriorityRange: check(
      'ck_offer_condition_priority_range',
      sql`${t.priority} BETWEEN -1000 AND 1000`,
    ),
  }),
)

export type OfferCondition = InferSelectModel<typeof offerCondition>
export type NewOfferCondition = InferInsertModel<typeof offerCondition>

// ---------------------------------------------------------------------------
// offer_condition_rule_group
// docs/20-domain/10-offer-engine.md §3.3, INV-OFFER-05
// T-6-07
//
// Logical grouping of rules; supports arbitrary nesting via self-reference
// (parent_group_id → offer_condition_rule_group.id).
//
// INV-OFFER-05: each offer_condition has exactly 1 root group
// (parent_group_id IS NULL). Enforced by partial unique index
// uq_offer_rule_group_root below.
// ---------------------------------------------------------------------------

export const offerConditionRuleGroup = pgTable(
  'offer_condition_rule_group',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK offer_condition — ON DELETE CASCADE: group is subordinate to condition.
    offerConditionId: uuid('offer_condition_id')
      .notNull()
      .references(() => offerCondition.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // Self-reference for nesting. NULL means this is the root group for the condition.
    // AnyPgColumn required to avoid circular reference error in Drizzle.
    // ON DELETE CASCADE: removing a parent group removes its children recursively.
    parentGroupId: uuid('parent_group_id').references(
      (): AnyPgColumn => offerConditionRuleGroup.id,
      { onDelete: 'cascade', onUpdate: 'cascade' },
    ),

    // Logical operator applied to the direct children of this group.
    operator: offerRuleOperatorEnum('operator').notNull().default('and'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-OFFER-05: at most 1 root group per condition.
    // Partial unique index: only rows where parent_group_id IS NULL are covered.
    uqOfferRuleGroupRoot: uniqueIndex('uq_offer_rule_group_root')
      .on(t.offerConditionId)
      .where(sql`parent_group_id IS NULL`),

    // General lookup by offer_condition_id (used in evaluateEligibility).
    idxOfferConditionRuleGroupCondition: index(
      'idx_offer_condition_rule_group_condition',
    ).on(t.offerConditionId),

    // Lookup by parent_group_id to fetch child groups during recursive evaluation.
    idxOfferConditionRuleGroupParent: index(
      'idx_offer_condition_rule_group_parent',
    ).on(t.parentGroupId),
  }),
)

export type OfferConditionRuleGroup = InferSelectModel<typeof offerConditionRuleGroup>
export type NewOfferConditionRuleGroup = InferInsertModel<typeof offerConditionRuleGroup>

// ---------------------------------------------------------------------------
// offer_condition_rule
// docs/20-domain/10-offer-engine.md §3.4, §3.4.1
// T-6-08
//
// Atomic rule inside a rule group.
//
// INV-OFFER-10: a rule without a group is invalid — rule_group_id is NOT NULL
// and carries ON DELETE CASCADE so removing the group removes its rules.
//
// `kind` uses the offer_rule_kind enum (docs/30-contracts/01-enums.md).
// `params` is a JSONB blob validated at runtime by validateRuleParams()
//  (lib/domain/offer/rule-params-schema.ts) before every INSERT/UPDATE.
// ---------------------------------------------------------------------------

export const offerConditionRule = pgTable(
  'offer_condition_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // INV-OFFER-10: rule_group_id NOT NULL — a rule without a group is invalid.
    // ON DELETE CASCADE: removing the group cascades to its rules.
    ruleGroupId: uuid('rule_group_id')
      .notNull()
      .references(() => offerConditionRuleGroup.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    // offer_rule_kind enum — docs/30-contracts/01-enums.md §Catálogo/Oferta
    kind: offerRuleKindEnum('kind').notNull(),

    // JSONB params — schema per kind validated at runtime via validateRuleParams().
    // docs/20-domain/10-offer-engine.md §3.4.1
    params: jsonb('params').notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // General lookup by rule_group_id (used in evaluateEligibility tree walk).
    idxOfferConditionRuleGroup: index('idx_offer_condition_rule_group').on(t.ruleGroupId),
  }),
)

export type OfferConditionRule = InferSelectModel<typeof offerConditionRule>
export type NewOfferConditionRule = InferInsertModel<typeof offerConditionRule>

// ---------------------------------------------------------------------------
// offer_condition_item
// docs/20-domain/10-offer-engine.md §3.5, INV-OFFER-07
// T-6-09
//
// Each item references either a product or a commercial_benefit — never both,
// never neither. The constraint ck_offer_condition_item_ref_exclusive enforces:
//   - kind <> 'commercial_benefit' → product_id IS NOT NULL, commercial_benefit_id IS NULL
//   - kind = 'commercial_benefit' → commercial_benefit_id IS NOT NULL, product_id IS NULL
// ---------------------------------------------------------------------------

export const offerConditionItem = pgTable(
  'offer_condition_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK offer_condition — ON DELETE CASCADE: item is subordinate to condition.
    offerConditionId: uuid('offer_condition_id')
      .notNull()
      .references(() => offerCondition.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // offer_condition_item_kind — docs/30-contracts/01-enums.md §Catálogo/Oferta
    // INV-OFFER-07: kind determines which reference column must be non-null.
    kind: offerConditionItemKindEnum('kind').notNull(),

    // FK product — ON DELETE RESTRICT: prevent product deletion while referenced.
    // NULL when kind = 'commercial_benefit' (enforced by CHECK below).
    productId: uuid('product_id').references(() => product.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),

    // FK commercial_benefit — ON DELETE RESTRICT: prevent benefit deletion while referenced.
    // NULL when kind <> 'commercial_benefit' (enforced by CHECK below).
    commercialBenefitId: uuid('commercial_benefit_id').references(
      () => commercialBenefit.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),

    // INV-OFFER-06: quantity > 0
    quantity: integer('quantity').notNull().default(1),

    // Access configuration — e.g. { "delay_days": 0, "drip": false }
    accessRule: jsonb('access_rule').notNull().default(sql`'{}'::jsonb`),

    // NULL = perpetuous (lifetime access)
    vigencyMonths: integer('vigency_months'),

    // Optional discount applied over the item's base price.
    discount: numeric('discount', { precision: 12, scale: 2 }),

    // Optional responsible user for delivery (SET NULL on user deletion).
    responsibleUserId: uuid('responsible_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // Display ordering within a condition.
    orderIndex: integer('order_index').notNull().default(0),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-OFFER-07: BR-OFFER-UNIQUENESS §3.5 — ref exclusive:
    //   kind <> 'commercial_benefit' → product_id NOT NULL AND commercial_benefit_id IS NULL
    //   kind = 'commercial_benefit' → commercial_benefit_id NOT NULL AND product_id IS NULL
    ckOfferConditionItemRefExclusive: check(
      'ck_offer_condition_item_ref_exclusive',
      sql`(
        ${t.productId} IS NOT NULL
        AND ${t.commercialBenefitId} IS NULL
        AND ${t.kind} <> 'commercial_benefit'
      ) OR (
        ${t.productId} IS NULL
        AND ${t.commercialBenefitId} IS NOT NULL
        AND ${t.kind} = 'commercial_benefit'
      )`,
    ),

    // INV-OFFER-06: quantity must be positive.
    ckOfferConditionItemQuantity: check(
      'ck_offer_condition_item_quantity',
      sql`${t.quantity} > 0`,
    ),

    // General lookup by offer_condition_id (used when loading items for a condition).
    idxOfferConditionItemCondition: index('idx_offer_condition_item_condition').on(
      t.offerConditionId,
    ),

    // Lookup by product_id (used to check whether a product can be archived).
    idxOfferConditionItemProduct: index('idx_offer_condition_item_product').on(t.productId),

    // Lookup by commercial_benefit_id (used to check whether a benefit can be archived).
    idxOfferConditionItemBenefit: index('idx_offer_condition_item_benefit').on(
      t.commercialBenefitId,
    ),
  }),
)

export type OfferConditionItem = InferSelectModel<typeof offerConditionItem>
export type NewOfferConditionItem = InferInsertModel<typeof offerConditionItem>

// ---------------------------------------------------------------------------
// offer_payment_option
// docs/20-domain/10-offer-engine.md §3.6, INV-OFFER-08
// T-6-10
//
// A payment option is always linked to an offer_condition (ON DELETE CASCADE).
// Changing a payment option never alters the included benefits — it only changes
// price and form of payment. Consumed by MOD-TRANSACTION when generating the
// transaction snapshot.
//
// INV-OFFER-08: when method = 'installments', installments must be > 1.
// Constraint ck_offer_payment_installments:
//   CHECK (method <> 'installments' OR installments > 1)
// Equivalent to: NOT (method = 'installments' AND installments <= 1)
// ---------------------------------------------------------------------------

export const offerPaymentOption = pgTable(
  'offer_payment_option',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK offer_condition — ON DELETE CASCADE: payment option is subordinate to condition.
    offerConditionId: uuid('offer_condition_id')
      .notNull()
      .references(() => offerCondition.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // offer_payment_method enum — docs/30-contracts/01-enums.md §Catálogo/Oferta
    // INV-OFFER-08: 'installments' requires installments > 1 (ck_offer_payment_installments).
    method: offerPaymentMethodEnum('method').notNull(),

    // ck_offer_payment_option_price: price >= 0
    price: numeric('price', { precision: 12, scale: 2 }).notNull(),

    // Required when method = 'installments'; must be > 1 (CHECK below).
    // NULL for all other payment methods.
    installments: integer('installments'),

    // Free-form configuration per method (e.g. custom instalment rules, gateway config).
    // docs/20-domain/10-offer-engine.md §OQ-OFFER-04 — schema today is unconstrained.
    customConfig: jsonb('custom_config').notNull().default(sql`'{}'::jsonb`),

    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // price must be non-negative.
    ckOfferPaymentOptionPrice: check(
      'ck_offer_payment_option_price',
      sql`${t.price} >= 0`,
    ),

    // INV-OFFER-08: installments method requires installments > 1.
    // Formulation: method <> 'installments' OR installments > 1
    // This bars the combination method='installments' AND installments <= 1
    // (including installments = 1 and installments IS NULL for that method).
    ckOfferPaymentInstallments: check(
      'ck_offer_payment_installments',
      sql`${t.method} <> 'installments' OR ${t.installments} > 1`,
    ),

    // General lookup by offer_condition_id.
    idxOfferPaymentOptionCondition: index('idx_offer_payment_option_condition').on(
      t.offerConditionId,
    ),

    // Lookup by method to support filtering active options per method.
    idxOfferPaymentOptionMethod: index('idx_offer_payment_option_method').on(t.method),
  }),
)

export type OfferPaymentOption = InferSelectModel<typeof offerPaymentOption>
export type NewOfferPaymentOption = InferInsertModel<typeof offerPaymentOption>

// ---------------------------------------------------------------------------
// offer_sales_counter
// docs/20-domain/10-offer-engine.md §3.7, INV-OFFER-09
// T-6-11
//
// Atomic counter per offer — consumed by the `sales_count_reached` rule kind.
// 1 row per offer, seeded at INSERT time by trigger
// `offer_seed_sales_counter` (supabase/migrations/20260425000010_offer_seed_trigger.sql).
//
// INV-OFFER-09: approved_count is monotonic — it only grows.
//   MOD-TRANSACTION increments inside the same SQL transaction that approves the sale:
//     UPDATE offer_sales_counter
//     SET approved_count = approved_count + 1, updated_at = now()
//     WHERE offer_id = $1
//     RETURNING approved_count;
//
// Concurrency: Postgres serialises the UPDATE on the same row.
// Over-approval on race is documented and accepted in ADR-07.
//
// offer_id is both PK and FK → no separate `id` column needed (1-1 relation).
// ON DELETE CASCADE: counter goes away when the offer is deleted.
// ---------------------------------------------------------------------------

export const offerSalesCounter = pgTable('offer_sales_counter', {
  // offer_id is the PK — 1 counter per offer, no ambiguity.
  // ON DELETE CASCADE: counter is purely subordinate to offer.
  offerId: uuid('offer_id')
    .primaryKey()
    .references(() => offer.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  // INV-OFFER-09: monotonic, only incremented via atomic UPDATE RETURNING.
  // bigint per spec §3.7 (future-proofing for large counters).
  // Drizzle bigint with 'number' mode — safe for counts well below Number.MAX_SAFE_INTEGER.
  approvedCount: bigint('approved_count', { mode: 'number' }).notNull().default(0),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type OfferSalesCounter = InferSelectModel<typeof offerSalesCounter>
export type NewOfferSalesCounter = InferInsertModel<typeof offerSalesCounter>

// ---------------------------------------------------------------------------
// offer_status_history
// docs/20-domain/10-offer-engine.md §3.8, INV-OFFER-02
// T-6-12
//
// Append-only audit trail of offer.status transitions.
// Trigger `offer_status_history_append_only` (supabase/migrations/20260425000011_offer_triggers.sql)
// blocks UPDATE and DELETE on this table.
//
// No `updated_at` — append-only tables have no mutable timestamps.
// No soft-delete — append-only rows are never logically deleted.
// FK offer_id: ON DELETE RESTRICT — history must be preserved even if offer is deleted.
// ---------------------------------------------------------------------------

export const offerStatusHistory = pgTable(
  'offer_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK offer — ON DELETE RESTRICT: history row must survive offer deletion.
    // docs/30-contracts/02-db-schema-conventions.md §14
    offerId: uuid('offer_id')
      .notNull()
      .references(() => offer.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // NULL when this is the first transition (no previous status).
    fromStatus: offerStatusEnum('from_status'),

    // The status the offer transitioned to (always required).
    toStatus: offerStatusEnum('to_status').notNull(),

    // The user who triggered the status change (NULL for system-initiated transitions).
    changedByUserId: uuid('changed_by_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // Optional human-readable reason for the transition.
    reason: text('reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Lookup by offer_id to reconstruct the full status timeline.
    idxOfferStatusHistoryOffer: index('idx_offer_status_history_offer').on(
      t.offerId,
      t.createdAt,
    ),
  }),
)

export type OfferStatusHistory = InferSelectModel<typeof offerStatusHistory>
export type NewOfferStatusHistory = InferInsertModel<typeof offerStatusHistory>

// ---------------------------------------------------------------------------
// offer_condition_priority_history
// docs/20-domain/10-offer-engine.md §3.8, INV-OFFER-02
// T-6-12
//
// Append-only audit trail of offer_condition priority and advantage_score changes.
// Trigger `offer_condition_priority_history_append_only`
// (supabase/migrations/20260425000011_offer_triggers.sql)
// blocks UPDATE and DELETE on this table.
//
// Mirrors the spec DDL in §3.8 with field names aligned to Drizzle camelCase.
// `from_advantage_score` / `to_advantage_score` follow the spec column names
// (the spec calls them from_advantage_score / to_advantage_score even though
//  the module-doc header uses from_score / to_score — using the verbose form
//  to match the DDL block in §3.8 and avoid ambiguity).
//
// FK offer_condition_id: ON DELETE RESTRICT — history survives condition deletion.
// ---------------------------------------------------------------------------

export const offerConditionPriorityHistory = pgTable(
  'offer_condition_priority_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK offer_condition — ON DELETE RESTRICT: history must survive condition deletion.
    offerConditionId: uuid('offer_condition_id')
      .notNull()
      .references(() => offerCondition.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // NULL when this is the first recorded value (no previous priority).
    fromPriority: integer('from_priority'),

    // The priority value the condition transitioned to (always required).
    toPriority: integer('to_priority').notNull(),

    // NULL when no previous advantage_score recorded.
    fromAdvantageScore: numeric('from_advantage_score', { precision: 8, scale: 2 }),

    // The advantage_score value after the change (always required).
    toAdvantageScore: numeric('to_advantage_score', { precision: 8, scale: 2 }).notNull(),

    // The user who triggered the change (NULL for system-initiated changes).
    changedByUserId: uuid('changed_by_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // Optional human-readable reason for the change.
    reason: text('reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Lookup by offer_condition_id to reconstruct the full priority timeline.
    idxOfferConditionPriorityHistoryCondition: index(
      'idx_offer_condition_priority_history_condition',
    ).on(t.offerConditionId, t.createdAt),
  }),
)

export type OfferConditionPriorityHistory = InferSelectModel<
  typeof offerConditionPriorityHistory
>
export type NewOfferConditionPriorityHistory = InferInsertModel<
  typeof offerConditionPriorityHistory
>
