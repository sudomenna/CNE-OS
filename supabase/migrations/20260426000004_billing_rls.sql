-- Migration: 20260426000004_billing_rls
-- Task: RLS Fase 1 para tabelas billing (Sprint 13 pré-requisito)
--
-- Mesmo padrão de 20260423000002_rls_fase1.sql:
-- SELECT: qualquer operador autenticado com conta ativa.
-- INSERT/UPDATE/DELETE: via service role (app server) — bypassa RLS no Supabase.
-- Fase 2 adicionará escopo por brand_id.
--
-- docs/10-architecture/06-auth-rbac-audit.md §2
-- docs/30-contracts/02-db-schema-conventions.md §5
-- FLOW-11 (subscription cycle)

-- ---------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de billing
-- ---------------------------------------------------------------------------

ALTER TABLE subscription                ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE installment_status_history  ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SELECT policies: usuário autenticado com conta ativa pode ler tudo (Fase 1)
-- auth_has_active_account() definida em 20260423000002_rls_fase1.sql
-- ---------------------------------------------------------------------------

CREATE POLICY "authenticated_select_subscription"
  ON subscription
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_installment"
  ON installment
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_subscription_status_history"
  ON subscription_status_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_installment_status_history"
  ON installment_status_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());
