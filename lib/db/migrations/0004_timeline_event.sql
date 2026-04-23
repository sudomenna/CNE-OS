-- Migration: 0004_timeline_event
-- Task: T-0-11
-- Tables: timeline_event
-- Spec: docs/20-domain/04-timeline.md §3
--
-- Presupposes:
--   0001_organization_brand_legal_entity.sql  → brand table
--   0002_user_account_role_user_role.sql      → user_account table
--
-- NOTE: timeline_event is append-only (INV-TIMELINE-01).
--       No updated_at, no deleted_at, no set_updated_at trigger.

-- ---------------------------------------------------------------------------
-- timeline_event
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "timeline_event" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK para contact será adicionada em Sprint 1 (T-1-xx)
  -- contact table does not exist in Sprint 0; no FK constraint here.
  "contact_id"     uuid        NOT NULL,

  "brand_id"       uuid        REFERENCES "brand"("id")        ON DELETE SET NULL  ON UPDATE CASCADE,
  "kind"           text        NOT NULL,
  "source"         text        NOT NULL,
  "actor_user_id"  uuid        REFERENCES "user_account"("id") ON DELETE SET NULL  ON UPDATE CASCADE,
  "actor_system"   text,
  "subject_kind"   text,
  "subject_id"     uuid,
  "payload"        jsonb       NOT NULL DEFAULT '{}'::jsonb,
  "occurred_at"    timestamptz NOT NULL DEFAULT now(),
  "created_at"     timestamptz NOT NULL DEFAULT now(),

  -- INV-TIMELINE-02: exactly one actor must be present
  CONSTRAINT "ck_timeline_actor_present"
    CHECK ("actor_user_id" IS NOT NULL OR "actor_system" IS NOT NULL),

  -- INV-TIMELINE-03: kind must be snake_case
  CONSTRAINT "ck_timeline_kind_snake"
    CHECK ("kind" ~ '^[a-z][a-z0-9_]*$')
);

-- ---------------------------------------------------------------------------
-- Indexes
-- docs/20-domain/04-timeline.md §3.2
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_timeline_contact_time"
  ON "timeline_event" ("contact_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_timeline_brand"
  ON "timeline_event" ("brand_id");

CREATE INDEX IF NOT EXISTS "idx_timeline_kind"
  ON "timeline_event" ("kind");

CREATE INDEX IF NOT EXISTS "idx_timeline_subject"
  ON "timeline_event" ("subject_kind", "subject_id");

CREATE INDEX IF NOT EXISTS "idx_timeline_payload_gin"
  ON "timeline_event" USING GIN ("payload");

-- ---------------------------------------------------------------------------
-- Append-only triggers (INV-TIMELINE-01)
-- docs/20-domain/04-timeline.md §3.2
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION timeline_event_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'timeline_event is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_timeline_event_no_update
  BEFORE UPDATE ON "timeline_event"
  FOR EACH ROW EXECUTE FUNCTION timeline_event_append_only();

CREATE TRIGGER trg_timeline_event_no_delete
  BEFORE DELETE ON "timeline_event"
  FOR EACH ROW EXECUTE FUNCTION timeline_event_append_only();
