CREATE TYPE "public"."entitlement_kind" AS ENUM('product_access', 'benefit', 'other');--> statement-breakpoint
CREATE TYPE "public"."entitlement_status" AS ENUM('active', 'suspended', 'expired', 'revoked');--> statement-breakpoint
CREATE TABLE "customer_entitlement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"kind" "entitlement_kind" NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"status" "entitlement_status" DEFAULT 'active' NOT NULL,
	"origin_transaction_id" uuid NOT NULL,
	"last_update_transaction_id" uuid NOT NULL,
	"access_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_customer_entitlement_quantity" CHECK ("customer_entitlement"."quantity" > 0),
	CONSTRAINT "ck_customer_entitlement_ref_kind" CHECK ("customer_entitlement"."ref_kind" IN ('product', 'benefit')),
	CONSTRAINT "ck_customer_entitlement_ends_after_started" CHECK ("customer_entitlement"."ends_at" IS NULL OR "customer_entitlement"."ends_at" > "customer_entitlement"."started_at")
);
--> statement-breakpoint
ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_origin_transaction_id_transaction_id_fk" FOREIGN KEY ("origin_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_last_update_transaction_id_transaction_id_fk" FOREIGN KEY ("last_update_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_customer_entitlement_active_per_ref" ON "customer_entitlement" USING btree ("contact_id","brand_id","ref_kind","ref_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "idx_customer_entitlement_contact" ON "customer_entitlement" USING btree ("contact_id");