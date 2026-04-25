/**
 * MOD-CATALOG — Catalog schema (T-6-01, T-6-02)
 *
 * Tables in this file: product_category, product, commercial_benefit
 *
 * Specs:
 *   docs/20-domain/09-catalog.md §3
 *   docs/30-contracts/01-enums.md   (product_kind)
 *   docs/30-contracts/02-db-schema-conventions.md
 */
import {
  boolean,
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
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { brand, userAccount } from './organization'

// ---------------------------------------------------------------------------
// Enums
// docs/30-contracts/01-enums.md — Catálogo / Oferta
// ---------------------------------------------------------------------------

export const productKindEnum = pgEnum('product_kind', [
  'course',
  'ebook',
  'training_online',
  'training_in_person',
  'mentoring',
  'bonus',
  'other',
])

// ---------------------------------------------------------------------------
// product_category
// docs/20-domain/09-catalog.md §3.2
// ---------------------------------------------------------------------------

export const productCategory = pgTable(
  'product_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, {
        // docs/30-contracts/02-db-schema-conventions.md §14
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    // Self-reference: optional parent for hierarchy
    // AnyPgColumn required for circular/self FK — docs/30-contracts/02-db-schema-conventions.md §14
    parentId: uuid('parent_id').references((): AnyPgColumn => productCategory.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-CATALOG-03 (category variant): slug unique per brand
    uqProductCategoryBrandSlug: uniqueIndex('uq_product_category_brand_slug').on(
      t.brandId,
      t.slug,
    ),
    idxProductCategoryBrand: index('idx_product_category_brand').on(t.brandId),
  }),
)

export type ProductCategory = InferSelectModel<typeof productCategory>
export type NewProductCategory = InferInsertModel<typeof productCategory>

// ---------------------------------------------------------------------------
// product
// docs/20-domain/09-catalog.md §3.1
// ---------------------------------------------------------------------------

export const product = pgTable(
  'product',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, {
        // docs/30-contracts/02-db-schema-conventions.md §14
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    categoryId: uuid('category_id').references(() => productCategory.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    name: text('name').notNull(),
    // INV-CATALOG-03: slug unique per brand, kebab-case enforced by CHECK below
    slug: text('slug').notNull(),
    kind: productKindEnum('kind').notNull().default('other'),
    description: text('description'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // INV-CATALOG-03: slug unique per brand
    uqProductBrandSlug: uniqueIndex('uq_product_brand_slug').on(t.brandId, t.slug),
    // INV-CATALOG-03: slug must be kebab-case — no uppercase letters
    ckProductSlugKebab: check(
      'ck_product_slug_kebab',
      sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]*$'`,
    ),
    // INV-CATALOG-05: status is 'active' or 'archived' only
    ckProductStatus: check(
      'ck_product_status',
      sql`${t.status} IN ('active', 'archived')`,
    ),
    idxProductBrand: index('idx_product_brand').on(t.brandId),
    idxProductKind: index('idx_product_kind').on(t.kind),
  }),
)

export type Product = InferSelectModel<typeof product>
export type NewProduct = InferInsertModel<typeof product>

// ---------------------------------------------------------------------------
// commercial_benefit
// docs/20-domain/09-catalog.md §3.3
// ---------------------------------------------------------------------------

export const commercialBenefit = pgTable(
  'commercial_benefit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, {
        // docs/30-contracts/02-db-schema-conventions.md §14
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    name: text('name').notNull(),
    // INV-CATALOG-04: slug unique per brand
    slug: text('slug').notNull(),
    description: text('description'),
    // INV-CATALOG-06: auto_tag is kebab-case (validated at domain layer)
    autoTag: text('auto_tag'),
    // Vigência padrão; pode ser sobrescrita em offer_condition_item.vigency_months
    defaultDurationMonths: integer('default_duration_months'),
    // FK para responsável padrão — opcional
    defaultResponsibleUserId: uuid('default_responsible_user_id').references(
      () => userAccount.id,
      {
        onDelete: 'set null',
        onUpdate: 'cascade',
      },
    ),
    // Quando true, todo transaction_item gerado exige delivery_status != 'pending'
    deliveryStatusRequired: boolean('delivery_status_required').notNull().default(false),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-CATALOG-04: slug unique per brand
    uqCommercialBenefitBrandSlug: uniqueIndex('uq_commercial_benefit_brand_slug').on(
      t.brandId,
      t.slug,
    ),
    // Status must be 'active' or 'archived' only
    ckCommercialBenefitStatus: check(
      'ck_commercial_benefit_status',
      sql`${t.status} IN ('active', 'archived')`,
    ),
    idxCommercialBenefitBrand: index('idx_commercial_benefit_brand').on(t.brandId),
  }),
)

export type CommercialBenefit = InferSelectModel<typeof commercialBenefit>
export type NewCommercialBenefit = InferInsertModel<typeof commercialBenefit>
