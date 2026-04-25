CREATE TABLE "transaction_item" (
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
--> statement-breakpoint
CREATE TABLE "transaction_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"flag" "transaction_snapshot_flag" DEFAULT 'normal' NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "entitlement_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"from" jsonb,
	"to" jsonb NOT NULL,
	"reason" text NOT NULL,
	"caused_by_transaction_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entitlement_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entitlement_id" uuid NOT NULL,
	"from_status" "entitlement_status",
	"to_status" "entitlement_status" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_commercial_benefit_id_commercial_benefit_id_fk" FOREIGN KEY ("commercial_benefit_id") REFERENCES "public"."commercial_benefit"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_responsible_user_id_user_account_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_item" ADD CONSTRAINT "transaction_item_snapshot_id_transaction_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."transaction_snapshot"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_snapshot" ADD CONSTRAINT "transaction_snapshot_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_snapshot_flag_history" ADD CONSTRAINT "transaction_snapshot_flag_history_snapshot_id_transaction_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."transaction_snapshot"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_snapshot_flag_history" ADD CONSTRAINT "transaction_snapshot_flag_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_status_history" ADD CONSTRAINT "transaction_status_history_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction_status_history" ADD CONSTRAINT "transaction_status_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entitlement_history" ADD CONSTRAINT "entitlement_history_entitlement_id_customer_entitlement_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."customer_entitlement"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entitlement_history" ADD CONSTRAINT "entitlement_history_caused_by_transaction_id_transaction_id_fk" FOREIGN KEY ("caused_by_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entitlement_status_history" ADD CONSTRAINT "entitlement_status_history_entitlement_id_customer_entitlement_id_fk" FOREIGN KEY ("entitlement_id") REFERENCES "public"."customer_entitlement"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "entitlement_status_history" ADD CONSTRAINT "entitlement_status_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_transaction_item_transaction" ON "transaction_item" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_item_snapshot" ON "transaction_item" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transaction_snapshot_transaction_id" ON "transaction_snapshot" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_snapshot_transaction" ON "transaction_snapshot" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_tsfh_snapshot" ON "transaction_snapshot_flag_history" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_transaction_status_history_transaction" ON "transaction_status_history" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_entitlement_history_ent" ON "entitlement_history" USING btree ("entitlement_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_entitlement_status_history_ent_id" ON "entitlement_status_history" USING btree ("entitlement_id");