-- Sprint 11 — MOD-AUTOMATION
-- T-11-01: automation_flow, automation_node
-- T-11-02: automation_trigger, automation_condition, automation_action
-- T-11-03: automation_execution, automation_execution_log

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."automation_trigger_kind" AS ENUM(
  'funnel_enter',
  'funnel_stage_change',
  'new_message',
  'checkout_abandoned',
  'sale_approved',
  'ticket_opened',
  'brevo_event',
  'integration_event'
);

CREATE TYPE "public"."automation_action_kind" AS ENUM(
  'apply_tag',
  'move_stage',
  'open_ticket',
  'notify_user',
  'emit_timeline_event',
  'send_external'
);

CREATE TYPE "public"."automation_execution_status" AS ENUM(
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled'
);

-- ---------------------------------------------------------------------------
-- T-11-01: automation_flow
-- INV-AUTOMATION-01: is_active=false quando start_node_id IS NULL
-- ---------------------------------------------------------------------------

CREATE TABLE "automation_flow" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id"      uuid,
  "name"          text NOT NULL,
  "description"   text,
  "is_active"     boolean DEFAULT false NOT NULL,
  "start_node_id" uuid,   -- FK deferrable adicionada abaixo (circular)
  "version"       integer DEFAULT 1 NOT NULL,
  "created_by"    uuid,
  "created_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"    timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at"    timestamp with time zone
);

-- ---------------------------------------------------------------------------
-- T-11-01: automation_node
-- INV-AUTOMATION-02: kind='condition' usa next_on_true/false; outros usam next_node_id
-- ---------------------------------------------------------------------------

CREATE TABLE "automation_node" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id"          uuid NOT NULL,
  "kind"             text NOT NULL,
  "label"            text,
  "next_node_id"     uuid,
  "next_on_true_id"  uuid,
  "next_on_false_id" uuid,
  "config"           jsonb DEFAULT '{}'::jsonb NOT NULL,
  "position_x"       numeric(10, 2) DEFAULT '0' NOT NULL,
  "position_y"       numeric(10, 2) DEFAULT '0' NOT NULL,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_automation_node_kind"
    CHECK ("kind" IN ('trigger', 'condition', 'action'))
);

-- ---------------------------------------------------------------------------
-- T-11-02: automation_trigger, automation_condition, automation_action (1-1 com node)
-- ---------------------------------------------------------------------------

CREATE TABLE "automation_trigger" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "node_id"    uuid NOT NULL,
  "kind"       "automation_trigger_kind" NOT NULL,
  "filter"     jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "automation_trigger_node_id_unique" UNIQUE("node_id")
);

CREATE TABLE "automation_condition" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "node_id"    uuid NOT NULL,
  "expr"       jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "automation_condition_node_id_unique" UNIQUE("node_id")
);

CREATE TABLE "automation_action" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "node_id"    uuid NOT NULL,
  "kind"       "automation_action_kind" NOT NULL,
  "params"     jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "automation_action_node_id_unique" UNIQUE("node_id")
);

-- ---------------------------------------------------------------------------
-- T-11-03: automation_execution
-- INV-AUTOMATION-03: uq_automation_execution_idem barra duplicação
-- ---------------------------------------------------------------------------

CREATE TABLE "automation_execution" (
  "id"               uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "flow_id"          uuid NOT NULL,
  "subject_kind"     text,
  "subject_id"       uuid,
  "idempotency_key"  text NOT NULL,
  "status"           "automation_execution_status" DEFAULT 'pending' NOT NULL,
  "triggered_at"     timestamp with time zone DEFAULT now() NOT NULL,
  "started_at"       timestamp with time zone,
  "finished_at"      timestamp with time zone,
  "error"            text,
  "retry_count"      integer DEFAULT 0 NOT NULL,
  "created_at"       timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at"       timestamp with time zone DEFAULT now() NOT NULL
);

-- ---------------------------------------------------------------------------
-- T-11-03: automation_execution_log (append-only)
-- INV-AUTOMATION-05: cada nó executado produz 1 linha
-- ---------------------------------------------------------------------------

