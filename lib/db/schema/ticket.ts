/**
 * MOD-TICKET — Ticket aggregate schema (T-3-12)
 *
 * Tables in this file:
 *   ticket, ticket_note, ticket_status_history, ticket_assignment_history
 *
 * Specs:
 *   docs/20-domain/06-ticket.md §3
 *   docs/30-contracts/01-enums.md         (enum values)
 *   docs/30-contracts/02-db-schema-conventions.md
 */
import {
  bigserial,
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { brand, userAccount } from './organization'
import { contact } from './contact'

// ---------------------------------------------------------------------------
// Enums — docs/30-contracts/01-enums.md §Inbox / Ticket
// ---------------------------------------------------------------------------

export const ticketStatusEnum = pgEnum('ticket_status', [
  'open',
  'in_progress',
  'waiting_reply',
  'resolved',
  'cancelled',
])

export const ticketPriorityEnum = pgEnum('ticket_priority', [
  'low',
  'medium',
  'high',
  'urgent',
])

export const ticketCategoryEnum = pgEnum('ticket_category', [
  'commercial',
  'support',
  'financial',
  'cancellation',
  'refund',
  'access',
  'registration',
  'other',
])

// ---------------------------------------------------------------------------
// ticket — entidade principal
// docs/20-domain/06-ticket.md §3 (DDL sketch + INV-TICKET-01 to INV-TICKET-07)
// ---------------------------------------------------------------------------

export const ticket = pgTable(
  'ticket',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // INV-TICKET-07: número sequencial global e único (UX humano-legível)
    number: bigserial('number', { mode: 'number' }).notNull(),
    contactId: uuid('contact_id')
      .notNull()
      // INV-TICKET-01: ticket sempre pertence a 1 contato; histórico preservado (RESTRICT)
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // INV-TICKET-01: brand_id opcional — herda de conversa de origem ou preenchido manualmente
    brandId: uuid('brand_id').references(() => brand.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // INV-TICKET-02: origin_conversation_id é opcional; sem FK por ora
    // A tabela `conversation` ainda não existe (será criada em T-3-02).
    // FK será adicionada em migration posterior quando conversation existir.
    originConversationId: uuid('origin_conversation_id'),
    status: ticketStatusEnum('status').notNull().default('open'),
    priority: ticketPriorityEnum('priority').notNull().default('medium'),
    category: ticketCategoryEnum('category').notNull(),
    // Título descritivo do ticket (equivale a `subject` no DDL sketch do domain doc)
    title: text('title').notNull(),
    description: text('description'),
    // INV-TICKET-03: responsável do ticket independente do responsável da conversa de origem
    assignedUserId: uuid('assigned_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    openedByUserId: uuid('opened_by_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // INV-TICKET-07: number sequencial global único
    uqTicketNumber: uniqueIndex('uq_ticket_number').on(t.number),
    idxTicketContact: index('idx_ticket_contact').on(t.contactId),
    idxTicketBrand: index('idx_ticket_brand').on(t.brandId),
    idxTicketStatus: index('idx_ticket_status').on(t.status),
    idxTicketAssignedUser: index('idx_ticket_assigned_user').on(t.assignedUserId),
  }),
)

export type Ticket = InferSelectModel<typeof ticket>
export type NewTicket = InferInsertModel<typeof ticket>

// ---------------------------------------------------------------------------
// ticket_note — notas no ticket (APPEND-ONLY)
// docs/20-domain/06-ticket.md §3
// docs/30-contracts/02-db-schema-conventions.md §6
//
// Trigger na migration bloqueia UPDATE e DELETE nesta tabela.
// Sem updated_at (append-only por design).
// ---------------------------------------------------------------------------

export const ticketNote = pgTable(
  'ticket_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    authorUserId: uuid('author_user_id')
      .notNull()
      // RESTRICT: nota não some se usuário for desativado
      .references(() => userAccount.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    body: text('body').notNull(),
    // is_internal=true: nota privada (visível apenas para agentes, não para o contato)
    isInternal: boolean('is_internal').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTicketNoteTicket: index('idx_ticket_note_ticket').on(t.ticketId, t.createdAt),
  }),
)

export type TicketNote = InferSelectModel<typeof ticketNote>
export type NewTicketNote = InferInsertModel<typeof ticketNote>

// ---------------------------------------------------------------------------
// ticket_status_history — histórico de transições de status (APPEND-ONLY)
// docs/20-domain/06-ticket.md §3 + §6
// docs/30-contracts/02-db-schema-conventions.md §8
//
// Trigger na migration bloqueia UPDATE e DELETE nesta tabela.
// INV-TICKET-06: cada transição de status gera linha aqui.
// ---------------------------------------------------------------------------

export const ticketStatusHistory = pgTable(
  'ticket_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      // RESTRICT: preservar histórico mesmo após soft-delete do ticket
      .references(() => ticket.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    fromStatus: ticketStatusEnum('from_status'),
    toStatus: ticketStatusEnum('to_status').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTicketStatusHistoryTicket: index('idx_ticket_status_history_ticket').on(
      t.ticketId,
      t.createdAt,
    ),
  }),
)

export type TicketStatusHistory = InferSelectModel<typeof ticketStatusHistory>
export type NewTicketStatusHistory = InferInsertModel<typeof ticketStatusHistory>

// ---------------------------------------------------------------------------
// ticket_assignment_history — histórico de atribuições (APPEND-ONLY)
// docs/20-domain/06-ticket.md §3
// docs/30-contracts/02-db-schema-conventions.md §6
//
// Trigger na migration bloqueia UPDATE e DELETE nesta tabela.
// INV-TICKET-06: cada mudança de responsável gera linha aqui.
// ---------------------------------------------------------------------------

export const ticketAssignmentHistory = pgTable(
  'ticket_assignment_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      // RESTRICT: preservar histórico mesmo após soft-delete do ticket
      .references(() => ticket.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    fromUserId: uuid('from_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    toUserId: uuid('to_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    assignedByUserId: uuid('assigned_by_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxTicketAssignmentHistoryTicket: index('idx_ticket_assignment_history_ticket').on(
      t.ticketId,
      t.createdAt,
    ),
  }),
)

export type TicketAssignmentHistory = InferSelectModel<typeof ticketAssignmentHistory>
export type NewTicketAssignmentHistory = InferInsertModel<typeof ticketAssignmentHistory>
