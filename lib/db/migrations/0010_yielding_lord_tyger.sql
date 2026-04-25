CREATE TABLE "automation_execution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"subject_kind" text,
	"subject_id" uuid,
	"idempotency_key" text NOT NULL,
	"status" "automation_execution_status" DEFAULT 'pending' NOT NULL,
	"triggered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_execution_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"node_kind" text NOT NULL,
	"status" text NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_automation_exec_log_node_kind" CHECK ("automation_execution_log"."node_kind" IN ('trigger', 'condition', 'action')),
	CONSTRAINT "ck_automation_exec_log_status" CHECK ("automation_execution_log"."status" IN ('ok', 'skipped', 'error'))
);
--> statement-breakpoint
ALTER TABLE "automation_execution" ADD CONSTRAINT "automation_execution_flow_id_automation_flow_id_fk" FOREIGN KEY ("flow_id") REFERENCES "public"."automation_flow"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "automation_execution_log" ADD CONSTRAINT "automation_execution_log_execution_id_automation_execution_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."automation_execution"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_automation_execution_idem" ON "automation_execution" USING btree ("flow_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_automation_execution_flow" ON "automation_execution" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "idx_automation_execution_status" ON "automation_execution" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_automation_execution_subject" ON "automation_execution" USING btree ("subject_kind","subject_id");--> statement-breakpoint
CREATE INDEX "idx_automation_exec_log_execution" ON "automation_execution_log" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "idx_automation_exec_log_node" ON "automation_execution_log" USING btree ("node_id");