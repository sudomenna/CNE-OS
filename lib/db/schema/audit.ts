/**
 * MOD-AUDIT — Audit log schema (T-0-10)
 *
 * Table: audit_log (append-only — no updated_at, no deleted_at)
 *
 * Specs:
 *   docs/50-business-rules/BR-AUDIT.md
 *   docs/30-contracts/02-db-schema-conventions.md §4, §6
 *   docs/30-contracts/01-enums.md (audit_action_kind)
 */
import { check, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { userAccount } from './organization'

// ---------------------------------------------------------------------------
// Enum: audit_action_kind
// docs/30-contracts/01-enums.md
// ---------------------------------------------------------------------------

export const auditActionKindEnum = pgEnum('audit_action_kind', [
  'create',
  'update',
  'delete',
  'merge',
  'unmerge',
  'refund',
  'status_change',
  'impersonate',
  'other',
])

export type AuditActionKind = (typeof auditActionKindEnum.enumValues)[number]

// ---------------------------------------------------------------------------
// audit_log
//
// Append-only: no updated_at, no deleted_at.
// docs/30-contracts/02-db-schema-conventions.md §4:
//   "Não aplicar a tabelas append-only (audit, webhook_log, transaction_snapshot)"
// Trigger t_audit_log_append_only enforces immutability at DB level (see migration 0003).
// ---------------------------------------------------------------------------

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

    // Actor: either a user or a system identifier must be present (ck_audit_actor).
    // SET NULL if user is deleted so historical entries are preserved.
    // docs/30-contracts/02-db-schema-conventions.md §14
    actorUserId: uuid('actor_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // System actor identifier (e.g. 'digital_guru', 'inngest-worker')
    actorSystem: text('actor_system'),

    // BR-AUDIT: action classification
    actionKind: auditActionKindEnum('action_kind').notNull(),

    // Target resource (table name + PK)
    resourceKind: text('resource_kind').notNull(),
    resourceId: uuid('resource_id'),

    // State snapshots (immutable after insert)
    before: jsonb('before').notNull().default(sql`'{}'::jsonb`),
    after: jsonb('after').notNull().default(sql`'{}'::jsonb`),

    // Request metadata
    ip: text('ip'),
    userAgent: text('user_agent'),

    // Arbitrary structured context (e.g. request_id, session_id)
    context: jsonb('context').notNull().default(sql`'{}'::jsonb`),

    // Append-only: only created_at — never updated_at or deleted_at
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // BR-AUDIT: actor must be a user OR a system identifier — never neither
    ckAuditActor: check(
      'ck_audit_actor',
      sql`${t.actorUserId} IS NOT NULL OR ${t.actorSystem} IS NOT NULL`,
    ),

    // Composite index for resource lookups (most common query pattern)
    idxAuditResource: index('idx_audit_resource').on(t.resourceKind, t.resourceId),
    // Index for actor-centric queries (e.g. "what did user X do?")
    idxAuditActor: index('idx_audit_actor').on(t.actorUserId),
    // Index for time-range queries (DESC — most recent first)
    idxAuditTime: index('idx_audit_time').on(t.createdAt),
  }),
)

export type AuditLog = InferSelectModel<typeof auditLog>
export type NewAuditLog = InferInsertModel<typeof auditLog>

/**
 * AuditEntry — the shape consumed by the domain layer to insert a new audit record.
 * Matches BR-AUDIT.md §contrato TS exactly.
 */
export type AuditEntry = {
  actorUserId?: string | null
  actorSystem?: string | null
  actionKind: AuditActionKind
  resourceKind: string
  resourceId?: string | null
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  ip?: string | null
  userAgent?: string | null
  context?: Record<string, unknown>
}
