-- Migration: 20260426000002_entitlement_rls
-- Task: RLS Fase 1 para tabelas entitlement (FLOW-06 — entitlement update)
--
-- Mesmo padrão de 20260423000002_rls_fase1.sql:
-- SELECT: qualquer operador autenticado com conta ativa.
-- INSERT/UPDATE/DELETE: via service role (app server) — bypassa RLS no Supabase.
-- Fase 2 adicionará escopo por brand_id.
--
-- docs/10-architecture/06-auth-rbac-audit.md §2
-- docs/30-contracts/02-db-schema-conventions.md §5
-- FLOW-06 (entitlement update)

-- ---------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de entitlement
-- ---------------------------------------------------------------------------

ALTER TABLE customer_entitlement        ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlement_status_history  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SELECT policies: usuário autenticado com conta ativa pode ler tudo (Fase 1)
-- auth_has_active_account() definida em 20260423000002_rls_fase1.sql
-- ---------------------------------------------------------------------------

CREATE POLICY "authenticated_select_customer_entitlement"
  ON customer_entitlement
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_entitlement_history"
  ON entitlement_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_entitlement_status_history"
  ON entitlement_status_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());
