-- Migration: 20260424000001_contact_schema
-- Tasks: T-1-01, T-1-02, T-1-03, T-1-04, T-1-05
-- Módulo: MOD-CONTACT
-- Specs:
--   docs/20-domain/02-contact-identity.md §3
--   docs/30-contracts/01-enums.md
--   docs/30-contracts/02-db-schema-conventions.md

-- ---------------------------------------------------------------------------
-- Enums — docs/30-contracts/01-enums.md (Contato)
-- ---------------------------------------------------------------------------

CREATE TYPE "contact_status" AS ENUM ('active', 'inactive', 'invalid', 'blocked');
CREATE TYPE "contact_phone_status" AS ENUM ('primary', 'secondary', 'whatsapp_valid', 'no_whatsapp', 'invalid');
CREATE TYPE "contact_email_status" AS ENUM ('primary', 'alternative', 'invalid', 'unsubscribed');
CREATE TYPE "contact_classification" AS ENUM ('lead', 'customer', 'student', 'paid_lead');
CREATE TYPE "contact_issue_kind" AS ENUM ('email_duplicate', 'phone_conflict', 'document_mismatch', 'source_divergence', 'other');
CREATE TYPE "contact_issue_status" AS ENUM ('open', 'resolved', 'ignored');

-- ---------------------------------------------------------------------------
-- T-1-01: contact (tabela principal do agregado)
-- docs/20-domain/02-contact-identity.md §3.1
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "full_name"       text NOT NULL,
  -- BR-IDENTITY: CPF opcional; único entre contatos vivos (índice parcial abaixo)
  "cpf"             varchar(11),
  "status"          contact_status NOT NULL DEFAULT 'active',
  "classification"  contact_classification NOT NULL DEFAULT 'lead',
  "birth_date"      date,
  -- BR-IDENTITY: origem canônica ('checkout'|'message'|'import'|'manual'|'integration')
  "origin"          text,
  -- BR-MERGE: contatos mesclados apontam para o principal
  "merged_into_id"  uuid REFERENCES "contact"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "notes_summary"   text,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now(),
  -- Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
  "deleted_at"      timestamptz,
  -- BR-IDENTITY: CPF com exatamente 11 dígitos numéricos ou nulo
  CONSTRAINT "ck_contact_cpf_length" CHECK (
    "cpf" IS NULL OR (char_length("cpf") = 11 AND "cpf" ~ '^[0-9]{11}$')
  )
);

-- BR-IDENTITY: CPF único entre contatos vivos (não deletados, não mesclados)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contact_cpf"
  ON "contact" ("cpf")
  WHERE "cpf" IS NOT NULL AND "deleted_at" IS NULL AND "merged_into_id" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_contact_classification" ON "contact" ("classification");
CREATE INDEX IF NOT EXISTS "idx_contact_status"         ON "contact" ("status");
CREATE INDEX IF NOT EXISTS "idx_contact_merged_into"    ON "contact" ("merged_into_id");

-- ---------------------------------------------------------------------------
-- T-1-02: contact_phone
-- docs/20-domain/02-contact-identity.md §3.2
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_phone" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"          uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Formato E.164 normalizado antes de persistir (ex: +5511912345678)
  "e164"                varchar(16) NOT NULL,
  "status"              contact_phone_status NOT NULL DEFAULT 'secondary',
  "whatsapp_checked_at" timestamptz,
  "created_at"          timestamptz NOT NULL DEFAULT now(),
  "updated_at"          timestamptz NOT NULL DEFAULT now()
);

-- BR-IDENTITY: e164 único entre phones não-inválidos
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contact_phone_e164"
  ON "contact_phone" ("e164")
  WHERE "status" <> 'invalid';

-- Apenas um phone primary por contato
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contact_phone_primary"
  ON "contact_phone" ("contact_id")
  WHERE "status" = 'primary';

-- ---------------------------------------------------------------------------
-- T-1-03: contact_email
-- docs/20-domain/02-contact-identity.md §3.3
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_email" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"  uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email"       text NOT NULL,
  "status"      contact_email_status NOT NULL DEFAULT 'alternative',
  "verified_at" timestamptz,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

-- BR-IDENTITY: email único entre emails ativos (não inválidos / não descadastrados)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contact_email"
  ON "contact_email" ("email")
  WHERE "status" NOT IN ('invalid', 'unsubscribed');

