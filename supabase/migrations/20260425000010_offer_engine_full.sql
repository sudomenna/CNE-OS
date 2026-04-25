-- Migration: 20260425000010_offer_engine_full
-- Sprint: 6-7 — Offer Engine
-- Consolidates: catalog schema (T-6-01..04) + offer schema (T-6-05..12) + triggers
-- Tasks: T-6-01 through T-6-22 (schema layer)

-- ---------------------------------------------------------------------------
-- ENUMs
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."product_kind" AS ENUM('course','ebook','training_online','training_in_person','mentoring','bonus','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."offer_status" AS ENUM('draft','active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."offer_condition_status" AS ENUM('draft','active','paused','archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."offer_condition_item_kind" AS ENUM('main','bonus','upsell','order_bump','complement','commercial_benefit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."offer_payment_method" AS ENUM('pix','credit_card','installments','boleto','custom');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."offer_rule_kind" AS ENUM('date_range','sales_count_reached','campaign','channel','creative','internal_use');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."offer_rule_operator" AS ENUM('and','or');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- MOD-CATALOG: product_category, product, commercial_benefit
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "product_category" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id"   uuid        NOT NULL,
  "name"       text        NOT NULL,
  "slug"       text        NOT NULL,
  "parent_id"  uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "product_category"
    ADD CONSTRAINT "product_category_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product_category"
    ADD CONSTRAINT "product_category_parent_id_product_category_id_fk"
    FOREIGN KEY ("parent_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "product" (
  "id"          uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id"    uuid           NOT NULL,
  "category_id" uuid,
  "name"        text           NOT NULL,
  "slug"        text           NOT NULL,
  "kind"        "product_kind" NOT NULL DEFAULT 'other',
  "description" text,
  "metadata"    jsonb          NOT NULL DEFAULT '{}',
  "status"      text           NOT NULL DEFAULT 'active',
  "created_at"  timestamptz    NOT NULL DEFAULT now(),
  "updated_at"  timestamptz    NOT NULL DEFAULT now(),
  "deleted_at"  timestamptz,
  CONSTRAINT "ck_product_slug_kebab" CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT "ck_product_status"     CHECK ("status" IN ('active','archived'))
);

DO $$ BEGIN
  ALTER TABLE "product"
    ADD CONSTRAINT "product_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "product"
    ADD CONSTRAINT "product_category_id_product_category_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "product_category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "commercial_benefit" (
  "id"                          uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id"                    uuid        NOT NULL,
  "name"                        text        NOT NULL,
  "slug"                        text        NOT NULL,
  "description"                 text,
  "auto_tag"                    text,
  "default_duration_months"     integer,
  "default_responsible_user_id" uuid,
  "delivery_status_required"    boolean     NOT NULL DEFAULT false,
  "status"                      text        NOT NULL DEFAULT 'active',
  "created_at"                  timestamptz NOT NULL DEFAULT now(),
  "updated_at"                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ck_commercial_benefit_status" CHECK ("status" IN ('active','archived'))
);

DO $$ BEGIN
  ALTER TABLE "commercial_benefit"
    ADD CONSTRAINT "commercial_benefit_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "commercial_benefit"
    ADD CONSTRAINT "commercial_benefit_default_responsible_user_id_user_account_id_fk"
    FOREIGN KEY ("default_responsible_user_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_category_brand_slug" ON "product_category" ("brand_id","slug");
CREATE INDEX        IF NOT EXISTS "idx_product_category_brand"      ON "product_category" ("brand_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_product_brand_slug"           ON "product"          ("brand_id","slug");
CREATE INDEX        IF NOT EXISTS "idx_product_brand"               ON "product"          ("brand_id");
CREATE INDEX        IF NOT EXISTS "idx_product_kind"                ON "product"          ("kind");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_commercial_benefit_brand_slug" ON "commercial_benefit" ("brand_id","slug");
CREATE INDEX        IF NOT EXISTS "idx_commercial_benefit_brand"    ON "commercial_benefit" ("brand_id");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer" (
  "id"                      uuid          PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id"                uuid          NOT NULL,
  "issuing_legal_entity_id" uuid          NOT NULL,
  "name"                    text          NOT NULL,
  "slug"                    text          NOT NULL,
  "description"             text,
  "type"                    text          NOT NULL DEFAULT 'regular',
  "renews_offer_id"         uuid,
  "status"                  "offer_status" NOT NULL DEFAULT 'draft',
  "created_at"              timestamptz   NOT NULL DEFAULT now(),
  "updated_at"              timestamptz   NOT NULL DEFAULT now(),
  "created_by"              uuid,
  CONSTRAINT "ck_offer_slug_kebab"           CHECK ("slug" ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT "ck_offer_type"                 CHECK ("type" IN ('regular','renewal')),
  CONSTRAINT "ck_offer_renewal_requires_ref" CHECK (
    ("type" = 'regular' AND "renews_offer_id" IS NULL)
    OR ("type" = 'renewal' AND "renews_offer_id" IS NOT NULL)
  )
);

DO $$ BEGIN
  ALTER TABLE "offer"
    ADD CONSTRAINT "offer_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer"
    ADD CONSTRAINT "offer_issuing_legal_entity_id_legal_entity_id_fk"
    FOREIGN KEY ("issuing_legal_entity_id") REFERENCES "legal_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer"
    ADD CONSTRAINT "offer_renews_offer_id_offer_id_fk"
    FOREIGN KEY ("renews_offer_id") REFERENCES "offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer"
    ADD CONSTRAINT "offer_created_by_user_account_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_offer_brand_slug"     ON "offer" ("brand_id","slug");
CREATE INDEX        IF NOT EXISTS "idx_offer_renews_offer_id" ON "offer" ("renews_offer_id");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_condition
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_condition" (
  "id"              uuid                     PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offer_id"        uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "description"     text,
  "priority"        integer                  NOT NULL DEFAULT 0,
  "advantage_score" numeric(8,2)             NOT NULL DEFAULT 0,
  "status"          "offer_condition_status" NOT NULL DEFAULT 'draft',
  "is_public"       boolean                  NOT NULL DEFAULT true,
  "is_default"      boolean                  NOT NULL DEFAULT false,
  "created_at"      timestamptz              NOT NULL DEFAULT now(),
  "updated_at"      timestamptz              NOT NULL DEFAULT now(),
  "created_by"      uuid,
  "deleted_at"      timestamptz,
  CONSTRAINT "ck_offer_condition_priority_range" CHECK ("priority" BETWEEN -1000 AND 1000)
);

DO $$ BEGIN
  ALTER TABLE "offer_condition"
    ADD CONSTRAINT "offer_condition_offer_id_offer_id_fk"
    FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer_condition"
    ADD CONSTRAINT "offer_condition_created_by_user_account_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_offer_condition_default_per_offer"
  ON "offer_condition" ("offer_id")
  WHERE is_default = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS "idx_offer_condition_offer" ON "offer_condition" ("offer_id");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_condition_rule_group
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_condition_rule_group" (
  "id"                 uuid                 PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offer_condition_id" uuid                 NOT NULL,
  "parent_group_id"    uuid,
  "operator"           "offer_rule_operator" NOT NULL DEFAULT 'and',
  "created_at"         timestamptz          NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "offer_condition_rule_group"
    ADD CONSTRAINT "offer_condition_rule_group_offer_condition_id_offer_condition_id_fk"
    FOREIGN KEY ("offer_condition_id") REFERENCES "offer_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer_condition_rule_group"
    ADD CONSTRAINT "offer_condition_rule_group_parent_group_id_offer_condition_rule_group_id_fk"
    FOREIGN KEY ("parent_group_id") REFERENCES "offer_condition_rule_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_offer_rule_group_root"
  ON "offer_condition_rule_group" ("offer_condition_id")
  WHERE parent_group_id IS NULL;
CREATE INDEX IF NOT EXISTS "idx_offer_condition_rule_group_condition" ON "offer_condition_rule_group" ("offer_condition_id");
CREATE INDEX IF NOT EXISTS "idx_offer_condition_rule_group_parent"    ON "offer_condition_rule_group" ("parent_group_id");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_condition_rule
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_condition_rule" (
  "id"            uuid             PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "rule_group_id" uuid             NOT NULL,
  "kind"          "offer_rule_kind" NOT NULL,
  "params"        jsonb            NOT NULL DEFAULT '{}',
  "created_at"    timestamptz      NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "offer_condition_rule"
    ADD CONSTRAINT "offer_condition_rule_rule_group_id_offer_condition_rule_group_id_fk"
    FOREIGN KEY ("rule_group_id") REFERENCES "offer_condition_rule_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_offer_condition_rule_group" ON "offer_condition_rule" ("rule_group_id");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_condition_item
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_condition_item" (
  "id"                    uuid                       PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offer_condition_id"    uuid                       NOT NULL,
  "kind"                  "offer_condition_item_kind" NOT NULL,
  "product_id"            uuid,
  "commercial_benefit_id" uuid,
  "quantity"              integer                    NOT NULL DEFAULT 1,
  "access_rule"           jsonb                      NOT NULL DEFAULT '{}',
  "vigency_months"        integer,
  "discount"              numeric(12,2),
  "responsible_user_id"   uuid,
  "order_index"           integer                    NOT NULL DEFAULT 0,
  "created_at"            timestamptz                NOT NULL DEFAULT now(),
  "updated_at"            timestamptz                NOT NULL DEFAULT now(),
  CONSTRAINT "ck_offer_condition_item_ref_exclusive" CHECK (
    ("product_id" IS NOT NULL AND "commercial_benefit_id" IS NULL AND "kind" <> 'commercial_benefit')
    OR
    ("product_id" IS NULL AND "commercial_benefit_id" IS NOT NULL AND "kind" = 'commercial_benefit')
  ),
  CONSTRAINT "ck_offer_condition_item_quantity" CHECK ("quantity" > 0)
);

DO $$ BEGIN
  ALTER TABLE "offer_condition_item"
    ADD CONSTRAINT "offer_condition_item_offer_condition_id_offer_condition_id_fk"
    FOREIGN KEY ("offer_condition_id") REFERENCES "offer_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer_condition_item"
    ADD CONSTRAINT "offer_condition_item_product_id_product_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer_condition_item"
    ADD CONSTRAINT "offer_condition_item_commercial_benefit_id_commercial_benefit_id_fk"
    FOREIGN KEY ("commercial_benefit_id") REFERENCES "commercial_benefit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer_condition_item"
    ADD CONSTRAINT "offer_condition_item_responsible_user_id_user_account_id_fk"
    FOREIGN KEY ("responsible_user_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_offer_condition_item_condition" ON "offer_condition_item" ("offer_condition_id");
CREATE INDEX IF NOT EXISTS "idx_offer_condition_item_product"   ON "offer_condition_item" ("product_id");
CREATE INDEX IF NOT EXISTS "idx_offer_condition_item_benefit"   ON "offer_condition_item" ("commercial_benefit_id");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_payment_option
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_payment_option" (
  "id"                 uuid                   PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offer_condition_id" uuid                   NOT NULL,
  "method"             "offer_payment_method"  NOT NULL,
  "price"              numeric(12,2)          NOT NULL,
  "installments"       integer,
  "custom_config"      jsonb                  NOT NULL DEFAULT '{}',
  "is_active"          boolean                NOT NULL DEFAULT true,
  "created_at"         timestamptz            NOT NULL DEFAULT now(),
  "updated_at"         timestamptz            NOT NULL DEFAULT now(),
  CONSTRAINT "ck_offer_payment_option_price"  CHECK ("price" >= 0),
  CONSTRAINT "ck_offer_payment_installments"  CHECK ("method" <> 'installments' OR "installments" > 1)
);

DO $$ BEGIN
  ALTER TABLE "offer_payment_option"
    ADD CONSTRAINT "offer_payment_option_offer_condition_id_offer_condition_id_fk"
    FOREIGN KEY ("offer_condition_id") REFERENCES "offer_condition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_offer_payment_option_condition" ON "offer_payment_option" ("offer_condition_id");
CREATE INDEX IF NOT EXISTS "idx_offer_payment_option_method"    ON "offer_payment_option" ("method");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_sales_counter (T-6-11)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_sales_counter" (
  "offer_id"       uuid        PRIMARY KEY NOT NULL,
  "approved_count" bigint      NOT NULL DEFAULT 0,
  "updated_at"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "ck_offer_sales_counter_approved_count_non_negative" CHECK ("approved_count" >= 0)
);

DO $$ BEGIN
  ALTER TABLE "offer_sales_counter"
    ADD CONSTRAINT "offer_sales_counter_offer_id_offer_id_fk"
    FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_status_history (append-only, T-6-12)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_status_history" (
  "id"                 uuid          PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offer_id"           uuid          NOT NULL,
  "from_status"        "offer_status",
  "to_status"          "offer_status" NOT NULL,
  "changed_by_user_id" uuid,
  "reason"             text,
  "created_at"         timestamptz   NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "offer_status_history"
    ADD CONSTRAINT "offer_status_history_offer_id_offer_id_fk"
    FOREIGN KEY ("offer_id") REFERENCES "offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer_status_history"
    ADD CONSTRAINT "offer_status_history_changed_by_user_id_user_account_id_fk"
    FOREIGN KEY ("changed_by_user_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_offer_status_history_offer"
  ON "offer_status_history" ("offer_id","created_at");

-- ---------------------------------------------------------------------------
-- MOD-OFFER: offer_condition_priority_history (append-only, T-6-12)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "offer_condition_priority_history" (
  "id"                   uuid         PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "offer_condition_id"   uuid         NOT NULL,
  "from_priority"        integer,
  "to_priority"          integer      NOT NULL,
  "from_advantage_score" numeric(8,2),
  "to_advantage_score"   numeric(8,2) NOT NULL,
  "changed_by_user_id"   uuid,
  "reason"               text,
  "created_at"           timestamptz  NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "offer_condition_priority_history"
    ADD CONSTRAINT "offer_condition_priority_history_offer_condition_id_offer_condition_id_fk"
    FOREIGN KEY ("offer_condition_id") REFERENCES "offer_condition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "offer_condition_priority_history"
    ADD CONSTRAINT "offer_condition_priority_history_changed_by_user_id_user_account_id_fk"
    FOREIGN KEY ("changed_by_user_id") REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "idx_offer_condition_priority_history_condition"
  ON "offer_condition_priority_history" ("offer_condition_id","created_at");

-- ---------------------------------------------------------------------------
-- Trigger: seed offer_sales_counter on offer INSERT (T-6-11, INV-OFFER-09)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_offer_sales_counter()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "offer_sales_counter" ("offer_id","approved_count","updated_at")
  VALUES (NEW.id, 0, now())
  ON CONFLICT ("offer_id") DO NOTHING;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offer_seed_sales_counter ON "offer";
CREATE TRIGGER offer_seed_sales_counter
  AFTER INSERT ON "offer"
  FOR EACH ROW
  EXECUTE FUNCTION seed_offer_sales_counter();

-- ---------------------------------------------------------------------------
-- Triggers: append-only guards (T-6-12, INV-OFFER-02)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_offer_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'offer_status_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offer_status_history_append_only ON "offer_status_history";
CREATE TRIGGER offer_status_history_append_only
  BEFORE UPDATE OR DELETE ON "offer_status_history"
  FOR EACH ROW EXECUTE FUNCTION reject_offer_status_history_mutation();

CREATE OR REPLACE FUNCTION reject_offer_condition_priority_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'offer_condition_priority_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offer_condition_priority_history_append_only ON "offer_condition_priority_history";
CREATE TRIGGER offer_condition_priority_history_append_only
  BEFORE UPDATE OR DELETE ON "offer_condition_priority_history"
  FOR EACH ROW EXECUTE FUNCTION reject_offer_condition_priority_history_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: legal entity immutability guard (T-6-22, INV-OFFER-03)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION check_offer_legal_entity_immutable()
RETURNS TRIGGER AS $$
DECLARE
  transaction_table_exists  boolean;
  has_blocking_transactions boolean;
BEGIN
  IF NEW.issuing_legal_entity_id IS NOT DISTINCT FROM OLD.issuing_legal_entity_id THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'transaction'
  ) INTO transaction_table_exists;

  IF NOT transaction_table_exists THEN
    RETURN NEW;
  END IF;

  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I WHERE offer_id = $1 AND status IN (''approved'',''pending''))',
    'transaction'
  ) USING OLD.id INTO has_blocking_transactions;

  IF has_blocking_transactions THEN
    RAISE EXCEPTION
      'INV-OFFER-03: cannot change issuing_legal_entity_id on offer % — '
      'at least one transaction with status approved or pending exists.',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS offer_legal_entity_immutable_guard ON "offer";
CREATE TRIGGER offer_legal_entity_immutable_guard
  BEFORE UPDATE OF issuing_legal_entity_id ON "offer"
  FOR EACH ROW EXECUTE FUNCTION check_offer_legal_entity_immutable();
