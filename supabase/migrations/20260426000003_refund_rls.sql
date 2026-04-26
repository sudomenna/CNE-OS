-- Migration: 20260426000003_refund_rls
-- Task: RLS Fase 1 para tabelas refund (FLOW-07 refund end-to-end)
--
-- Mesmo padrão de 20260423000002_rls_fase1.sql:
-- SELECT: qualquer operador autenticado com conta ativa.
-- INSERT/UPDATE/DELETE: via service role (app server) — bypassa RLS no Supabase.
-- Fase 2 adicionará escopo por brand_id.
--
-- docs/10-architecture/06-auth-rbac-audit.md §2
-- docs/30-contracts/02-db-schema-conventions.md §5
-- FLOW-07 (refund end-to-end)

-- ---------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de reembolso
-- ---------------------------------------------------------------------------

ALTER TABLE refund                ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_effect_log     ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund_status_history ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SELECT policies: usuário autenticado com conta ativa pode ler tudo (Fase 1)
-- auth_has_active_account() definida em 20260423000002_rls_fase1.sql
-- ---------------------------------------------------------------------------

CREATE POLICY "authenticated_select_refund"
  ON refund
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_refund_effect_log"
  ON refund_effect_log
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_refund_status_history"
  ON refund_status_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());