-- Apenas um email primary por contato
CREATE UNIQUE INDEX IF NOT EXISTS "uq_contact_email_primary"
  ON "contact_email" ("contact_id")
  WHERE "status" = 'primary';

-- ---------------------------------------------------------------------------
-- T-1-04a: contact_document
-- docs/20-domain/02-contact-identity.md §3.4
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_document" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"  uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- kind livre para extensão sem migration: 'rg', 'cnh', 'passaporte', etc.
  "kind"        text NOT NULL,
  "value"       text NOT NULL,
  "issuer"      text,
  "created_at"  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_contact_document_contact" ON "contact_document" ("contact_id");

-- ---------------------------------------------------------------------------
-- T-1-04b: contact_tag
-- docs/20-domain/02-contact-identity.md §3.5
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_tag" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"  uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "tag"         text NOT NULL,
  "source"      text NOT NULL DEFAULT 'manual',
  "applied_by"  uuid REFERENCES "user_account"("id") ON DELETE SET NULL,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  -- Tag única por contato — INSERT duplicado falha (usar UPSERT na camada de domínio)
  CONSTRAINT "uq_contact_tag" UNIQUE ("contact_id", "tag")
);

-- ---------------------------------------------------------------------------
-- T-1-04c: contact_custom_field
-- docs/20-domain/02-contact-identity.md §3.6
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_custom_field" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"  uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- brand_id NULL = campo global; NOT NULL = campo específico da marca
  "brand_id"    uuid REFERENCES "brand"("id") ON DELETE CASCADE,
  "key"         text NOT NULL,
  "value"       jsonb NOT NULL DEFAULT 'null'::jsonb,
  "created_at"  timestamptz NOT NULL DEFAULT now(),
  "updated_at"  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "uq_contact_custom_field" UNIQUE ("contact_id", "brand_id", "key")
);

-- ---------------------------------------------------------------------------
-- T-1-05a: contact_note
-- docs/20-domain/02-contact-identity.md §3.7
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_note" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "contact_id"      uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- BR-RBAC: RESTRICT — nota não some se usuário for desativado
  "author_user_id"  uuid NOT NULL REFERENCES "user_account"("id") ON DELETE RESTRICT,
  "body"            text NOT NULL,
  "pinned"          boolean NOT NULL DEFAULT false,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "updated_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_contact_note_contact"
  ON "contact_note" ("contact_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- T-1-05b: contact_status_history  (APPEND-ONLY)
-- docs/20-domain/02-contact-identity.md §3.8
-- docs/30-contracts/02-db-schema-conventions.md §8
--
-- Sem updated_at (append-only por design).
-- Trigger abaixo bloqueia UPDATE e DELETE nesta tabela.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_status_history" (
  "id"                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: manter histórico mesmo se contato for soft-deleted
  "contact_id"          uuid NOT NULL REFERENCES "contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "from_status"         contact_status,
  "to_status"           contact_status NOT NULL,
  "from_classification" contact_classification,
  "to_classification"   contact_classification,
  "changed_by"          uuid REFERENCES "user_account"("id") ON DELETE SET NULL,
  "reason"              text,
  "created_at"          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_contact_status_history_contact"
  ON "contact_status_history" ("contact_id", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- Trigger: set_updated_at
-- Atualiza updated_at em cada UPDATE nas tabelas com essa coluna.
-- A função set_updated_at() já existe (criada na migration anterior).
-- docs/30-contracts/02-db-schema-conventions.md §3
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_contact_updated_at
  BEFORE UPDATE ON "contact"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_contact_phone_updated_at
  BEFORE UPDATE ON "contact_phone"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_contact_email_updated_at
  BEFORE UPDATE ON "contact_email"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_contact_custom_field_updated_at
  BEFORE UPDATE ON "contact_custom_field"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_contact_note_updated_at
  BEFORE UPDATE ON "contact_note"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Trigger: append_only_contact_status_history
-- Bloqueia UPDATE e DELETE em contact_status_history.
-- docs/30-contracts/02-db-schema-conventions.md §8
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_contact_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'contact_status_history is append-only — UPDATE and DELETE are not allowed. (table: %, op: %)',
    TG_TABLE_NAME,
    TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contact_status_history_append_only
  BEFORE UPDATE OR DELETE ON "contact_status_history"
  FOR EACH ROW EXECUTE FUNCTION reject_contact_status_history_mutation();
