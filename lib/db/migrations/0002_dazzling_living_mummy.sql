CREATE TABLE "contact_issue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"related_contact_id" uuid,
	"kind" "contact_issue_kind" NOT NULL,
	"status" "contact_issue_status" DEFAULT 'open' NOT NULL,
	"detail" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"opened_by_system" text,
	"opened_by_user_id" uuid,
	"resolved_by_user_id" uuid,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_merge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"principal_contact_id" uuid NOT NULL,
	"secondary_contact_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"issue_id" uuid,
	"merged_by_user_id" uuid NOT NULL,
	"reassigned_tables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"principal_snapshot" jsonb NOT NULL,
	"secondary_snapshot" jsonb NOT NULL,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_contact_merge_distinct" CHECK ("contact_merge"."principal_contact_id" <> "contact_merge"."secondary_contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_merge_undo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"merge_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"undone_by_user_id" uuid NOT NULL,
	"reverted_tables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_issue" ADD CONSTRAINT "contact_issue_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_issue" ADD CONSTRAINT "contact_issue_related_contact_id_contact_id_fk" FOREIGN KEY ("related_contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_issue" ADD CONSTRAINT "contact_issue_opened_by_user_id_user_account_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_issue" ADD CONSTRAINT "contact_issue_resolved_by_user_id_user_account_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merge" ADD CONSTRAINT "contact_merge_principal_contact_id_contact_id_fk" FOREIGN KEY ("principal_contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merge" ADD CONSTRAINT "contact_merge_secondary_contact_id_contact_id_fk" FOREIGN KEY ("secondary_contact_id") REFERENCES "public"."contact"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merge" ADD CONSTRAINT "contact_merge_issue_id_contact_issue_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."contact_issue"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merge" ADD CONSTRAINT "contact_merge_merged_by_user_id_user_account_id_fk" FOREIGN KEY ("merged_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merge_undo" ADD CONSTRAINT "contact_merge_undo_merge_id_contact_merge_id_fk" FOREIGN KEY ("merge_id") REFERENCES "public"."contact_merge"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_merge_undo" ADD CONSTRAINT "contact_merge_undo_undone_by_user_id_user_account_id_fk" FOREIGN KEY ("undone_by_user_id") REFERENCES "public"."user_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contact_issue_contact_status" ON "contact_issue" USING btree ("contact_id","status");--> statement-breakpoint
CREATE INDEX "idx_contact_issue_open" ON "contact_issue" USING btree ("status") WHERE "contact_issue"."status" = 'open';--> statement-breakpoint
CREATE INDEX "idx_contact_merge_principal" ON "contact_merge" USING btree ("principal_contact_id");--> statement-breakpoint
CREATE INDEX "idx_contact_merge_secondary" ON "contact_merge" USING btree ("secondary_contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contact_merge_undo_merge" ON "contact_merge_undo" USING btree ("merge_id");