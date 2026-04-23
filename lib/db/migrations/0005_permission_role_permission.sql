-- Migration: 0005_permission_role_permission
-- Task: T-0-07
-- Tables: permission, role_permission
-- Assumes: role table already exists (created in 0002_user_account_role_user_role.sql)
-- SQL written manually — drizzle-kit generate not used per task instructions

-- ---------------------------------------------------------------------------
-- permission
-- docs/50-business-rules/BR-RBAC.md
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "permission" (
  "id"           uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  "action"       text    NOT NULL,
  "requires_2fa" boolean NOT NULL DEFAULT false,
  CONSTRAINT "uq_permission_action" UNIQUE ("action")
);

-- ---------------------------------------------------------------------------
-- role_permission  (N×N join — role ↔ permission)
-- docs/50-business-rules/BR-RBAC.md §Fase 1
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "role_permission" (
  "role_id"       uuid NOT NULL
                       REFERENCES "role"("id")       ON DELETE RESTRICT ON UPDATE CASCADE,
  "permission_id" uuid NOT NULL
                       REFERENCES "permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id", "permission_id")
);

-- Index: fast lookup of all permissions for a given role (BR-RBAC)
CREATE INDEX IF NOT EXISTS "idx_role_permission_role"
  ON "role_permission" ("role_id");
