-- Migration: 20260426000005_automation_rls
-- Task: RLS Fase 1 para tabelas automation (Sprint 13 pré-requisito)
--
-- Mesmo padrão de 20260423000002_rls_fase1.sql e 20260425000001_contact_rls.sql:
-- SELECT: qualquer operador autenticado com conta ativa.
-- INSERT/UPDATE/DELETE: via service role (app server) — bypassa RLS no Supabase.
-- Fase 2 adicionará escopo por brand_id.
--
-- docs/10-architecture/06-auth-rbac-audit.md §2
-- docs/30-contracts/02-db-schema-conventions.md §5
-- docs/20-domain/15-automation.md

-- ---------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de automation
-- ---------------------------------------------------------------------------

ALTER TABLE automation_flow           ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_node           ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_trigger        ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_condition      ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_action         ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_execution      ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_execution_log  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SELECT policies: usuário autenticado com conta ativa pode ler tudo (Fase 1)
-- auth_has_active_account() definida em 20260423000002_rls_fase1.sql
-- ---------------------------------------------------------------------------

CREATE POLICY "authenticated_select_automation_flow"
  ON automation_flow
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_automation_node"
  ON automation_node
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_automation_trigger"
  ON automation_trigger
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_automation_condition"
  ON automation_condition
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_automation_action"
  ON automation_action
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_automation_execution"
  ON automation_execution
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_automation_execution_log"
  ON automation_execution_log
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());
