-- Migration: 20260425000009
-- Sprint 5: schema MOD-CAMPAIGN + MOD-FUNNEL + triggers append-only
-- Combina criação de tabelas (0003-0005 Drizzle) com triggers (T-5-09)
-- Aplicado via supabase db push porque drizzle-kit 0.31.10 tem bug
-- em db:push ao processar CHECK constraints existentes no DB.

-- ---------------------------------------------------------------------------
-- Enums novos
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE "public"."funnel_opportunity_label"
    AS ENUM('open', 'negotiating', 'concluded', 'won', 'lost', 'reopened');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Adiciona valores ao integration_provider somente se ainda não existirem
DO $$ BEGIN
  ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'instagram' BEFORE 'notazz';
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "public"."integration_provider" ADD VALUE IF NOT EXISTS 'email' BEFORE 'notazz';
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- MOD-FUNNEL — tabelas base
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "funnel" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL,
  "offer_id" uuid,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "funnel_stage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "position" integer NOT NULL,
  "is_terminal" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- MOD-CAMPAIGN — tabelas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "campaign" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL,
  "funnel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "creative" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "channel" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "creative_asset" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "creative_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "url" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "content_library_item" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "url" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "trackable_link" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL,
  "funnel_id" uuid,
  "campaign_id" uuid,
  "creative_id" uuid,
  "destination_url" text NOT NULL,
  "slug" text NOT NULL,
  "utm" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- MOD-FUNNEL — entry, history, rules, targets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "funnel_entry" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL,
  "contact_id" uuid NOT NULL,
  "current_stage_id" uuid NOT NULL,
  "owner_user_id" uuid,
  "label" "funnel_opportunity_label" DEFAULT 'open' NOT NULL,
  "score" numeric(10, 2) DEFAULT '0' NOT NULL,
  "entry_date" timestamp with time zone DEFAULT now() NOT NULL,
  "entry_origin" text,
  "entry_campaign_id" uuid,
  "entry_creative_id" uuid,
  "conversion_origin" text,
  "conversion_campaign_id" uuid,
  "conversion_creative_id" uuid,
  "transaction_id" uuid,
  "lost_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "funnel_entry_score_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_entry_id" uuid NOT NULL,
  "from_score" numeric(10, 2),
  "to_score" numeric(10, 2) NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "funnel_entry_stage_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_entry_id" uuid NOT NULL,
  "from_stage_id" uuid,
  "to_stage_id" uuid NOT NULL,
  "changed_by" uuid,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "funnel_score_rule" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL,
  "name" text NOT NULL,
  "event_kind" text NOT NULL,
  "delta" numeric(10, 2) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "opportunity_tag" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_entry_id" uuid NOT NULL,
  "tag" text NOT NULL,
  "applied_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "sales_target" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "funnel_id" uuid NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "target_count" integer,
  "target_revenue" numeric(12, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- Foreign Keys (ADD IF NOT EXISTS via DO block)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE "funnel" ADD CONSTRAINT "funnel_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_stage" ADD CONSTRAINT "funnel_stage_funnel_id_funnel_id_fk"
    FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "campaign" ADD CONSTRAINT "campaign_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "campaign" ADD CONSTRAINT "campaign_funnel_id_funnel_id_fk"
    FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "creative" ADD CONSTRAINT "creative_campaign_id_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "creative_asset" ADD CONSTRAINT "creative_asset_creative_id_creative_id_fk"
    FOREIGN KEY ("creative_id") REFERENCES "public"."creative"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "content_library_item" ADD CONSTRAINT "content_library_item_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_brand_id_brand_id_fk"
    FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_funnel_id_funnel_id_fk"
    FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_campaign_id_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_creative_id_creative_id_fk"
    FOREIGN KEY ("creative_id") REFERENCES "public"."creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_funnel_id_funnel_id_fk"
    FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_contact_id_contact_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_current_stage_id_funnel_stage_id_fk"
    FOREIGN KEY ("current_stage_id") REFERENCES "public"."funnel_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_owner_user_id_user_account_id_fk"
    FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_entry_campaign_id_campaign_id_fk"
    FOREIGN KEY ("entry_campaign_id") REFERENCES "public"."campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_entry_creative_id_creative_id_fk"
    FOREIGN KEY ("entry_creative_id") REFERENCES "public"."creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_conversion_campaign_id_campaign_id_fk"
    FOREIGN KEY ("conversion_campaign_id") REFERENCES "public"."campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_conversion_creative_id_creative_id_fk"
    FOREIGN KEY ("conversion_creative_id") REFERENCES "public"."creative"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry_score_history" ADD CONSTRAINT "funnel_entry_score_history_funnel_entry_id_funnel_entry_id_fk"
    FOREIGN KEY ("funnel_entry_id") REFERENCES "public"."funnel_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_funnel_entry_id_funnel_entry_id_fk"
    FOREIGN KEY ("funnel_entry_id") REFERENCES "public"."funnel_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_from_stage_id_funnel_stage_id_fk"
    FOREIGN KEY ("from_stage_id") REFERENCES "public"."funnel_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_to_stage_id_funnel_stage_id_fk"
    FOREIGN KEY ("to_stage_id") REFERENCES "public"."funnel_stage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_changed_by_user_account_id_fk"
    FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "funnel_score_rule" ADD CONSTRAINT "funnel_score_rule_funnel_id_funnel_id_fk"
    FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "opportunity_tag" ADD CONSTRAINT "opportunity_tag_funnel_entry_id_funnel_entry_id_fk"
    FOREIGN KEY ("funnel_entry_id") REFERENCES "public"."funnel_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "opportunity_tag" ADD CONSTRAINT "opportunity_tag_applied_by_user_account_id_fk"
    FOREIGN KEY ("applied_by") REFERENCES "public"."user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "sales_target" ADD CONSTRAINT "sales_target_funnel_id_funnel_id_fk"
    FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_contact_id_contact_id_fk"
    FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes (CREATE INDEX IF NOT EXISTS)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "uq_funnel_slug_brand" ON "funnel" USING btree ("brand_id","slug");
CREATE INDEX IF NOT EXISTS "idx_funnel_brand" ON "funnel" USING btree ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_funnel_offer" ON "funnel" USING btree ("offer_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_funnel_stage_position" ON "funnel_stage" USING btree ("funnel_id","position");
CREATE INDEX IF NOT EXISTS "idx_funnel_stage_funnel" ON "funnel_stage" USING btree ("funnel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_campaign_slug_brand" ON "campaign" USING btree ("brand_id","slug");
CREATE INDEX IF NOT EXISTS "idx_campaign_brand" ON "campaign" USING btree ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_funnel" ON "campaign" USING btree ("funnel_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_is_active" ON "campaign" USING btree ("is_active");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_creative_slug_campaign" ON "creative" USING btree ("campaign_id","slug");
CREATE INDEX IF NOT EXISTS "idx_creative_campaign" ON "creative" USING btree ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_creative_asset_creative" ON "creative_asset" USING btree ("creative_id");
CREATE INDEX IF NOT EXISTS "idx_creative_asset_kind" ON "creative_asset" USING btree ("kind");
CREATE INDEX IF NOT EXISTS "idx_content_library_item_brand" ON "content_library_item" USING btree ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_content_library_item_type" ON "content_library_item" USING btree ("type");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_trackable_link_slug" ON "trackable_link" USING btree ("slug");
CREATE INDEX IF NOT EXISTS "idx_trackable_link_brand" ON "trackable_link" USING btree ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_trackable_link_campaign" ON "trackable_link" USING btree ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_trackable_link_creative" ON "trackable_link" USING btree ("creative_id");
CREATE INDEX IF NOT EXISTS "idx_trackable_link_funnel" ON "trackable_link" USING btree ("funnel_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_funnel_entry_active" ON "funnel_entry" USING btree ("contact_id","funnel_id") WHERE label NOT IN ('won','lost');
CREATE INDEX IF NOT EXISTS "idx_funnel_entry_funnel" ON "funnel_entry" USING btree ("funnel_id");
CREATE INDEX IF NOT EXISTS "idx_funnel_entry_contact" ON "funnel_entry" USING btree ("contact_id");
CREATE INDEX IF NOT EXISTS "idx_funnel_entry_label" ON "funnel_entry" USING btree ("label");
CREATE INDEX IF NOT EXISTS "idx_funnel_entry_owner" ON "funnel_entry" USING btree ("owner_user_id");
CREATE INDEX IF NOT EXISTS "idx_funnel_entry_score_history_entry" ON "funnel_entry_score_history" USING btree ("funnel_entry_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_funnel_entry_stage_history_entry" ON "funnel_entry_stage_history" USING btree ("funnel_entry_id","created_at");
CREATE INDEX IF NOT EXISTS "idx_funnel_score_rule_funnel" ON "funnel_score_rule" USING btree ("funnel_id");
CREATE INDEX IF NOT EXISTS "idx_funnel_score_rule_event_kind" ON "funnel_score_rule" USING btree ("event_kind");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_opportunity_tag" ON "opportunity_tag" USING btree ("funnel_entry_id","tag");
CREATE INDEX IF NOT EXISTS "idx_opportunity_tag_entry" ON "opportunity_tag" USING btree ("funnel_entry_id");
CREATE INDEX IF NOT EXISTS "idx_sales_target_funnel" ON "sales_target" USING btree ("funnel_id");
CREATE INDEX IF NOT EXISTS "idx_sales_target_period" ON "sales_target" USING btree ("period_start","period_end");

-- ---------------------------------------------------------------------------
-- Triggers append-only (T-5-09)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_funnel_entry_stage_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'funnel_entry_stage_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS funnel_entry_stage_history_append_only ON "funnel_entry_stage_history";
CREATE TRIGGER funnel_entry_stage_history_append_only
  BEFORE UPDATE OR DELETE ON "funnel_entry_stage_history"
  FOR EACH ROW EXECUTE FUNCTION reject_funnel_entry_stage_history_mutation();

CREATE OR REPLACE FUNCTION reject_funnel_entry_score_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'funnel_entry_score_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS funnel_entry_score_history_append_only ON "funnel_entry_score_history";
CREATE TRIGGER funnel_entry_score_history_append_only
  BEFORE UPDATE OR DELETE ON "funnel_entry_score_history"
  FOR EACH ROW EXECUTE FUNCTION reject_funnel_entry_score_history_mutation();
