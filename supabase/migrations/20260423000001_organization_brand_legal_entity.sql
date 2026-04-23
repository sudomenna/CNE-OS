-- Migration: 0001_organization_brand_legal_entity
-- Task: T-0-05
-- Tables: brand, legal_entity, brand_legal_entity
-- Note: drizzle-kit generate was unavailable due to version mismatch between
--       drizzle-kit 0.27.2 (expects drizzle-orm ~0.36+) and drizzle-orm 0.35.3.
--       SQL written manually and validated against the Drizzle schema in
--       lib/db/schema/organization.ts. See MEMORY.md §1 for the stack blocker entry.

-- ---------------------------------------------------------------------------
-- brand
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "brand" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name"          text NOT NULL,
  "slug"          text NOT NULL,
  "logo_url"      text,
  "primary_color" text,
  "created_at"    timestamptz NOT NULL DEFAULT now(),
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  "deleted_at"    timestamptz,
  CONSTRAINT "uq_brand_name"       UNIQUE ("name"),
  CONSTRAINT "uq_brand_slug"       UNIQUE ("slug"),
  CONSTRAINT "ck_brand_slug_kebab" CHECK  ("slug" ~ '^[a-z0-9][a-z0-9-]*$')
);

-- ---------------------------------------------------------------------------
-- legal_entity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "legal_entity" (
  "id"           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "cnpj"         varchar(14) NOT NULL,
  "company_name" text        NOT NULL,
  "trade_name"   text,
  "tax_regime"   text,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_legal_entity_cnpj"        UNIQUE ("cnpj"),
  CONSTRAINT "ck_legal_entity_cnpj_length" CHECK  (char_length("cnpj") = 14 AND "cnpj" ~ '^[0-9]{14}$')
);

-- ---------------------------------------------------------------------------
-- brand_legal_entity
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "brand_legal_entity" (
  "brand_id"        uuid        NOT NULL REFERENCES "brand"("id")         ON DELETE RESTRICT ON UPDATE CASCADE,
  "legal_entity_id" uuid        NOT NULL REFERENCES "legal_entity"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  "is_default"      boolean     NOT NULL DEFAULT false,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "brand_legal_entity_pkey" PRIMARY KEY ("brand_id", "legal_entity_id")
);

-- Partial unique index: at most one is_default = true per brand (INV-ORG-03)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_brand_legal_entity_default"
  ON "brand_legal_entity" ("brand_id")
  WHERE "is_default" = true;

-- Non-unique index for FK lookup on legal_entity_id
CREATE INDEX IF NOT EXISTS "idx_brand_legal_entity_legal_entity_id"
  ON "brand_legal_entity" ("legal_entity_id");

-- ---------------------------------------------------------------------------
-- Trigger: set_updated_at — keeps updated_at current on every UPDATE
-- Applied to: brand, legal_entity
-- docs/30-contracts/02-db-schema-conventions.md §3
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_brand_updated_at
  BEFORE UPDATE ON "brand"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_legal_entity_updated_at
  BEFORE UPDATE ON "legal_entity"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
