/**
 * MOD-CONTACT — Contact aggregate schema (T-1-01 → T-1-05)
 *
 * Tables in this file:
 *   contact, contact_phone, contact_email,
 *   contact_document, contact_tag, contact_custom_field,
 *   contact_note, contact_status_history
 *
 * Specs:
 *   docs/20-domain/02-contact-identity.md §3
 *   docs/30-contracts/01-enums.md          (enum values)
 *   docs/30-contracts/02-db-schema-conventions.md
 *   docs/50-business-rules/BR-IDENTITY.md
 */
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { brand } from './organization'
import { userAccount } from './organization'

// ---------------------------------------------------------------------------
// Enums
// docs/30-contracts/01-enums.md — Contato
// ---------------------------------------------------------------------------

export const contactStatusEnum = pgEnum('contact_status', [
  'active',
  'inactive',
  'invalid',
  'blocked',
])

export const contactPhoneStatusEnum = pgEnum('contact_phone_status', [
  'primary',
  'secondary',
  'whatsapp_valid',
  'no_whatsapp',
  'invalid',
])

export const contactEmailStatusEnum = pgEnum('contact_email_status', [
  'primary',
  'alternative',
  'invalid',
  'unsubscribed',
])

export const contactClassificationEnum = pgEnum('contact_classification', [
  'lead',
  'customer',
  'student',
  'paid_lead',
])

export const contactIssueKindEnum = pgEnum('contact_issue_kind', [
  'email_duplicate',
  'phone_conflict',
  'document_mismatch',
  'source_divergence',
  'other',
])

export const contactIssueStatusEnum = pgEnum('contact_issue_status', [
  'open',
  'resolved',
  'ignored',
])

// ---------------------------------------------------------------------------
// T-1-01: contact (tabela principal do agregado)
// docs/20-domain/02-contact-identity.md §3.1
// ---------------------------------------------------------------------------

export const contact = pgTable(
  'contact',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fullName: text('full_name').notNull(),
    // BR-IDENTITY: CPF é opcional mas único entre contatos vivos (índice parcial abaixo)
    cpf: varchar('cpf', { length: 11 }),
    status: contactStatusEnum('status').notNull().default('active'),
    classification: contactClassificationEnum('classification').notNull().default('lead'),
    birthDate: date('birth_date'),
    // BR-IDENTITY: origem canônica de captura do contato
    origin: text('origin'),
    // BR-MERGE: contatos mesclados apontam para o principal via merged_into_id
    mergedIntoId: uuid('merged_into_id'),
    notesSummary: text('notes_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // BR-IDENTITY: CPF com 11 dígitos numéricos ou nulo
    ckContactCpfLength: check(
      'ck_contact_cpf_length',
      sql`${t.cpf} IS NULL OR (char_length(${t.cpf}) = 11 AND ${t.cpf} ~ '^[0-9]{11}$')`,
    ),
    // BR-IDENTITY: CPF único entre contatos vivos (não deletados, não mesclados)
    uqContactCpf: uniqueIndex('uq_contact_cpf')
      .on(t.cpf)
      .where(sql`${t.cpf} IS NOT NULL AND ${t.deletedAt} IS NULL AND ${t.mergedIntoId} IS NULL`),
    idxContactClassification: index('idx_contact_classification').on(t.classification),
    idxContactStatus: index('idx_contact_status').on(t.status),
    idxContactMergedInto: index('idx_contact_merged_into').on(t.mergedIntoId),
  }),
)

export type Contact = InferSelectModel<typeof contact>
export type NewContact = InferInsertModel<typeof contact>

// ---------------------------------------------------------------------------
// T-1-02: contact_phone
// docs/20-domain/02-contact-identity.md §3.2
// ---------------------------------------------------------------------------

export const contactPhone = pgTable(
  'contact_phone',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // Formato E.164 — normalizado antes de persistir (ex: +5511912345678)
    e164: varchar('e164', { length: 16 }).notNull(),
    status: contactPhoneStatusEnum('status').notNull().default('secondary'),
    whatsappCheckedAt: timestamp('whatsapp_checked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // BR-IDENTITY: e164 único entre phones não-inválidos
    uqContactPhoneE164: uniqueIndex('uq_contact_phone_e164')
      .on(t.e164)
      .where(sql`${t.status} <> 'invalid'`),
    // Apenas um phone primary por contato
    uqContactPhonePrimary: uniqueIndex('uq_contact_phone_primary')
      .on(t.contactId)
      .where(sql`${t.status} = 'primary'`),
  }),
)

export type ContactPhone = InferSelectModel<typeof contactPhone>
export type NewContactPhone = InferInsertModel<typeof contactPhone>

