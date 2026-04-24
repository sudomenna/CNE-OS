/**
 * MOD-MERGE — Contact merge & issues schema (T-1-07)
 *
 * Tables in this file:
 *   contact_issue, contact_merge, contact_merge_undo
 *
 * Specs:
 *   docs/20-domain/03-contact-merge-issues.md §3
 *   docs/30-contracts/01-enums.md          (enum values — enums declared in contact.ts)
 *   docs/30-contracts/02-db-schema-conventions.md
 *   docs/50-business-rules/BR-MERGE.md
 */
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { contact, contactIssueKindEnum, contactIssueStatusEnum } from './contact'
import { userAccount } from './organization'

// ---------------------------------------------------------------------------
// T-1-07a: contact_issue
// docs/20-domain/03-contact-merge-issues.md §3.1
// ---------------------------------------------------------------------------

export const contactIssue = pgTable(
  'contact_issue',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Contato "foco" da pendência — CASCADE: se o contato for removido, a issue vai junto
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    // Outro contato envolvido quando aplicável (ex.: duplicata)
    relatedContactId: uuid('related_contact_id').references(() => contact.id, {
      onDelete: 'set null',
    }),
    // BR-IDENTITY: tipo canônico de pendência
    kind: contactIssueKindEnum('kind').notNull(),
    status: contactIssueStatusEnum('status').notNull().default('open'),
    detail: text('detail').notNull(),
    // Dados estruturados da pendência (ex.: { email: '...', phone: '...' })
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    // 'identity_resolver' | 'automation' | 'integration' — NULL se aberta por usuário
    openedBySystem: text('opened_by_system'),
    openedByUserId: uuid('opened_by_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
    }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
    }),
    // INV-MERGE-05: resolution obrigatória quando status = 'resolved' (guard na camada de domínio)
    resolution: text('resolution'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxContactIssueContactStatus: index('idx_contact_issue_contact_status').on(
      t.contactId,
      t.status,
    ),
    // Índice parcial para busca eficiente de pendências abertas
    idxContactIssueOpen: index('idx_contact_issue_open')
      .on(t.status)
      .where(sql`${t.status} = 'open'`),
  }),
)

export type ContactIssue = InferSelectModel<typeof contactIssue>
export type NewContactIssue = InferInsertModel<typeof contactIssue>

// ---------------------------------------------------------------------------
// T-1-07b: contact_merge
// docs/20-domain/03-contact-merge-issues.md §3.2
//
// Imutável após criado: sem updated_at por design.
// undone_at é SET pelo mesmo registro quando undo ocorre.
// ---------------------------------------------------------------------------

export const contactMerge = pgTable(
  'contact_merge',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // RESTRICT: não pode deletar contato que participou de merge — preserva histórico
    principalContactId: uuid('principal_contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict' }),
    secondaryContactId: uuid('secondary_contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    // INV-MERGE-06: merge vinculado à issue preenche issue_id e resolve a issue
    issueId: uuid('issue_id').references(() => contactIssue.id, { onDelete: 'set null' }),
    // RESTRICT: merge não some se usuário for desativado — trilha de auditoria
    mergedByUserId: uuid('merged_by_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict' }),
    // Contagem por tabela: { transaction: 3, conversation: 1, ... }
    reassignedTables: jsonb('reassigned_tables').notNull().default(sql`'{}'::jsonb`),
    // BR-MERGE: estado do principal ANTES do merge (imutável — nunca UPDATE neste campo)
    principalSnapshot: jsonb('principal_snapshot').notNull(),
    // BR-MERGE: estado do secundário ANTES do merge (imutável — nunca UPDATE neste campo)
    secondarySnapshot: jsonb('secondary_snapshot').notNull(),
    // SET quando contact_merge_undo é criado
    undoneAt: timestamp('undone_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-MERGE-01: contatos distintos — CHECK no banco
    ckContactMergeDistinct: check(
      'ck_contact_merge_distinct',
      sql`${t.principalContactId} <> ${t.secondaryContactId}`,
    ),
    idxContactMergePrincipal: index('idx_contact_merge_principal').on(t.principalContactId),
    idxContactMergeSecondary: index('idx_contact_merge_secondary').on(t.secondaryContactId),
  }),
)

export type ContactMerge = InferSelectModel<typeof contactMerge>
export type NewContactMerge = InferInsertModel<typeof contactMerge>

// ---------------------------------------------------------------------------
// T-1-07c: contact_merge_undo
// docs/20-domain/03-contact-merge-issues.md §3.3
//
// Imutável: sem updated_at por design.
// INV-MERGE-04: uq_contact_merge_undo_merge garante undo único por merge.
// ---------------------------------------------------------------------------

export const contactMergeUndo = pgTable(
  'contact_merge_undo',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // RESTRICT: não pode deletar merge que foi desfeito — preserva trilha
    mergeId: uuid('merge_id')
      .notNull()
      .references(() => contactMerge.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    // BR-RBAC: somente papéis 'admin' ou 'financial' podem executar undo (guard na Server Action)
    // RESTRICT: auditoria não some se usuário for desativado
    undoneByUserId: uuid('undone_by_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict' }),
    // Tabelas cujas FKs foram revertidas para o contato secundário
    revertedTables: jsonb('reverted_tables').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-MERGE-04: undo ocorre no máximo uma vez por merge
    uqContactMergeUndoMerge: uniqueIndex('uq_contact_merge_undo_merge').on(t.mergeId),
  }),
)

export type ContactMergeUndo = InferSelectModel<typeof contactMergeUndo>
export type NewContactMergeUndo = InferInsertModel<typeof contactMergeUndo>
