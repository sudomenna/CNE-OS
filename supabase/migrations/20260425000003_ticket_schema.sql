-- Migration: 20260425000003_ticket_schema
-- Task: T-3-12
-- Módulo: MOD-TICKET
-- Specs:
--   docs/20-domain/06-ticket.md §3
--   docs/30-contracts/01-enums.md (Inbox / Ticket)
--   docs/30-contracts/02-db-schema-conventions.md

-- ---------------------------------------------------------------------------
-- Enums — docs/30-contracts/01-enums.md §Inbox / Ticket
-- ---------------------------------------------------------------------------

CREATE TYPE "ticket_status" AS ENUM (
  'open',
  'in_progress',
  'waiting_reply',
  'resolved',
  'cancelled'
);

CREATE TYPE "ticket_priority" AS ENUM (
  'low',
  'medium',
  'high',
  'urgent'
);

CREATE TYPE "ticket_category" AS ENUM (
  'commercial',
  'support',
  'financial',
  'cancellation',
  'refund',
  'access',
  'registration',
  'other'
);

-- ---------------------------------------------------------------------------
-- ticket — entidade principal
-- docs/20-domain/06-ticket.md §3 (DDL sketch + INV-TICKET-01 to INV-TICKET-07)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ticket" (
  "id"                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- INV-TICKET-07: número sequencial global e único (UX humano-legível)
  "number"                 bigserial   NOT NULL,
  -- INV-TICKET-01: ticket sempre pertence a 1 contato (RESTRICT preserva histórico)
  "contact_id"             uuid        NOT NULL REFERENCES "contact"("id")       ON DELETE RESTRICT  ON UPDATE CASCADE,
  -- INV-TICKET-01: brand_id opcional — herda de conversa de origem ou preenchido manualmente
  "brand_id"               uuid                 REFERENCES "brand"("id")         ON DELETE SET NULL  ON UPDATE CASCADE,
  -- INV-TICKET-02: origin_conversation_id opcional; sem FK formal por ora.
  -- A tabela `conversation` existe, mas a FK será adicionada em migration separada
  -- para desacoplar esta migration do estado de conversation (T-3-02).
  -- Adicionar FK via: ALTER TABLE ticket ADD CONSTRAINT fk_ticket_conversation
  --   FOREIGN KEY (origin_conversation_id) REFERENCES conversation(id) ON DELETE SET NULL;
  "origin_conversation_id" uuid,
  "status"                 ticket_status    NOT NULL DEFAULT 'open',
  "priority"               ticket_priority  NOT NULL DEFAULT 'medium',
  "category"               ticket_category  NOT NULL,
  -- Título descritivo do ticket
  "title"                  text        NOT NULL,
  "description"            text,
  -- INV-TICKET-03: responsável do ticket independente do responsável da conversa de origem
  "assigned_user_id"       uuid                 REFERENCES "user_account"("id") ON DELETE SET NULL  ON UPDATE CASCADE,
  "opened_by_user_id"      uuid        NOT NULL REFERENCES "user_account"("id") ON DELETE RESTRICT  ON UPDATE CASCADE,
  "resolved_at"            timestamptz,
  "created_at"             timestamptz NOT NULL DEFAULT now(),
  "updated_at"             timestamptz NOT NULL DEFAULT now(),
  -- Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
  "deleted_at"             timestamptz,
  -- INV-TICKET-07: number sequencial global único
  CONSTRAINT "uq_ticket_number" UNIQUE ("number")
);

CREATE INDEX IF NOT EXISTS "idx_ticket_contact"       ON "ticket" ("contact_id");
CREATE INDEX IF NOT EXISTS "idx_ticket_brand"         ON "ticket" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_ticket_status"        ON "ticket" ("status");
CREATE INDEX IF NOT EXISTS "idx_ticket_assigned_user" ON "ticket" ("assigned_user_id");

