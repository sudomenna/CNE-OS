CREATE TYPE "public"."role_kind" AS ENUM('admin', 'financial', 'marketing', 'support', 'commercial');--> statement-breakpoint
CREATE TYPE "public"."audit_action_kind" AS ENUM('create', 'update', 'delete', 'merge', 'unmerge', 'refund', 'status_change', 'impersonate', 'other');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('digital_guru', 'brevo', 'whatsapp_official', 'notazz', 'analytics');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."contact_classification" AS ENUM('lead', 'customer', 'student', 'paid_lead');--> statement-breakpoint
CREATE TYPE "public"."contact_email_status" AS ENUM('primary', 'alternative', 'invalid', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."contact_issue_kind" AS ENUM('email_duplicate', 'phone_conflict', 'document_mismatch', 'source_divergence', 'other');--> statement-breakpoint
CREATE TYPE "public"."contact_issue_status" AS ENUM('open', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."contact_phone_status" AS ENUM('primary', 'secondary', 'whatsapp_valid', 'no_whatsapp', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('active', 'inactive', 'invalid', 'blocked');--> statement-breakpoint
CREATE TABLE "role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "role_kind" NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "user_account" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_role" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_role_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"actor_system" text,
	"action_kind" "audit_action_kind" NOT NULL,
	"resource_kind" text NOT NULL,
	"resource_id" uuid,
	"before" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"after" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"user_agent" text,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_audit_actor" CHECK ("audit_log"."actor_user_id" IS NOT NULL OR "audit_log"."actor_system" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "timeline_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"brand_id" uuid,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" uuid,
	"actor_system" text,
	"subject_kind" text,
	"subject_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_timeline_actor_present" CHECK ("timeline_event"."actor_user_id" IS NOT NULL OR "timeline_event"."actor_system" IS NOT NULL),
	CONSTRAINT "ck_timeline_kind_snake" CHECK ("timeline_event"."kind" ~ '^[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
CREATE TABLE "permission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"requires_2fa" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permission" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	CONSTRAINT "role_permission_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"external_event_id" text NOT NULL,
	"event_kind" text,
	"payload" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"dead_lettered_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "contact" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"cpf" varchar(11),
	"status" "contact_status" DEFAULT 'active' NOT NULL,
	"classification" "contact_classification" DEFAULT 'lead' NOT NULL,
	"birth_date" date,
	"origin" text,
	"merged_into_id" uuid,
	"notes_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ck_contact_cpf_length" CHECK ("contact"."cpf" IS NULL OR (char_length("contact"."cpf") = 11 AND "contact"."cpf" ~ '^[0-9]{11}$'))
);
--> statement-breakpoint
CREATE TABLE "contact_custom_field" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"brand_id" uuid,
	"key" text NOT NULL,
	"value" jsonb DEFAULT 'null'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"issuer" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_email" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"email" text NOT NULL,
	"status" "contact_email_status" DEFAULT 'alternative' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_phone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"e164" varchar(16) NOT NULL,
	"status" "contact_phone_status" DEFAULT 'secondary' NOT NULL,
	"whatsapp_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"from_status" "contact_status",
	"to_status" "contact_status" NOT NULL,
	"from_classification" "contact_classification",
	"to_classification" "contact_classification",
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"applied_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_user_id_user_account_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_granted_by_user_account_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_user_account_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_actor_user_id_user_account_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_permission_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permission"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_custom_field" ADD CONSTRAINT "contact_custom_field_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_custom_field" ADD CONSTRAINT "contact_custom_field_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_document" ADD CONSTRAINT "contact_document_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_email" ADD CONSTRAINT "contact_email_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_note" ADD CONSTRAINT "contact_note_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_note" ADD CONSTRAINT "contact_note_author_user_id_user_account_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_phone" ADD CONSTRAINT "contact_phone_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_status_history" ADD CONSTRAINT "contact_status_history_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_status_history" ADD CONSTRAINT "contact_status_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_tag" ADD CONSTRAINT "contact_tag_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_tag" ADD CONSTRAINT "contact_tag_applied_by_user_account_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_kind" ON "role" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_account_email" ON "user_account" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_user_role_user" ON "user_role" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_resource" ON "audit_log" USING btree ("resource_kind","resource_id");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "idx_audit_time" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_timeline_contact_time" ON "timeline_event" USING btree ("contact_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_timeline_brand" ON "timeline_event" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_timeline_kind" ON "timeline_event" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_timeline_subject" ON "timeline_event" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "idx_timeline_payload_gin" ON "timeline_event" USING gin ("payload");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_permission_action" ON "permission" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_role_permission_role" ON "role_permission" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_webhook_event" ON "webhook_log" USING btree ("provider","external_event_id");--> statement-breakpoint
CREATE INDEX "idx_webhook_status" ON "webhook_log" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_webhook_provider_received" ON "webhook_log" USING btree ("provider","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_cpf" ON "contact" USING btree ("cpf") WHERE "contact"."cpf" IS NOT NULL AND "contact"."deleted_at" IS NULL AND "contact"."merged_into_id" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_contact_classification" ON "contact" USING btree ("classification");--> statement-breakpoint
CREATE INDEX "idx_contact_status" ON "contact" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contact_merged_into" ON "contact" USING btree ("merged_into_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_custom_field" ON "contact_custom_field" USING btree ("contact_id","brand_id","key");--> statement-breakpoint
CREATE INDEX "idx_contact_document_contact" ON "contact_document" USING btree ("contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_email" ON "contact_email" USING btree ("email") WHERE "contact_email"."status" NOT IN ('invalid', 'unsubscribed');--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_email_primary" ON "contact_email" USING btree ("contact_id") WHERE "contact_email"."status" = 'primary';--> statement-breakpoint
CREATE INDEX "idx_contact_note_contact" ON "contact_note" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_phone_e164" ON "contact_phone" USING btree ("e164") WHERE "contact_phone"."status" <> 'invalid';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_phone_primary" ON "contact_phone" USING btree ("contact_id") WHERE "contact_phone"."status" = 'primary';--> statement-breakpoint
CREATE INDEX "idx_contact_status_history_contact" ON "contact_status_history" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_tag" ON "contact_tag" USING btree ("contact_id","tag");