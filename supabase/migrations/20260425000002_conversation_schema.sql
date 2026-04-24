-- Migration: 20260425000002_conversation_schema
-- Task: T-3-01
-- Módulo: MOD-INBOX
-- Specs:
--   docs/20-domain/05-conversation-inbox.md §3
--   docs/30-contracts/01-enums.md  (channel_kind, conversation_status)
--   docs/30-contracts/02-db-schema-conventions.md

-- ---------------------------------------------------------------------------
-- Enums — docs/30-contracts/01-enums.md (Inbox / Ticket)
-- ---------------------------------------------------------------------------

-- channel_kind: tipos canônicos de canal
CREATE TYPE "channel_kind" AS ENUM ('whatsapp', 'instagram', 'email');

-- conversation_status: estados de uma conversa (criado aqui para T-3-02 reutilizar)
CREATE TYPE "conversation_status" AS ENUM (
  'open',
  'waiting_customer',
  'waiting_team',
  'closed'
);

-- ---------------------------------------------------------------------------
-- T-3-01: channel — tipos de canal de comunicação disponíveis
-- docs/20-domain/05-conversation-inbox.md §3
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "channel" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind"       channel_kind NOT NULL,
  -- nome legível: 'WhatsApp Business', 'Instagram Direct', 'E-mail'
  "name"       text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

-- cada kind é único — apenas um registro por tipo canônico
CREATE UNIQUE INDEX IF NOT EXISTS "uq_channel_kind"
  ON "channel" ("kind");

-- ---------------------------------------------------------------------------
-- T-3-01: channel_account — instância configurada de canal vinculada a uma marca
-- docs/20-domain/05-conversation-inbox.md §3
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "channel_account" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id"   uuid NOT NULL REFERENCES "channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "brand_id"     uuid NOT NULL REFERENCES "brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  -- identificador no provedor: phone number id, instagram account id, endereço de e-mail
  "external_id"  text NOT NULL,
  "display_name" text,
  "is_active"    boolean NOT NULL DEFAULT true,
  -- credenciais/tokens do provedor — criptografar na Fase 2
  "credentials"  jsonb,
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

-- INV-INBOX: par (canal, marca, external_id) deve ser único
CREATE UNIQUE INDEX IF NOT EXISTS "uq_channel_account"
  ON "channel_account" ("channel_id", "brand_id", "external_id");

CREATE INDEX IF NOT EXISTS "idx_channel_account_brand"
  ON "channel_account" ("brand_id");

CREATE INDEX IF NOT EXISTS "idx_channel_account_channel"
  ON "channel_account" ("channel_id");

-- ---------------------------------------------------------------------------
-- Trigger: set_updated_at para channel_account
-- docs/30-contracts/02-db-schema-conventions.md §3
-- A função set_updated_at() já deve existir das migrations anteriores,
-- mas é recriada de forma idempotente (CREATE OR REPLACE) por segurança.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_channel_account_updated_at
  BEFORE UPDATE ON "channel_account"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
