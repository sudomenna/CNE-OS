CREATE TYPE "public"."transaction_snapshot_flag" AS ENUM('normal', 'refunded', 'disputed');
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'approved', 'refused', 'refunded', 'chargeback', 'cancelled');
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"offer_condition_id" uuid NOT NULL,
	"offer_payment_option_id" uuid NOT NULL,
	"status" "transaction_status" DEFAULT 'pending' NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" char(3) DEFAULT 'BRL' NOT NULL,
	"external_provider" "integration_provider",
	"external_id" text,
	"external_fee" numeric(12, 2),
	"snapshot_id" uuid,
	"approved_at" timestamp with time zone,
	"refused_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_transaction_amount" CHECK ("transaction"."amount" >= 0),
	CONSTRAINT "ck_transaction_approved_coherence" CHECK (("transaction"."status" = 'approved'
           AND "transaction"."approved_at" IS NOT NULL
           AND "transaction"."snapshot_id" IS NOT NULL)
          OR ("transaction"."status" <> 'approved')),
	CONSTRAINT "ck_transaction_refused_coherence" CHECK (("transaction"."status" = 'refused' AND "transaction"."refused_at" IS NOT NULL)
          OR ("transaction"."status" <> 'refused'))
);

ALTER TABLE "transaction" ADD CONSTRAINT "transaction_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_offer_condition_id_offer_condition_id_fk" FOREIGN KEY ("offer_condition_id") REFERENCES "public"."offer_condition"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_offer_payment_option_id_offer_payment_option_id_fk" FOREIGN KEY ("offer_payment_option_id") REFERENCES "public"."offer_payment_option"("id") ON DELETE restrict ON UPDATE cascade;
CREATE UNIQUE INDEX "uq_transaction_external_provider_external_id" ON "transaction" USING btree ("external_provider","external_id") WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX "uq_transaction_unique_offer_per_contact" ON "transaction" USING btree ("contact_id","offer_id") WHERE status = 'approved';
CREATE INDEX "idx_transaction_contact" ON "transaction" USING btree ("contact_id","created_at");
CREATE INDEX "idx_transaction_offer" ON "transaction" USING btree ("offer_id");CREATE TYPE "public"."entitlement_kind" AS ENUM('product_access', 'benefit', 'other');
CREATE TYPE "public"."entitlement_status" AS ENUM('active', 'suspended', 'expired', 'revoked');
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

ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_origin_transaction_id_transaction_id_fk" FOREIGN KEY ("origin_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "customer_entitlement" ADD CONSTRAINT "customer_entitlement_last_update_transaction_id_transaction_id_fk" FOREIGN KEY ("last_update_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;
CREATE UNIQUE INDEX "uq_customer_entitlement_active_per_ref" ON "customer_entitlement" USING btree ("contact_id","brand_id","ref_kind","ref_id") WHERE status = 'active';
CREATE INDEX "idx_customer_entitlement_contact" ON "customer_entitlement" USING btree ("contact_id");CREATE TYPE "public"."refund_status" AS ENUM('requested', 'approved', 'rejected', 'processed', 'failed');
CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"opened_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" "refund_status" DEFAULT 'requested' NOT NULL,
	"external_refund_id" text,
	"external_provider" "integration_provider",
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_refund_amount" CHECK ("refund"."amount" > 0),
	CONSTRAINT "ck_refund_approved_coherence" CHECK (("refund"."status" = 'approved' AND "refund"."approved_at" IS NOT NULL AND "refund"."approved_by_user_id" IS NOT NULL)
          OR ("refund"."status" = 'processed' AND "refund"."approved_at" IS NOT NULL)
          OR ("refund"."status" NOT IN ('approved', 'processed')))
);

CREATE TABLE "refund_effect_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"effect_kind" text NOT NULL,
	"ref_id" uuid,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_refund_effect_kind" CHECK ("refund_effect_log"."effect_kind" IN (
        'snapshot_flagged',
        'entitlement_revoked',
        'contact_reclassified',
        'opportunity_reverted',
        'subscription_cancelled',
        'timeline_emitted'
      ))
);

CREATE TABLE "refund_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"from_status" "refund_status",
	"to_status" "refund_status" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "refund" ADD CONSTRAINT "refund_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "refund" ADD CONSTRAINT "refund_opened_by_user_id_user_account_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "refund" ADD CONSTRAINT "refund_approved_by_user_id_user_account_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "refund_effect_log" ADD CONSTRAINT "refund_effect_log_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "refund_status_history" ADD CONSTRAINT "refund_status_history_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "refund_status_history" ADD CONSTRAINT "refund_status_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;
