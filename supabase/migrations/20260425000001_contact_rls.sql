-- Migration: 20260425000001_contact_rls
-- Task: T-2-00 — RLS Fase 1 para tabelas contact (Sprint 2 pré-requisito)
--
-- Mesmo padrão de 20260423000002_rls_fase1.sql:
-- SELECT: qualquer operador autenticado com conta ativa.
-- INSERT/UPDATE/DELETE: via service role (app server) — bypassa RLS no Supabase.
-- Fase 2 adicionará escopo por brand_id.
--
-- docs/10-architecture/06-auth-rbac-audit.md §2
-- docs/30-contracts/02-db-schema-conventions.md §5

-- ---------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de contato
-- ---------------------------------------------------------------------------

ALTER TABLE contact                ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_phone          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_email          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_document       ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tag            ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_custom_field   ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_note           ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_issue          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_merge          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_merge_undo     ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SELECT policies: usuário autenticado com conta ativa pode ler tudo (Fase 1)
-- auth_has_active_account() definida em 20260423000002_rls_fase1.sql
-- ---------------------------------------------------------------------------

CREATE POLICY "authenticated_select_contact"
  ON contact
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_phone"
  ON contact_phone
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_email"
  ON contact_email
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_document"
  ON contact_document
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_tag"
  ON contact_tag
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_custom_field"
  ON contact_custom_field
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_note"
  ON contact_note
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_status_history"
  ON contact_status_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_issue"
  ON contact_issue
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_merge"
  ON contact_merge
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_contact_merge_undo"
  ON contact_merge_undo
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());
