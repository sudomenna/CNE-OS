-- Migration: 0006_webhook_log
-- Task: T-0-12
-- Table: webhook_log
-- Spec: docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
--
-- Standalone migration — no foreign key dependencies.
--
-- NOTE: webhook_log is NOT append-only; status is updated during processing.
--       No updated_at, no deleted_at, no set_updated_at trigger.
--       Domain timestamps: received_at, processed_at, dead_lettered_at.

-- ---------------------------------------------------------------------------
-- Enum: integration_provider
-- docs/30-contracts/01-enums.md
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "integration_provider" AS ENUM (
    'digital_guru',
    'brevo',
    'whatsapp_official',
    'notazz',
    'analytics'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Enum: webhook_status
-- docs/30-contracts/01-enums.md
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "webhook_status" AS ENUM (
    'received',
    'processed',
    'failed',
    'dead_letter'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- webhook_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "webhook_log" (
  "id"                uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider"          integration_provider NOT NULL,
  "external_event_id" text            NOT NULL,
  "event_kind"        text,
  "payload"           jsonb           NOT NULL,
  "status"            webhook_status  NOT NULL DEFAULT 'received',
  "attempts"          integer         NOT NULL DEFAULT 0,
  "last_error"        text,
  "received_at"       timestamptz     NOT NULL DEFAULT now(),
  "processed_at"      timestamptz,
  "dead_lettered_at"  timestamptz,

  -- BR-INTEGRATION-IDEMPOTENCY: central idempotency constraint
  -- prevents a duplicate event from the same provider being processed twice
  CONSTRAINT "uq_webhook_event" UNIQUE ("provider", "external_event_id")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_webhook_status"
  ON "webhook_log" ("status");

CREATE INDEX IF NOT EXISTS "idx_webhook_provider_received"
  ON "webhook_log" ("provider", "received_at" DESC);