-- ---------------------------------------------------------------------------
-- ticket_note — notas no ticket (APPEND-ONLY)
-- docs/20-domain/06-ticket.md §3
-- docs/30-contracts/02-db-schema-conventions.md §6
--
-- Sem updated_at (append-only por design).
-- Trigger abaixo bloqueia UPDATE e DELETE nesta tabela.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ticket_note" (
  "id"             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticket_id"      uuid        NOT NULL REFERENCES "ticket"("id")        ON DELETE CASCADE  ON UPDATE CASCADE,
  -- RESTRICT: nota não some se usuário for desativado
  "author_user_id" uuid        NOT NULL REFERENCES "user_account"("id")  ON DELETE RESTRICT ON UPDATE CASCADE,
  "body"           text        NOT NULL,
  -- is_internal=true: nota privada (visível apenas para agentes, não para o contato)
  "is_internal"    boolean     NOT NULL DEFAULT true,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ticket_note_ticket"
  ON "ticket_note" ("ticket_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- ticket_status_history — histórico de transições de status (APPEND-ONLY)
-- docs/20-domain/06-ticket.md §3 + §6
-- docs/30-contracts/02-db-schema-conventions.md §8
--
-- INV-TICKET-06: cada transição de status gera linha aqui.
-- Sem updated_at (append-only por design).
-- Trigger abaixo bloqueia UPDATE e DELETE nesta tabela.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ticket_status_history" (
  "id"                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: preservar histórico mesmo após soft-delete do ticket
  "ticket_id"           uuid          NOT NULL REFERENCES "ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_status"         ticket_status,
  "to_status"           ticket_status NOT NULL,
  "changed_by_user_id"  uuid          REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "reason"              text,
  "created_at"          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ticket_status_history_ticket"
  ON "ticket_status_history" ("ticket_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- ticket_assignment_history — histórico de atribuições (APPEND-ONLY)
-- docs/20-domain/06-ticket.md §3
-- docs/30-contracts/02-db-schema-conventions.md §6
--
-- INV-TICKET-06: cada mudança de responsável gera linha aqui.
-- Sem updated_at (append-only por design).
-- Trigger abaixo bloqueia UPDATE e DELETE nesta tabela.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ticket_assignment_history" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: preservar histórico mesmo após soft-delete do ticket
  "ticket_id"           uuid        NOT NULL REFERENCES "ticket"("id")        ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_user_id"        uuid                 REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "to_user_id"          uuid                 REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  -- assigned_by_user_id: quem efetuou a atribuição (RESTRICT: auditoria preservada)
  "assigned_by_user_id" uuid        NOT NULL REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_ticket_assignment_history_ticket"
  ON "ticket_assignment_history" ("ticket_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- Trigger: set_updated_at para ticket
-- A função set_updated_at() já existe (criada em migrations anteriores).
-- docs/30-contracts/02-db-schema-conventions.md §3
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_ticket_updated_at
  BEFORE UPDATE ON "ticket"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger: append-only em ticket_note
-- Bloqueia UPDATE e DELETE — tabela é append-only.
-- docs/30-contracts/02-db-schema-conventions.md §6
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_ticket_note_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'ticket_note is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_note_append_only
  BEFORE UPDATE OR DELETE ON "ticket_note"
  FOR EACH ROW EXECUTE FUNCTION reject_ticket_note_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: append-only em ticket_status_history
-- Bloqueia UPDATE e DELETE — tabela é append-only.
-- docs/30-contracts/02-db-schema-conventions.md §8
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_ticket_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'ticket_status_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_status_history_append_only
  BEFORE UPDATE OR DELETE ON "ticket_status_history"
  FOR EACH ROW EXECUTE FUNCTION reject_ticket_status_history_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: append-only em ticket_assignment_history
-- Bloqueia UPDATE e DELETE — tabela é append-only.
-- docs/30-contracts/02-db-schema-conventions.md §6
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_ticket_assignment_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'ticket_assignment_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ticket_assignment_history_append_only
  BEFORE UPDATE OR DELETE ON "ticket_assignment_history"
  FOR EACH ROW EXECUTE FUNCTION reject_ticket_assignment_history_mutation();
