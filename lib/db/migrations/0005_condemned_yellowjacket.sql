CREATE TABLE "funnel_entry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"current_stage_id" uuid NOT NULL,
	"owner_user_id" uuid,
	"label" "funnel_opportunity_label" DEFAULT 'open' NOT NULL,
	"score" numeric(10, 2) DEFAULT '0' NOT NULL,
	"entry_date" timestamp with time zone DEFAULT now() NOT NULL,
	"entry_origin" text,
	"entry_campaign_id" uuid,
	"entry_creative_id" uuid,
	"conversion_origin" text,
	"conversion_campaign_id" uuid,
	"conversion_creative_id" uuid,
	"transaction_id" uuid,
	"lost_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_entry_score_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_entry_id" uuid NOT NULL,
	"from_score" numeric(10, 2),
	"to_score" numeric(10, 2) NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_entry_stage_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_entry_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"changed_by" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "funnel_score_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_id" uuid NOT NULL,
	"name" text NOT NULL,
	"event_kind" text NOT NULL,
	"delta" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_entry_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"applied_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_target" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"funnel_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"target_count" integer,
	"target_revenue" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_funnel_id_funnel_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_current_stage_id_funnel_stage_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."funnel_stage"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_owner_user_id_user_account_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_entry_campaign_id_campaign_id_fk" FOREIGN KEY ("entry_campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_entry_creative_id_creative_id_fk" FOREIGN KEY ("entry_creative_id") REFERENCES "public"."creative"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_conversion_campaign_id_campaign_id_fk" FOREIGN KEY ("conversion_campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry" ADD CONSTRAINT "funnel_entry_conversion_creative_id_creative_id_fk" FOREIGN KEY ("conversion_creative_id") REFERENCES "public"."creative"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry_score_history" ADD CONSTRAINT "funnel_entry_score_history_funnel_entry_id_funnel_entry_id_fk" FOREIGN KEY ("funnel_entry_id") REFERENCES "public"."funnel_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_funnel_entry_id_funnel_entry_id_fk" FOREIGN KEY ("funnel_entry_id") REFERENCES "public"."funnel_entry"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_from_stage_id_funnel_stage_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."funnel_stage"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_to_stage_id_funnel_stage_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."funnel_stage"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_entry_stage_history" ADD CONSTRAINT "funnel_entry_stage_history_changed_by_user_account_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "funnel_score_rule" ADD CONSTRAINT "funnel_score_rule_funnel_id_funnel_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "opportunity_tag" ADD CONSTRAINT "opportunity_tag_funnel_entry_id_funnel_entry_id_fk" FOREIGN KEY ("funnel_entry_id") REFERENCES "public"."funnel_entry"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "opportunity_tag" ADD CONSTRAINT "opportunity_tag_applied_by_user_account_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "sales_target" ADD CONSTRAINT "sales_target_funnel_id_funnel_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_funnel_entry_active" ON "funnel_entry" USING btree ("contact_id","funnel_id") WHERE label NOT IN ('won','lost');--> statement-breakpoint
CREATE INDEX "idx_funnel_entry_funnel" ON "funnel_entry" USING btree ("funnel_id");--> statement-breakpoint
CREATE INDEX "idx_funnel_entry_contact" ON "funnel_entry" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "idx_funnel_entry_label" ON "funnel_entry" USING btree ("label");--> statement-breakpoint
CREATE INDEX "idx_funnel_entry_owner" ON "funnel_entry" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_funnel_entry_score_history_entry" ON "funnel_entry_score_history" USING btree ("funnel_entry_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_funnel_entry_stage_history_entry" ON "funnel_entry_stage_history" USING btree ("funnel_entry_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_funnel_score_rule_funnel" ON "funnel_score_rule" USING btree ("funnel_id");--> statement-breakpoint
CREATE INDEX "idx_funnel_score_rule_event_kind" ON "funnel_score_rule" USING btree ("event_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_opportunity_tag" ON "opportunity_tag" USING btree ("funnel_entry_id","tag");--> statement-breakpoint
CREATE INDEX "idx_opportunity_tag_entry" ON "opportunity_tag" USING btree ("funnel_entry_id");--> statement-breakpoint
CREATE INDEX "idx_sales_target_funnel" ON "sales_target" USING btree ("funnel_id");--> statement-breakpoint
CREATE INDEX "idx_sales_target_period" ON "sales_target" USING btree ("period_start","period_end");