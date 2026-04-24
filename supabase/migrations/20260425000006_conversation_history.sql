-- Migration: 20260425000006_conversation_history
-- Task: T-3-04
-- Módulo: MOD-INBOX
-- Specs:
--   docs/20-domain/05-conversation-inbox.md §3
--   docs/30-contracts/02-db-schema-conventions.md §6, §8
--   INV-INBOX-06: cada transição de status / mudança de responsável gera linha nas tabelas de histórico

-- ---------------------------------------------------------------------------
-- conversation_internal_note — nota interna (não visível ao contato)
-- docs/20-domain/05-conversation-inbox.md §3
-- Append-only: trigger abaixo bloqueia UPDATE e DELETE.
-- docs/30-contracts/02-db-schema-conventions.md §6
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "conversation_internal_note" (
  "id"              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK → conversation(id): RESTRICT — preservar notas mesmo após soft-delete da conversa
  "conversation_id" uuid        NOT NULL
    REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- author_user_id: quem criou a nota — RESTRICT: auditoria preservada
  "author_user_id"  uuid        NOT NULL
    REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  "body"            text        NOT NULL,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_conversation_internal_note_conversation"
  ON "conversation_internal_note" ("conversation_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- conversation_assignment_history — histórico append-only de atribuições
-- docs/20-domain/05-conversation-inbox.md §3
-- INV-INBOX-06: cada mudança de assigned_user_id gera linha aqui.
-- Append-only: trigger abaixo bloqueia UPDATE e DELETE.
-- docs/30-contracts/02-db-schema-conventions.md §6
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "conversation_assignment_history" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK → conversation(id): RESTRICT — preservar histórico mesmo após soft-delete da conversa
  "conversation_id"     uuid        NOT NULL
    REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- from_user_id: responsável anterior (NULL = primeira atribuição)
  -- SET NULL: usuário pode ser removido; linha de histórico permanece
  "from_user_id"        uuid        NULL
    REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  -- to_user_id: novo responsável (NULL = conversa foi desatribuída)
  -- SET NULL: usuário pode ser removido; linha de histórico permanece
  "to_user_id"          uuid        NULL
    REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  -- assigned_by_user_id: quem efetuou a atribuição — RESTRICT: auditoria preservada
  "assigned_by_user_id" uuid        NOT NULL
    REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_conversation_assignment_history_conversation"
  ON "conversation_assignment_history" ("conversation_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- conversation_status_history — histórico append-only de transições de status
-- docs/20-domain/05-conversation-inbox.md §3
-- INV-INBOX-06: cada transição de status gera linha aqui.
-- Append-only: trigger abaixo bloqueia UPDATE e DELETE.
-- docs/30-contracts/02-db-schema-conventions.md §8
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "conversation_status_history" (
  "id"                  uuid                PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK → conversation(id): RESTRICT — preservar histórico mesmo após soft-delete da conversa
  "conversation_id"     uuid                NOT NULL
    REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- from_status: status anterior (NULL = criação com status inicial)
  "from_status"         conversation_status NULL,

  -- to_status: novo status da conversa
  "to_status"           conversation_status NOT NULL,

  -- changed_by_user_id: quem efetuou a mudança — RESTRICT: auditoria preservada
  "changed_by_user_id"  uuid                NOT NULL
    REFERENCES "user_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- reason: motivo opcional da mudança (ex: 'Resolvido pelo atendente')
  "reason"              text                NULL,

  "created_at"          timestamptz         NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_conversation_status_history_conversation"
  ON "conversation_status_history" ("conversation_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- Trigger: append-only em conversation_internal_note
-- Bloqueia UPDATE e DELETE — tabela é append-only por design.
-- docs/30-contracts/02-db-schema-conventions.md §6
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_conversation_internal_note_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'conversation_internal_note is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_internal_note_append_only
  BEFORE UPDATE OR DELETE ON "conversation_internal_note"
  FOR EACH ROW EXECUTE FUNCTION reject_conversation_internal_note_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: append-only em conversation_assignment_history
-- Bloqueia UPDATE e DELETE — tabela é append-only por design.
-- docs/30-contracts/02-db-schema-conventions.md §6
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_conversation_assignment_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'conversation_assignment_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_assignment_history_append_only
  BEFORE UPDATE OR DELETE ON "conversation_assignment_history"
  FOR EACH ROW EXECUTE FUNCTION reject_conversation_assignment_history_mutation();

-- ---------------------------------------------------------------------------
-- Trigger: append-only em conversation_status_history
-- Bloqueia UPDATE e DELETE — tabela é append-only por design.
-- docs/30-contracts/02-db-schema-conventions.md §8
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_conversation_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'conversation_status_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_status_history_append_only
  BEFORE UPDATE OR DELETE ON "conversation_status_history"
  FOR EACH ROW EXECUTE FUNCTION reject_conversation_status_history_mutation();
