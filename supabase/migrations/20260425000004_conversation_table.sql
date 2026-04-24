-- Migration: 20260425000004_conversation_table
-- Task: T-3-02
-- Módulo: MOD-INBOX
-- Specs:
--   docs/20-domain/05-conversation-inbox.md §3
--   docs/30-contracts/02-db-schema-conventions.md §3, §4, §14
--   INV-INBOX-01: no máximo 1 conversa ativa por (contact_id, channel_account_id)

-- ---------------------------------------------------------------------------
-- conversation — fluxo de mensagens entre contato e channel_account
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "conversation" (
  "id"                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK → contact(id): RESTRICT porque uma conversa não pode existir sem contato
  "contact_id"          uuid         NOT NULL
    REFERENCES "contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- FK → channel_account(id): RESTRICT pelo mesmo motivo
  "channel_account_id"  uuid         NOT NULL
    REFERENCES "channel_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- conversation_status já criado em 20260425000002_conversation_schema
  "status"              conversation_status NOT NULL DEFAULT 'open',

  -- assigned_user_id é da conversa, não do contato (INV-INBOX-04)
  -- SET NULL: usuário pode ser removido; conversa permanece não-atribuída
  "assigned_user_id"    uuid         NULL
    REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  -- ID do thread no provedor externo (ex: WhatsApp conversation id)
  "external_thread_id"  text         NULL,

  -- Atualizado pelo app ao receber/enviar mensagem
  "last_message_at"     timestamptz  NULL,

  -- brand_id pode ser NULL até classificação manual (INV-INBOX-05)
  "brand_id"            uuid         NULL
    REFERENCES "brand"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  "created_at"          timestamptz  NOT NULL DEFAULT now(),
  "updated_at"          timestamptz  NOT NULL DEFAULT now(),
  "deleted_at"          timestamptz  NULL
);

-- ---------------------------------------------------------------------------
-- Índices de suporte
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_conversation_contact_channel"
  ON "conversation" ("contact_id", "channel_account_id");

CREATE INDEX IF NOT EXISTS "idx_conversation_status"
  ON "conversation" ("status");

CREATE INDEX IF NOT EXISTS "idx_conversation_assigned"
  ON "conversation" ("assigned_user_id");

CREATE INDEX IF NOT EXISTS "idx_conversation_brand"
  ON "conversation" ("brand_id");

CREATE INDEX IF NOT EXISTS "idx_conversation_last_message"
  ON "conversation" ("last_message_at");

-- ---------------------------------------------------------------------------
-- INV-INBOX-01: índice único parcial — no máximo 1 conversa ativa por par
-- (contact_id, channel_account_id) quando status != 'closed' e não deletada.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "uq_conversation_active"
  ON "conversation" ("contact_id", "channel_account_id")
  WHERE status != 'closed' AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Trigger: set_updated_at para conversation
-- A função set_updated_at() já existe das migrations anteriores (idempotente).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_conversation_updated_at
  BEFORE UPDATE ON "conversation"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
