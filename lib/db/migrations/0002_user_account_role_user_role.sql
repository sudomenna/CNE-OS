-- Migration: 0002_user_account_role_user_role
-- Task: T-0-06
-- Tables: user_account, role, user_role
-- Enum: role_kind
-- SQL written manually (drizzle-kit generate not used in parallel onda — see MEMORY.md §1)

-- ---------------------------------------------------------------------------
-- Enum: role_kind
-- docs/30-contracts/01-enums.md
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "role_kind" AS ENUM ('admin', 'financial', 'marketing', 'support', 'commercial');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- user_account
-- docs/20-domain/01-organization.md §3.4
-- id mirrors auth.users.id — no DEFAULT (caller supplies the Supabase Auth UUID)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "user_account" (
  "id"            uuid        PRIMARY KEY,
  "email"         text        NOT NULL,
  "full_name"     text        NOT NULL,
  "phone"         text,
  "is_active"     boolean     NOT NULL DEFAULT true,
  "totp_enabled"  boolean     NOT NULL DEFAULT false,
  "last_login_at" timestamptz,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  "deleted_at"    timestamptz,
  CONSTRAINT "uq_user_account_email" UNIQUE ("email")
);

-- ---------------------------------------------------------------------------
-- role  (fixed catalogue)
-- docs/20-domain/01-organization.md §3.5
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "role" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind"        role_kind   NOT NULL,
  "description" text,
  CONSTRAINT "uq_role_kind" UNIQUE ("kind")
);

-- ---------------------------------------------------------------------------
-- user_role  (many-to-many join table)
-- docs/20-domain/01-organization.md §3.6
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "user_role" (
  "user_id"    uuid        NOT NULL
                           REFERENCES "user_account"("id") ON DELETE CASCADE,
  "role_id"    uuid        NOT NULL
                           REFERENCES "role"("id")         ON DELETE RESTRICT,
  "granted_by" uuid
                           REFERENCES "user_account"("id") ON DELETE SET NULL,
  "granted_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_role_pkey" PRIMARY KEY ("user_id", "role_id")
);

-- Index: fast lookup of all roles for a given user
CREATE INDEX IF NOT EXISTS "idx_user_role_user"
  ON "user_role" ("user_id");

-- ---------------------------------------------------------------------------
-- Trigger: set_updated_at — keeps updated_at current on every UPDATE
-- Applied to: user_account
-- The function is idempotent (CREATE OR REPLACE) — safe to repeat across migrations
-- docs/30-contracts/02-db-schema-conventions.md §3
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER set_user_account_updated_at
  BEFORE UPDATE ON "user_account"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
