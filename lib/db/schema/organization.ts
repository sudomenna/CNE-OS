/**
 * MOD-ORG — Organization schema (T-0-05 + T-0-06)
 *
 * Tables in this file: brand, legal_entity, brand_legal_entity,
 *                      user_account, role, user_role
 *
 * Specs:
 *   docs/20-domain/01-organization.md §3.1–§3.6
 *   docs/30-contracts/02-db-schema-conventions.md
 */
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// brand
// ---------------------------------------------------------------------------

export const brand = pgTable(
  'brand',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    logoUrl: text('logo_url'),
    primaryColor: text('primary_color'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — see docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    uqBrandName: uniqueIndex('uq_brand_name').on(t.name),
    uqBrandSlug: uniqueIndex('uq_brand_slug').on(t.slug),
    // INV-ORG-05: slug must be kebab-case
    ckBrandSlugKebab: check('ck_brand_slug_kebab', sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]*$'`),
  }),
)

export type Brand = InferSelectModel<typeof brand>
export type NewBrand = InferInsertModel<typeof brand>

// ---------------------------------------------------------------------------
// legal_entity
// ---------------------------------------------------------------------------

export const legalEntity = pgTable(
  'legal_entity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // INV-ORG-02: exactly 14 numeric digits — enforced by CHECK below
    cnpj: varchar('cnpj', { length: 14 }).notNull(),
    companyName: text('company_name').notNull(),
    tradeName: text('trade_name'),
    taxRegime: text('tax_regime'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uqLegalEntityCnpj: uniqueIndex('uq_legal_entity_cnpj').on(t.cnpj),
    // INV-ORG-02: CNPJ must be exactly 14 numeric digits
    ckLegalEntityCnpjLength: check(
      'ck_legal_entity_cnpj_length',
      sql`char_length(${t.cnpj}) = 14 AND ${t.cnpj} ~ '^[0-9]{14}$'`,
    ),
  }),
)

export type LegalEntity = InferSelectModel<typeof legalEntity>
export type NewLegalEntity = InferInsertModel<typeof legalEntity>

// ---------------------------------------------------------------------------
// brand_legal_entity  (N×N join table)
// ---------------------------------------------------------------------------

export const brandLegalEntity = pgTable(
  'brand_legal_entity',
  {
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, {
        // docs/30-contracts/02-db-schema-conventions.md §14
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    legalEntityId: uuid('legal_entity_id')
      .notNull()
      .references(() => legalEntity.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    // INV-ORG-03: at most one is_default = true per brand (partial unique index below)
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Composite primary key
    pk: primaryKey({ columns: [t.brandId, t.legalEntityId] }),
    // INV-ORG-03: at most one default legal entity per brand
    // Drizzle generates: CREATE UNIQUE INDEX ... ON brand_legal_entity (brand_id) WHERE is_default = true
    uqBrandLegalEntityDefault: uniqueIndex('uq_brand_legal_entity_default')
      .on(t.brandId)
      .where(sql`${t.isDefault} = true`),
    // Non-unique index for FK lookup on legal_entity_id
    idxBrandLegalEntityLegalEntityId: index('idx_brand_legal_entity_legal_entity_id').on(
      t.legalEntityId,
    ),
  }),
)

export type BrandLegalEntity = InferSelectModel<typeof brandLegalEntity>
export type NewBrandLegalEntity = InferInsertModel<typeof brandLegalEntity>

// ---------------------------------------------------------------------------
// role_kind enum
// docs/30-contracts/01-enums.md
// ---------------------------------------------------------------------------

export const roleKindEnum = pgEnum('role_kind', [
  'admin',
  'financial',
  'marketing',
  'support',
  'commercial',
])

// ---------------------------------------------------------------------------
// user_account
// docs/20-domain/01-organization.md §3.4
// ---------------------------------------------------------------------------

export const userAccount = pgTable(
  'user_account',
  {
    // id mirrors auth.users.id from Supabase — no default generated here
    id: uuid('id').primaryKey(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    isActive: boolean('is_active').notNull().default(true),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    uqUserAccountEmail: uniqueIndex('uq_user_account_email').on(t.email),
  }),
)

export type UserAccount = InferSelectModel<typeof userAccount>
export type NewUserAccount = InferInsertModel<typeof userAccount>

// ---------------------------------------------------------------------------
// role  (fixed catalogue seeded by lib/db/seed/roles.ts)
// docs/20-domain/01-organization.md §3.5
// ---------------------------------------------------------------------------

export const role = pgTable(
  'role',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: roleKindEnum('kind').notNull(),
    description: text('description'),
  },
  (t) => ({
    uqRoleKind: uniqueIndex('uq_role_kind').on(t.kind),
  }),
)

export type Role = InferSelectModel<typeof role>
export type NewRole = InferInsertModel<typeof role>

// ---------------------------------------------------------------------------
// user_role  (many-to-many, user_account ↔ role)
// docs/20-domain/01-organization.md §3.6
// ---------------------------------------------------------------------------

export const userRole = pgTable(
  'user_role',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'restrict' }),
    // grantedBy is nullable — SET NULL when the granting user is deleted
    grantedBy: uuid('granted_by').references(() => userAccount.id, {
      onDelete: 'set null',
    }),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.roleId] }),
    idxUserRoleUser: index('idx_user_role_user').on(t.userId),
  }),
)

export type UserRole = InferSelectModel<typeof userRole>
export type NewUserRole = InferInsertModel<typeof userRole>
