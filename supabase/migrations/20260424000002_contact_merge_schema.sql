-- Migration: 20260424000002_contact_merge_schema
-- Task: T-1-07
-- Módulo: MOD-MERGE
-- Specs:
--   docs/20-domain/03-contact-merge-issues.md §3
--   docs/30-contracts/01-enums.md
--   docs/30-contracts/02-db-schema-conventions.md
--
-- Dependência: 20260424000001_contact_schema.sql
-- (enums contact_issue_kind e contact_issue_status já criados lá)

-- ---------------------------------------------------------------------------
-- T-1-07a: contact_issue
-- docs/20-domain/03-contact-merge-issues.md §3.1
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_issue" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Contato "foco" da pendência — CASCADE: se o contato for removido, issue vai junto
  "contact_id"            uuid NOT NULL REFERENCES "contact"("id") ON DELETE CASCADE,
  -- Outro contato envolvido (opcional — ex.: duplicata)
  "related_contact_id"    uuid REFERENCES "contact"("id") ON DELETE SET NULL,
  -- BR-IDENTITY: tipo canônico de pendência
  "kind"                  contact_issue_kind NOT NULL,
  "status"                contact_issue_status NOT NULL DEFAULT 'open',
  "detail"                text NOT NULL,
  -- Dados estruturados: ex. { email: '...', phone: '...' }
  "payload"               jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- 'identity_resolver' | 'automation' | 'integration' — NULL se aberta por usuário
  "opened_by_system"      text,
  "opened_by_user_id"     uuid REFERENCES "user_account"("id") ON DELETE SET NULL,
  "resolved_by_user_id"   uuid REFERENCES "user_account"("id") ON DELETE SET NULL,
  -- INV-MERGE-05: resolution obrigatória quando status = 'resolved' (guard na Server Action)
  "resolution"            text,
  "resolved_at"           timestamptz,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  "updated_at"            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_contact_issue_contact_status"
  ON "contact_issue" ("contact_id", "status");

-- Índice parcial para busca eficiente de pendências abertas
CREATE INDEX IF NOT EXISTS "idx_contact_issue_open"
  ON "contact_issue" ("status")
  WHERE "status" = 'open';

-- ---------------------------------------------------------------------------
-- T-1-07b: contact_merge
-- docs/20-domain/03-contact-merge-issues.md §3.2
--
-- Imutável após criado: sem updated_at por design.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_merge" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: não pode deletar contato que participou de merge — preserva histórico
  "principal_contact_id"  uuid NOT NULL REFERENCES "contact"("id") ON DELETE RESTRICT,
  "secondary_contact_id"  uuid NOT NULL REFERENCES "contact"("id") ON DELETE RESTRICT,
  "reason"                text NOT NULL,
  -- INV-MERGE-06: merge vinculado à issue preenche issue_id e resolve a issue
  "issue_id"              uuid REFERENCES "contact_issue"("id") ON DELETE SET NULL,
  -- RESTRICT: merge não some se usuário for desativado — trilha de auditoria
  "merged_by_user_id"     uuid NOT NULL REFERENCES "user_account"("id") ON DELETE RESTRICT,
  -- Contagem por tabela: { transaction: 3, conversation: 1, ... }
  "reassigned_tables"     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- BR-MERGE: estado do principal ANTES do merge (imutável — nunca UPDATE neste campo)
  "principal_snapshot"    jsonb NOT NULL,
  -- BR-MERGE: estado do secundário ANTES do merge (imutável — nunca UPDATE neste campo)
  "secondary_snapshot"    jsonb NOT NULL,
  -- SET quando contact_merge_undo é criado
  "undone_at"             timestamptz,
  "created_at"            timestamptz NOT NULL DEFAULT now(),
  -- INV-MERGE-01: contatos distintos
  CONSTRAINT "ck_contact_merge_distinct"
    CHECK ("principal_contact_id" <> "secondary_contact_id")
);

CREATE INDEX IF NOT EXISTS "idx_contact_merge_principal"
  ON "contact_merge" ("principal_contact_id");

CREATE INDEX IF NOT EXISTS "idx_contact_merge_secondary"
  ON "contact_merge" ("secondary_contact_id");

-- ---------------------------------------------------------------------------
-- T-1-07c: contact_merge_undo
-- docs/20-domain/03-contact-merge-issues.md §3.3
--
-- Imutável: sem updated_at por design.
-- INV-MERGE-04: uq_contact_merge_undo_merge garante undo único por merge.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "contact_merge_undo" (
  "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- RESTRICT: não pode deletar merge que foi desfeito — preserva trilha
  "merge_id"          uuid NOT NULL REFERENCES "contact_merge"("id") ON DELETE RESTRICT,
  "reason"            text NOT NULL,
  -- BR-RBAC: somente 'admin' ou 'financial' podem executar undo (guard na Server Action)
  -- RESTRICT: auditoria não some se usuário for desativado
  "undone_by_user_id" uuid NOT NULL REFERENCES "user_account"("id") ON DELETE RESTRICT,
  -- Tabelas cujas FKs foram revertidas para o contato secundário
  "reverted_tables"   jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at"        timestamptz NOT NULL DEFAULT now(),
  -- INV-MERGE-04: undo ocorre no máximo uma vez por merge
  CONSTRAINT "uq_contact_merge_undo_merge" UNIQUE ("merge_id")
);

-- ---------------------------------------------------------------------------
-- Trigger: set_updated_at para contact_issue
-- A função set_updated_at() já existe (criada nas migrations anteriores).
-- docs/30-contracts/02-db-schema-conventions.md §3
-- ---------------------------------------------------------------------------

CREATE TRIGGER set_contact_issue_updated_at
  BEFORE UPDATE ON "contact_issue"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