// ---------------------------------------------------------------------------
// T-1-03: contact_email
// docs/20-domain/02-contact-identity.md §3.3
// ---------------------------------------------------------------------------

export const contactEmail = pgTable(
  'contact_email',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    email: text('email').notNull(),
    status: contactEmailStatusEnum('status').notNull().default('alternative'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // BR-IDENTITY: email único entre emails ativos (não inválidos / não descadastrados)
    uqContactEmail: uniqueIndex('uq_contact_email')
      .on(t.email)
      .where(sql`${t.status} NOT IN ('invalid', 'unsubscribed')`),
    // Apenas um email primary por contato
    uqContactEmailPrimary: uniqueIndex('uq_contact_email_primary')
      .on(t.contactId)
      .where(sql`${t.status} = 'primary'`),
  }),
)

export type ContactEmail = InferSelectModel<typeof contactEmail>
export type NewContactEmail = InferInsertModel<typeof contactEmail>

// ---------------------------------------------------------------------------
// T-1-04a: contact_document
// docs/20-domain/02-contact-identity.md §3.4
// ---------------------------------------------------------------------------

export const contactDocument = pgTable(
  'contact_document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // kind: ex. 'rg', 'cnh', 'passaporte' — livre para extensão sem migration
    kind: text('kind').notNull(),
    value: text('value').notNull(),
    issuer: text('issuer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxContactDocumentContact: index('idx_contact_document_contact').on(t.contactId),
  }),
)

export type ContactDocument = InferSelectModel<typeof contactDocument>
export type NewContactDocument = InferInsertModel<typeof contactDocument>

// ---------------------------------------------------------------------------
// T-1-04b: contact_tag
// docs/20-domain/02-contact-identity.md §3.5
// ---------------------------------------------------------------------------

export const contactTag = pgTable(
  'contact_tag',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tag: text('tag').notNull(),
    source: text('source').notNull().default('manual'),
    appliedBy: uuid('applied_by').references(() => userAccount.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Tag única por contato — INSERT duplicado falha (idempotência via UPSERT na camada de domínio)
    uqContactTag: uniqueIndex('uq_contact_tag').on(t.contactId, t.tag),
  }),
)

export type ContactTag = InferSelectModel<typeof contactTag>
export type NewContactTag = InferInsertModel<typeof contactTag>

// ---------------------------------------------------------------------------
// T-1-04c: contact_custom_field
// docs/20-domain/02-contact-identity.md §3.6
// ---------------------------------------------------------------------------

export const contactCustomField = pgTable(
  'contact_custom_field',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // brand_id NULL = campo global; NOT NULL = campo específico da marca
    brandId: uuid('brand_id').references(() => brand.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull().default(sql`'null'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Chave única por (contato, marca, key)
    uqContactCustomField: uniqueIndex('uq_contact_custom_field').on(
      t.contactId,
      t.brandId,
      t.key,
    ),
  }),
)

export type ContactCustomField = InferSelectModel<typeof contactCustomField>
export type NewContactCustomField = InferInsertModel<typeof contactCustomField>

// ---------------------------------------------------------------------------
// T-1-05a: contact_note
// docs/20-domain/02-contact-identity.md §3.7
// ---------------------------------------------------------------------------

export const contactNote = pgTable(
  'contact_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // BR-RBAC: author_user_id RESTRICT — nota não some se usuário for desativado
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict' }),
    body: text('body').notNull(),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxContactNoteContact: index('idx_contact_note_contact').on(t.contactId, t.createdAt),
  }),
)

export type ContactNote = InferSelectModel<typeof contactNote>
export type NewContactNote = InferInsertModel<typeof contactNote>

// ---------------------------------------------------------------------------
// T-1-05b: contact_status_history  (APPEND-ONLY)
// docs/20-domain/02-contact-identity.md §3.8
// docs/30-contracts/02-db-schema-conventions.md §8
//
// Trigger na migration bloqueia UPDATE e DELETE nesta tabela.
// Sem updated_at (append-only por design).
// ---------------------------------------------------------------------------

export const contactStatusHistory = pgTable(
  'contact_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // ON DELETE RESTRICT: manter histórico mesmo se contato for soft-deleted
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    fromStatus: contactStatusEnum('from_status'),
    toStatus: contactStatusEnum('to_status').notNull(),
    fromClassification: contactClassificationEnum('from_classification'),
    toClassification: contactClassificationEnum('to_classification'),
    changedBy: uuid('changed_by').references(() => userAccount.id, { onDelete: 'set null' }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxContactStatusHistoryContact: index('idx_contact_status_history_contact').on(
      t.contactId,
      t.createdAt,
    ),
  }),
)

export type ContactStatusHistory = InferSelectModel<typeof contactStatusHistory>
export type NewContactStatusHistory = InferInsertModel<typeof contactStatusHistory>
