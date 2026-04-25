CREATE TYPE "public"."product_kind" AS ENUM('course', 'ebook', 'training_online', 'training_in_person', 'mentoring', 'bonus', 'other');--> statement-breakpoint
CREATE TYPE "public"."offer_condition_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "commercial_benefit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"auto_tag" text,
	"default_duration_months" integer,
	"default_responsible_user_id" uuid,
	"delivery_status_required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_commercial_benefit_status" CHECK ("commercial_benefit"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "product_kind" DEFAULT 'other' NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_product_slug_kebab" CHECK ("product"."slug" ~ '^[a-z0-9][a-z0-9-]*$'),
	CONSTRAINT "ck_product_status" CHECK ("product"."status" IN ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "product_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"issuing_legal_entity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"type" text DEFAULT 'regular' NOT NULL,
	"renews_offer_id" uuid,
	"status" "offer_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	CONSTRAINT "ck_offer_slug_kebab" CHECK ("offer"."slug" ~ '^[a-z0-9][a-z0-9-]*$'),
	CONSTRAINT "ck_offer_type" CHECK ("offer"."type" IN ('regular', 'renewal')),
	CONSTRAINT "ck_offer_renewal_requires_ref" CHECK (("offer"."type" = 'regular' AND "offer"."renews_offer_id" IS NULL)
          OR ("offer"."type" = 'renewal' AND "offer"."renews_offer_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "commercial_benefit" ADD CONSTRAINT "commercial_benefit_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "commercial_benefit" ADD CONSTRAINT "commercial_benefit_default_responsible_user_id_user_account_id_fk" FOREIGN KEY ("default_responsible_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_product_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_category"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_category" ADD CONSTRAINT "product_category_parent_id_product_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."product_category"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_issuing_legal_entity_id_legal_entity_id_fk" FOREIGN KEY ("issuing_legal_entity_id") REFERENCES "public"."legal_entity"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_renews_offer_id_offer_id_fk" FOREIGN KEY ("renews_offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_commercial_benefit_brand_slug" ON "commercial_benefit" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "idx_commercial_benefit_brand" ON "commercial_benefit" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_brand_slug" ON "product" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "idx_product_brand" ON "product" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_product_kind" ON "product" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_product_category_brand_slug" ON "product_category" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "idx_product_category_brand" ON "product_category" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_offer_brand_slug" ON "offer" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "idx_offer_renews_offer_id" ON "offer" USING btree ("renews_offer_id");