CREATE UNIQUE INDEX "uq_refund_active_per_transaction" ON "refund" USING btree ("transaction_id") WHERE status IN ('requested','approved');
CREATE INDEX "idx_refund_transaction_id" ON "refund" USING btree ("transaction_id");
CREATE INDEX "idx_refund_effect_log_refund_id" ON "refund_effect_log" USING btree ("refund_id");
CREATE INDEX "idx_refund_status_history_refund_id" ON "refund_status_history" USING btree ("refund_id");CREATE TABLE "transaction_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"item_kind" "offer_condition_item_kind" NOT NULL,
	"product_id" uuid,
	"commercial_benefit_id" uuid,
	"quantity" integer NOT NULL,
	"resolved_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"delivery_status" text DEFAULT 'pending' NOT NULL,
	"responsible_user_id" uuid,
	"snapshot_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_transaction_item_delivery_status" CHECK ("transaction_item"."delivery_status" IN ('pending','scheduled','in_progress','delivered','not_applicable')),
	CONSTRAINT "ck_transaction_item_quantity" CHECK ("transaction_item"."quantity" > 0)
);

CREATE TABLE "transaction_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"flag" "transaction_snapshot_flag" DEFAULT 'normal' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "transaction_snapshot_flag_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"from_flag" "transaction_snapshot_flag",
	"to_flag" "transaction_snapshot_flag" NOT NULL,
	"reason" text NOT NULL,
	"caused_by_refund_id" uuid,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "transaction_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"from_status" "transaction_status",
	"to_status" "transaction_status" NOT NULL,
	"changed_by" uuid,
	"actor_system" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "entitlement_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"from" jsonb,
	"to" jsonb NOT NULL,
	"reason" text NOT NULL,
	"caused_by_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "entitlement_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"from_status" "entitlement_status",
	"to_status" "entitlement_status" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_commercial_benefit_id_commercial_benefit_id_fk" FOREIGN KEY ("commercial_benefit_id") REFERENCES "public"."commercial_benefit"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_responsible_user_id_user_account_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_snapshot_id_transaction_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."transaction_snapshot"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction_snapshot" ADD CONSTRAINT "transaction_snapshot_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction_snapshot_flag_history" ADD CONSTRAINT "transaction_snapshot_flag_history_snapshot_id_transaction_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."transaction_snapshot"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "transaction_snapshot_flag_history" ADD CONSTRAINT "transaction_snapshot_flag_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "transaction_status_history" ADD CONSTRAINT "transaction_status_history_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "transaction_status_history" ADD CONSTRAINT "transaction_status_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "entitlement_history" ADD CONSTRAINT "entitlement_history_entitlement_id_customer_entitlement_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."customer_entitlement"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "entitlement_history" ADD CONSTRAINT "entitlement_history_caused_by_transaction_id_transaction_id_fk" FOREIGN KEY ("caused_by_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "entitlement_status_history" ADD CONSTRAINT "entitlement_status_history_entitlement_id_customer_entitlement_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."customer_entitlement"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "entitlement_status_history" ADD CONSTRAINT "entitlement_status_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;
CREATE INDEX "idx_transaction_item_transaction" ON "transaction_item" USING btree ("transaction_id");
CREATE INDEX "idx_transaction_item_snapshot" ON "transaction_item" USING btree ("snapshot_id");
CREATE UNIQUE INDEX "uq_transaction_snapshot_transaction_id" ON "transaction_snapshot" USING btree ("transaction_id");
CREATE INDEX "idx_transaction_snapshot_transaction" ON "transaction_snapshot" USING btree ("transaction_id");
CREATE INDEX "idx_tsfh_snapshot" ON "transaction_snapshot_flag_history" USING btree ("snapshot_id");
CREATE INDEX "idx_transaction_status_history_transaction" ON "transaction_status_history" USING btree ("transaction_id");
CREATE INDEX "idx_entitlement_history_ent" ON "entitlement_history" USING btree ("entitlement_id","created_at");
CREATE INDEX "idx_entitlement_status_history_ent_id" ON "entitlement_status_history" USING btree ("entitlement_id");