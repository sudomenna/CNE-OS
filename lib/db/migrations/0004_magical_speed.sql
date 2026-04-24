CREATE TABLE "content_library_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trackable_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"funnel_id" uuid,
	"campaign_id" uuid,
	"creative_id" uuid,
	"destination_url" text NOT NULL,
	"slug" text NOT NULL,
	"utm" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_library_item" ADD CONSTRAINT "content_library_item_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_funnel_id_funnel_id_fk" FOREIGN KEY ("funnel_id") REFERENCES "public"."funnel"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "trackable_link" ADD CONSTRAINT "trackable_link_creative_id_creative_id_fk" FOREIGN KEY ("creative_id") REFERENCES "public"."creative"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_content_library_item_brand" ON "content_library_item" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_content_library_item_type" ON "content_library_item" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_trackable_link_slug" ON "trackable_link" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_trackable_link_brand" ON "trackable_link" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "idx_trackable_link_campaign" ON "trackable_link" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "idx_trackable_link_creative" ON "trackable_link" USING btree ("creative_id");--> statement-breakpoint
CREATE INDEX "idx_trackable_link_funnel" ON "trackable_link" USING btree ("funnel_id");