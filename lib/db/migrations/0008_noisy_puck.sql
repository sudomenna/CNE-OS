CREATE TYPE "public"."transaction_snapshot_flag" AS ENUM('normal', 'refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('pending', 'approved', 'refused', 'refunded', 'chargeback', 'cancelled');--> statement-breakpoint
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
--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_offer_id_offer_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offer"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_offer_condition_id_offer_condition_id_fk" FOREIGN KEY ("offer_condition_id") REFERENCES "public"."offer_condition"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_offer_payment_option_id_offer_payment_option_id_fk" FOREIGN KEY ("offer_payment_option_id") REFERENCES "public"."offer_payment_option"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transaction_external_provider_external_id" ON "transaction" USING btree ("external_provider","external_id") WHERE external_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_transaction_unique_offer_per_contact" ON "transaction" USING btree ("contact_id","offer_id") WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX "idx_transaction_contact" ON "transaction" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_transaction_offer" ON "transaction" USING btree ("offer_id");