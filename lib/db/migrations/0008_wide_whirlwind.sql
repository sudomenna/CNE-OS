CREATE TYPE "public"."installment_status" AS ENUM('scheduled', 'paid', 'overdue', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'past_due', 'paused', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."automation_action_kind" AS ENUM('apply_tag', 'move_stage', 'open_ticket', 'notify_user', 'emit_timeline_event', 'send_external');--> statement-breakpoint
CREATE TYPE "public"."automation_execution_status" AS ENUM('pending', 'running', 'succeeded', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."automation_trigger_kind" AS ENUM('funnel_enter', 'funnel_stage_change', 'new_message', 'checkout_abandoned', 'sale_approved', 'ticket_opened', 'brevo_event', 'integration_event');--> statement-breakpoint
CREATE TABLE "installment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid,
	"subscription_id" uuid,
	"sequence" integer NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"status" "installment_status" DEFAULT 'scheduled' NOT NULL,
	"paid_at" timestamp with time zone,
	"external_provider" "integration_provider",
	"external_id" text,
	"boleto_url" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_installment_amount" CHECK ("installment"."amount" >= 0),
	CONSTRAINT "ck_installment_paid_coherence" CHECK (("installment"."status" = 'paid' AND "installment"."paid_at" IS NOT NULL)
          OR ("installment"."status" <> 'paid')),
	CONSTRAINT "ck_installment_parent_exclusive" CHECK (("installment"."transaction_id" IS NOT NULL AND "installment"."subscription_id" IS NULL)
          OR ("installment"."transaction_id" IS NULL AND "installment"."subscription_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "installment_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"installment_id" uuid NOT NULL,
	"old_status" "installment_status",
	"new_status" "installment_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"offer_condition_id" uuid NOT NULL,
	"offer_payment_option_id" uuid NOT NULL,
	"origin_transaction_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'trial' NOT NULL,
	"current_period_start" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"next_billing_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"external_provider" "integration_provider",
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_subscription_period" CHECK ("subscription"."current_period_end" > "subscription"."current_period_start"),
	CONSTRAINT "ck_subscription_trial" CHECK (("subscription"."status" = 'trial' AND "subscription"."trial_ends_at" IS NOT NULL)
          OR ("subscription"."status" <> 'trial')),
	CONSTRAINT "ck_subscription_cancelled" CHECK (("subscription"."status" = 'cancelled' AND "subscription"."cancelled_at" IS NOT NULL)
          OR ("subscription"."status" <> 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "subscription_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"old_status" "subscription_status",
	"new_status" "subscription_status" NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "automation_flow" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"start_node_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "automation_node" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"next_node_id" uuid,
	"next_on_true_id" uuid,
	"next_on_false_id" uuid,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position_x" numeric(10, 2) DEFAULT '0' NOT NULL,
	"position_y" numeric(10, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_automation_node_kind" CHECK ("automation_node"."kind" IN ('trigger', 'condition', 'action'))
);
--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "installment_status_history" ADD CONSTRAINT "installment_status_history_installment_id_installment_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installment"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_offer_condition_id_offer_condition_id_fk" FOREIGN KEY ("offer_condition_id") REFERENCES "public"."offer_condition"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_offer_payment_option_id_offer_payment_option_id_fk" FOREIGN KEY ("offer_payment_option_id") REFERENCES "public"."offer_payment_option"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_origin_transaction_id_transaction_id_fk" FOREIGN KEY ("origin_transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscription"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation_flow" ADD CONSTRAINT "automation_flow_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation_flow" ADD CONSTRAINT "automation_flow_created_by_user_account_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation_node" ADD CONSTRAINT "automation_node_flow_id_automation_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."automation_flow"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_installment_external" ON "installment" USING btree ("external_provider","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_installment_seq_sub" ON "installment" USING btree ("subscription_id","sequence") WHERE subscription_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_installment_seq_trx" ON "installment" USING btree ("transaction_id","sequence") WHERE transaction_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_installment_status_due" ON "installment" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "idx_installment_status_history_inst" ON "installment_status_history" USING btree ("installment_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_subscription_contact" ON "subscription" USING btree ("contact_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_subscription_external" ON "subscription" USING btree ("external_provider","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_subscription_status_history_sub" ON "subscription_status_history" USING btree ("subscription_id","changed_at");--> statement-breakpoint
CREATE INDEX "idx_automation_flow_brand" ON "automation_flow" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_automation_flow_active" ON "automation_flow" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "idx_automation_flow_start_node" ON "automation_flow" USING btree ("start_node_id");--> statement-breakpoint
CREATE INDEX "idx_automation_node_flow" ON "automation_node" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "idx_automation_node_kind" ON "automation_node" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_automation_node_next" ON "automation_node" USING btree ("next_node_id");--> statement-breakpoint
-- T-11-01: deferrable FK for automation_flow.start_node_id → automation_node.id
-- Circular dependency (flow → node → flow) requires DEFERRABLE INITIALLY DEFERRED so that
-- both tables can be inserted in the same transaction before the FK is checked.
-- docs/20-domain/15-automation.md §3 DDL comment: "FK definida após criação dos nós"
ALTER TABLE "automation_flow"
  ADD CONSTRAINT "automation_flow_start_node_id_automation_node_id_fk"
  FOREIGN KEY ("start_node_id") REFERENCES "public"."automation_node"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
-- T-11-01: set_updated_at trigger for automation_flow
-- docs/30-contracts/02-db-schema-conventions.md §3
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_automation_flow_updated_at
  BEFORE UPDATE ON automation_flow
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();