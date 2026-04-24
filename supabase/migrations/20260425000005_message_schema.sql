-- Migration: 20260425000005_message_schema
-- Task: T-3-03
-- Módulo: MOD-INBOX
-- Specs:
--   docs/20-domain/05-conversation-inbox.md §3
--   docs/30-contracts/02-db-schema-conventions.md §3, §11, §14
--   INV-INBOX-02: external_message_id único por conversa quando informado

-- ---------------------------------------------------------------------------
-- message — mensagem inbound/outbound dentro de uma conversa
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "message" (
  "id"                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK → conversation(id): RESTRICT porque mensagem não existe sem conversa
  "conversation_id"      uuid        NOT NULL
    REFERENCES "conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,

  -- direction: valores válidos 'inbound' | 'outbound'
  "direction"            text        NOT NULL
    CONSTRAINT ck_message_direction CHECK (direction IN ('inbound', 'outbound')),

  "body"                 text        NOT NULL,

  -- external_message_id: ID único no provedor (WhatsApp message id, Instagram
  -- message id, e-mail Message-Id). NULL quando mensagem é interna/sem provedor.
  "external_message_id"  text        NULL,

  -- actor_user_id: preenchido em outbound por humano
  -- SET NULL: usuário pode ser removido; mensagem permanece com actor_user_id = NULL
  "actor_user_id"        uuid        NULL
    REFERENCES "user_account"("id") ON DELETE SET NULL ON UPDATE CASCADE,

  -- actor_system: preenchido em outbound/inbound por sistema ('whatsapp-webhook', etc.)
  "actor_system"         text        NULL,

  -- sent_at: quando o provedor confirmou entrega (nullable — pode não ter confirmação)
  "sent_at"              timestamptz NULL,

  "created_at"           timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Índices de suporte
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_message_conversation"
  ON "message" ("conversation_id");

CREATE INDEX IF NOT EXISTS "idx_message_created_at"
  ON "message" ("created_at");

-- ---------------------------------------------------------------------------
-- INV-INBOX-02: índice único PARCIAL — garante idempotência de mensagens externas.
-- Para um dado conversation_id, external_message_id é único quando não-nulo.
-- Reentrega do mesmo webhook com o mesmo external_message_id é silenciosamente
-- ignorada pelo ON CONFLICT na camada de aplicação.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "uq_message_external"
  ON "message" ("conversation_id", "external_message_id")
  WHERE external_message_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- message_attachment — anexo (arquivo) vinculado a mensagem
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "message_attachment" (
  "id"          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- FK → message(id): CASCADE porque anexo não existe sem mensagem
  "message_id"  uuid        NOT NULL
    REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE,

  -- kind: valores válidos conforme attachment_kind
  "kind"        text        NOT NULL
    CONSTRAINT ck_message_attachment_kind
      CHECK (kind IN ('image', 'video', 'audio', 'document', 'sticker')),

  "url"         text        NOT NULL,
  "mime_type"   text        NULL,
  "size_bytes"  bigint      NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Índice de suporte
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "idx_message_attachment_message"
  ON "message_attachment" ("message_id");
