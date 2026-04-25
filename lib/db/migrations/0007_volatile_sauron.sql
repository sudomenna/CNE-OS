CREATE TYPE "public"."offer_condition_item_kind" AS ENUM('main', 'bonus', 'upsell', 'order_bump', 'complement', 'commercial_benefit');--> statement-breakpoint
CREATE TYPE "public"."offer_payment_method" AS ENUM('pix', 'credit_card', 'installments', 'boleto', 'custom');--> statement-breakpoint
CREATE TYPE "public"."offer_rule_kind" AS ENUM('date_range', 'sales_count_reached', 'campaign', 'channel', 'creative', 'internal_use');--> statement-breakpoint
CREATE TYPE "public"."offer_rule_operator" AS ENUM('and', 'or');--> statement-breakpoint
CREATE TABLE "offer_condition" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"advantage_score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"status" "offer_condition_status" DEFAULT 'draft' NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_offer_condition_priority_range" CHECK ("offer_condition"."priority" BETWEEN -1000 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "offer_condition_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_condition_id" uuid NOT NULL,
	"kind" "offer_condition_item_kind" NOT NULL,
	"product_id" uuid,
	"commercial_benefit_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"access_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"vigency_months" integer,
	"discount" numeric(12, 2),
	"responsible_user_id" uuid,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_offer_condition_item_ref_exclusive" CHECK ((
        "offer_condition_item"."product_id" IS NOT NULL
        AND "offer_condition_item"."commercial_benefit_id" IS NULL
        AND "offer_condition_item"."kind" <> 'commercial_benefit'
      ) OR (
        "offer_condition_item"."product_id" IS NULL
        AND "offer_condition_item"."commercial_benefit_id" IS NOT NULL
        AND "offer_condition_item"."kind" = 'commercial_benefit'
      )),
	CONSTRAINT "ck_offer_condition_item_quantity" CHECK ("offer_condition_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "offer_condition_priority_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_condition_id" uuid NOT NULL,
	"from_priority" integer,
	"to_priority" integer NOT NULL,
	"from_advantage_score" numeric(8, 2),
	"to_advantage_score" numeric(8, 2) NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_condition_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_group_id" uuid NOT NULL,
	"kind" "offer_rule_kind" NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_condition_rule_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_condition_id" uuid NOT NULL,
	"parent_group_id" uuid,
	"operator" "offer_rule_operator" DEFAULT 'and' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_payment_option" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_condition_id" uuid NOT NULL,
	"method" "offer_payment_method" NOT NULL,
	"price" numeric(12, 2) NOT NULL,
	"installments" integer,
	"custom_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_offer_payment_option_price" CHECK ("offer_payment_option"."price" >= 0),
	CONSTRAINT "ck_offer_payment_installments" CHECK ("offer_payment_option"."method" <> 'installments' OR "offer_payment_option"."installments" > 1)
);
--> statement-breakpoint
CREATE TABLE "offer_sales_counter" (
	"offer_id" uuid PRIMARY KEY NOT NULL,
	"approved_count" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"offer_id" uuid NOT NULL,
	"from_status" "offer_status",
	"to_status" "offer_status" NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "offer_condition" ADD CONSTRAINT "offer_condition_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition" ADD CONSTRAINT "offer_condition_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_item" ADD CONSTRAINT "offer_condition_item_offer_condition_id_offer_condition_id_fk" FOREIGN KEY ("offer_condition_id") REFERENCES "public"."offer_condition"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_item" ADD CONSTRAINT "offer_condition_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_item" ADD CONSTRAINT "offer_condition_item_commercial_benefit_id_commercial_benefit_id_fk" FOREIGN KEY ("commercial_benefit_id") REFERENCES "public"."commercial_benefit"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_item" ADD CONSTRAINT "offer_condition_item_responsible_user_id_user_account_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_priority_history" ADD CONSTRAINT "offer_condition_priority_history_offer_condition_id_offer_condition_id_fk" FOREIGN KEY ("offer_condition_id") REFERENCES "public"."offer_condition"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_priority_history" ADD CONSTRAINT "offer_condition_priority_history_changed_by_user_id_user_account_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_rule" ADD CONSTRAINT "offer_condition_rule_rule_group_id_offer_condition_rule_group_id_fk" FOREIGN KEY ("rule_group_id") REFERENCES "public"."offer_condition_rule_group"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_rule_group" ADD CONSTRAINT "offer_condition_rule_group_offer_condition_id_offer_condition_id_fk" FOREIGN KEY ("offer_condition_id") REFERENCES "public"."offer_condition"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_condition_rule_group" ADD CONSTRAINT "offer_condition_rule_group_parent_group_id_offer_condition_rule_group_id_fk" FOREIGN KEY ("parent_group_id") REFERENCES "public"."offer_condition_rule_group"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_payment_option" ADD CONSTRAINT "offer_payment_option_offer_condition_id_offer_condition_id_fk" FOREIGN KEY ("offer_condition_id") REFERENCES "public"."offer_condition"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_sales_counter" ADD CONSTRAINT "offer_sales_counter_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_status_history" ADD CONSTRAINT "offer_status_history_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "offer_status_history" ADD CONSTRAINT "offer_status_history_changed_by_user_id_user_account_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_offer_condition_default_per_offer" ON "offer_condition" USING btree ("offer_id") WHERE is_default = true AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_offer_condition_offer" ON "offer_condition" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "idx_offer_condition_item_condition" ON "offer_condition_item" USING btree ("offer_condition_id");--> statement-breakpoint
CREATE INDEX "idx_offer_condition_item_product" ON "offer_condition_item" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_offer_condition_item_benefit" ON "offer_condition_item" USING btree ("commercial_benefit_id");--> statement-breakpoint
CREATE INDEX "idx_offer_condition_priority_history_condition" ON "offer_condition_priority_history" USING btree ("offer_condition_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_offer_condition_rule_group" ON "offer_condition_rule" USING btree ("rule_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_offer_rule_group_root" ON "offer_condition_rule_group" USING btree ("offer_condition_id") WHERE parent_group_id IS NULL;--> statement-breakpoint
CREATE INDEX "idx_offer_condition_rule_group_condition" ON "offer_condition_rule_group" USING btree ("offer_condition_id");--> statement-breakpoint
CREATE INDEX "idx_offer_condition_rule_group_parent" ON "offer_condition_rule_group" USING btree ("parent_group_id");--> statement-breakpoint
CREATE INDEX "idx_offer_payment_option_condition" ON "offer_payment_option" USING btree ("offer_condition_id");--> statement-breakpoint
CREATE INDEX "idx_offer_payment_option_method" ON "offer_payment_option" USING btree ("method");--> statement-breakpoint
CREATE INDEX "idx_offer_status_history_offer" ON "offer_status_history" USING btree ("offer_id","created_at");