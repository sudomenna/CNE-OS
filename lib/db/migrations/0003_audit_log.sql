-- Migration: 0003_audit_log
-- Task: T-0-10
-- Tables: audit_log (append-only)
-- Depends on: 0002_user_account_role_user_role (user_account table must exist)
-- Spec: docs/50-business-rules/BR-AUDIT.md
--       docs/30-contracts/02-db-schema-conventions.md §4, §6

-- ---------------------------------------------------------------------------
-- Enum: audit_action_kind
-- docs/30-contracts/01-enums.md
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE audit_action_kind AS ENUM (
    'create',
    'update',
    'delete',
    'merge',
    'unmerge',
    'refund',
    'status_change',
    'impersonate',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- audit_log
--
-- Append-only table: no updated_at, no deleted_at.
-- docs/30-contracts/02-db-schema-conventions.md §4:
--   "Não aplicar a tabelas append-only (audit, webhook_log, transaction_snapshot)"
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "audit_log" (
  "id"            uuid                PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Actor: user or system — at least one must be non-null (ck_audit_actor below)
  -- SET NULL on user deletion to preserve historical entries without dangling FKs
  "actor_user_id" uuid                NULL REFERENCES "user_account"("id")
                                        ON DELETE SET NULL ON UPDATE CASCADE,
  "actor_system"  text                NULL,

  "action_kind"   audit_action_kind   NOT NULL,
  "resource_kind" text                NOT NULL,
  "resource_id"   uuid                NULL,

  -- State snapshots — immutable after insert (enforced by trigger below)
  "before"        jsonb               NOT NULL DEFAULT '{}',
  "after"         jsonb               NOT NULL DEFAULT '{}',

  -- Request metadata
  "ip"            text                NULL,
  "user_agent"    text                NULL,

  -- Arbitrary structured context (request_id, session_id, etc.)
  "context"       jsonb               NOT NULL DEFAULT '{}',

  -- Append-only: only created_at, never updated_at or deleted_at
  "created_at"    timestamptz         NOT NULL DEFAULT now(),

  -- BR-AUDIT: actor must be identified (user XOR system, or both; never neither)
  CONSTRAINT "ck_audit_actor" CHECK (
    "actor_user_id" IS NOT NULL OR "actor_system" IS NOT NULL
  )
);

-- ---------------------------------------------------------------------------
-- Indexes
-- docs/50-business-rules/BR-AUDIT.md
-- ---------------------------------------------------------------------------

-- Composite index: resource_kind + resource_id (most common query pattern)
CREATE INDEX IF NOT EXISTS "idx_audit_resource"
  ON "audit_log" ("resource_kind", "resource_id");

-- Actor-centric queries ("what did user X do?")
CREATE INDEX IF NOT EXISTS "idx_audit_actor"
  ON "audit_log" ("actor_user_id");

-- Time-range queries, most recent first
CREATE INDEX IF NOT EXISTS "idx_audit_time"
  ON "audit_log" ("created_at" DESC);

-- ---------------------------------------------------------------------------
-- Append-only trigger
--
-- Blocks any UPDATE or DELETE on audit_log at the DB level.
-- docs/30-contracts/02-db-schema-conventions.md §6
-- docs/30-contracts/06-audit-trail-spec.md
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION audit_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (TG_OP=%)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER t_audit_log_append_only
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_append_only();
