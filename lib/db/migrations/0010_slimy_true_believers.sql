CREATE TYPE "public"."refund_status" AS ENUM('requested', 'approved', 'rejected', 'processed', 'failed');--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TABLE "refund_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"refund_id" uuid NOT NULL,
	"from_status" "refund_status",
	"to_status" "refund_status" NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_transaction_id_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transaction"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_opened_by_user_id_user_account_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_approved_by_user_id_user_account_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund_effect_log" ADD CONSTRAINT "refund_effect_log_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund_status_history" ADD CONSTRAINT "refund_status_history_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund_status_history" ADD CONSTRAINT "refund_status_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_refund_active_per_transaction" ON "refund" USING btree ("transaction_id") WHERE status IN ('requested','approved');--> statement-breakpoint
CREATE INDEX "idx_refund_transaction_id" ON "refund" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "idx_refund_effect_log_refund_id" ON "refund_effect_log" USING btree ("refund_id");--> statement-breakpoint
CREATE INDEX "idx_refund_status_history_refund_id" ON "refund_status_history" USING btree ("refund_id");