CREATE TABLE "automation_execution_log" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "execution_id" uuid NOT NULL,
  "node_id"      uuid NOT NULL,
  "node_kind"    text NOT NULL,
  "status"       text NOT NULL,
  "input"        jsonb,
  "output"       jsonb,
  "error"        text,
  "executed_at"  timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_automation_exec_log_node_kind"
    CHECK ("node_kind" IN ('trigger', 'condition', 'action')),
  CONSTRAINT "ck_automation_exec_log_status"
    CHECK ("status" IN ('ok', 'skipped', 'error'))
);

-- ---------------------------------------------------------------------------
-- Foreign keys
-- ---------------------------------------------------------------------------

ALTER TABLE "automation_flow"
  ADD CONSTRAINT "automation_flow_brand_id_fk"
  FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_flow"
  ADD CONSTRAINT "automation_flow_created_by_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."user_account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "automation_node"
  ADD CONSTRAINT "automation_node_flow_id_fk"
  FOREIGN KEY ("flow_id") REFERENCES "public"."automation_flow"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_trigger"
  ADD CONSTRAINT "automation_trigger_node_id_fk"
  FOREIGN KEY ("node_id") REFERENCES "public"."automation_node"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_condition"
  ADD CONSTRAINT "automation_condition_node_id_fk"
  FOREIGN KEY ("node_id") REFERENCES "public"."automation_node"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_action"
  ADD CONSTRAINT "automation_action_node_id_fk"
  FOREIGN KEY ("node_id") REFERENCES "public"."automation_node"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "automation_execution"
  ADD CONSTRAINT "automation_execution_flow_id_fk"
  FOREIGN KEY ("flow_id") REFERENCES "public"."automation_flow"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "automation_execution_log"
  ADD CONSTRAINT "automation_execution_log_execution_id_fk"
  FOREIGN KEY ("execution_id") REFERENCES "public"."automation_execution"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- INV-AUTOMATION-01: FK circular — deferrable para permitir inserção na mesma tx
ALTER TABLE "automation_flow"
  ADD CONSTRAINT "automation_flow_start_node_id_fk"
  FOREIGN KEY ("start_node_id") REFERENCES "public"."automation_node"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  DEFERRABLE INITIALLY DEFERRED;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "idx_automation_flow_brand"      ON "automation_flow" ("brand_id");
CREATE INDEX "idx_automation_flow_active"     ON "automation_flow" ("is_active");
CREATE INDEX "idx_automation_flow_start_node" ON "automation_flow" ("start_node_id");

CREATE INDEX "idx_automation_node_flow" ON "automation_node" ("flow_id");
CREATE INDEX "idx_automation_node_kind" ON "automation_node" ("kind");
CREATE INDEX "idx_automation_node_next" ON "automation_node" ("next_node_id");

CREATE INDEX "idx_automation_trigger_kind" ON "automation_trigger" ("kind");
CREATE INDEX "idx_automation_action_kind"  ON "automation_action"  ("kind");

-- INV-AUTOMATION-03: idempotência de execução
CREATE UNIQUE INDEX "uq_automation_execution_idem"
  ON "automation_execution" ("flow_id", "idempotency_key");

CREATE INDEX "idx_automation_execution_flow"    ON "automation_execution" ("flow_id");
CREATE INDEX "idx_automation_execution_status"  ON "automation_execution" ("status");
CREATE INDEX "idx_automation_execution_subject" ON "automation_execution" ("subject_kind", "subject_id");

CREATE INDEX "idx_automation_exec_log_execution" ON "automation_execution_log" ("execution_id");
CREATE INDEX "idx_automation_exec_log_node"      ON "automation_execution_log" ("node_id");

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_automation_flow_updated_at
  BEFORE UPDATE ON automation_flow
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_automation_execution_updated_at
  BEFORE UPDATE ON automation_execution
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- append-only: bloqueia UPDATE em automation_execution_log
CREATE OR REPLACE FUNCTION deny_update_automation_execution_log()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'automation_execution_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER deny_update_automation_exec_log
  BEFORE UPDATE ON automation_execution_log
  FOR EACH ROW EXECUTE FUNCTION deny_update_automation_execution_log();
