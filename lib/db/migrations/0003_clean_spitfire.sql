CREATE TYPE "public"."channel_kind" AS ENUM('whatsapp', 'instagram', 'email');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'waiting_customer', 'waiting_team', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ticket_category" AS ENUM('commercial', 'support', 'financial', 'cancellation', 'refund', 'access', 'registration', 'other');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'in_progress', 'waiting_reply', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."funnel_opportunity_label" AS ENUM('open', 'negotiating', 'concluded', 'won', 'lost', 'reopened');--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'instagram' BEFORE 'notazz';--> statement-breakpoint
ALTER TYPE "public"."integration_provider" ADD VALUE 'email' BEFORE 'notazz';--> statement-breakpoint
CREATE TABLE "channel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"display_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"credentials" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"channel_account_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"assigned_user_id" uuid,
	"external_thread_id" text,
	"last_message_at" timestamp with time zone,
	"brand_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "conversation_assignment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_internal_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"from_status" "conversation_status",
	"to_status" "conversation_status" NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"body" text NOT NULL,
	"external_message_id" text,
	"actor_user_id" uuid,
	"actor_system" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_attachment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" bigserial NOT NULL,
	"contact_id" uuid NOT NULL,
	"brand_id" uuid,
	"origin_conversation_id" uuid,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"priority" "ticket_priority" DEFAULT 'medium' NOT NULL,
	"category" "ticket_category" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"assigned_user_id" uuid,
	"opened_by_user_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ticket_assignment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_user_id" uuid,
	"to_user_id" uuid,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"from_status" "ticket_status",
	"to_status" "ticket_status" NOT NULL,
	"changed_by_user_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel" (
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
--> statement-breakpoint
CREATE TABLE "funnel_stage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign" (
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
--> statement-breakpoint
CREATE TABLE "creative" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"channel" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "creative_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creative_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_account" ADD CONSTRAINT "channel_account_channel_id_channel_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channel"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "channel_account" ADD CONSTRAINT "channel_account_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_channel_account_id_channel_account_id_fk" FOREIGN KEY ("channel_account_id") REFERENCES "public"."channel_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assigned_user_id_user_account_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "conversation_assignment_history_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "conversation_assignment_history_from_user_id_user_account_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "conversation_assignment_history_to_user_id_user_account_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_assignment_history" ADD CONSTRAINT "conversation_assignment_history_assigned_by_user_id_user_account_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_internal_note" ADD CONSTRAINT "conversation_internal_note_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_internal_note" ADD CONSTRAINT "conversation_internal_note_author_user_id_user_account_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_status_history" ADD CONSTRAINT "conversation_status_history_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "conversation_status_history" ADD CONSTRAINT "conversation_status_history_changed_by_user_id_user_account_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_actor_user_id_user_account_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_assigned_user_id_user_account_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_opened_by_user_id_user_account_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_from_user_id_user_account_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_to_user_id_user_account_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_assignment_history" ADD CONSTRAINT "ticket_assignment_history_assigned_by_user_id_user_account_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_note" ADD CONSTRAINT "ticket_note_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_note" ADD CONSTRAINT "ticket_note_author_user_id_user_account_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_status_history" ADD CONSTRAINT "ticket_status_history_changed_by_user_id_user_account_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel" ADD CONSTRAINT "funnel_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_stage" ADD CONSTRAINT "funnel_stage_funnel_id_funnel_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_funnel_id_funnel_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "creative" ADD CONSTRAINT "creative_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "creative_asset" ADD CONSTRAINT "creative_asset_creative_id_creative_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creative"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_kind" ON "channel" USING btree ("kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_channel_account" ON "channel_account" USING btree ("channel_id","brand_id","external_id");--> statement-breakpoint
CREATE INDEX "idx_channel_account_brand" ON "channel_account" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_channel_account_channel" ON "channel_account" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_contact_channel" ON "conversation" USING btree ("contact_id","channel_account_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_status" ON "conversation" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_conversation_assigned" ON "conversation" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_brand" ON "conversation" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_conversation_last_message" ON "conversation" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_assignment_history_conversation" ON "conversation_assignment_history" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_internal_note_conversation" ON "conversation_internal_note" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_conversation_status_history_conversation" ON "conversation_status_history" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_message_conversation" ON "message" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "idx_message_created_at" ON "message" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_message_external_id" ON "message" USING btree ("conversation_id","external_message_id");--> statement-breakpoint
CREATE INDEX "idx_message_attachment_message" ON "message_attachment" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ticket_number" ON "ticket" USING btree ("number");--> statement-breakpoint
CREATE INDEX "idx_ticket_contact" ON "ticket" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_brand" ON "ticket" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_status" ON "ticket" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_ticket_assigned_user" ON "ticket" USING btree ("assigned_user_id");--> statement-breakpoint
CREATE INDEX "idx_ticket_assignment_history_ticket" ON "ticket_assignment_history" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ticket_note_ticket" ON "ticket_note" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ticket_status_history_ticket" ON "ticket_status_history" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_funnel_slug_brand" ON "funnel" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "idx_funnel_brand" ON "funnel" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_funnel_offer" ON "funnel" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_funnel_stage_position" ON "funnel_stage" USING btree ("funnel_id","position");--> statement-breakpoint
CREATE INDEX "idx_funnel_stage_funnel" ON "funnel_stage" USING btree ("funnel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_campaign_slug_brand" ON "campaign" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE INDEX "idx_campaign_brand" ON "campaign" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_campaign_funnel" ON "campaign" USING btree ("funnel_id");--> statement-breakpoint
CREATE INDEX "idx_campaign_is_active" ON "campaign" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_creative_slug_campaign" ON "creative" USING btree ("campaign_id","slug");--> statement-breakpoint
CREATE INDEX "idx_creative_campaign" ON "creative" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_creative_asset_creative" ON "creative_asset" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX "idx_creative_asset_kind" ON "creative_asset" USING btree ("kind");--> statement-breakpoint
ALTER TABLE "timeline_event" ADD CONSTRAINT "timeline_event_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;