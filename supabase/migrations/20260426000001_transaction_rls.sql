-- Migration: 20260426000001_transaction_rls
-- Task: RLS Fase 1 para tabelas transaction (módulo MOD-TRANSACTION)
--
-- Mesmo padrão de 20260423000002_rls_fase1.sql e 20260425000001_contact_rls.sql:
-- SELECT: qualquer operador autenticado com conta ativa.
-- INSERT/UPDATE/DELETE: via service role (app server) — bypassa RLS no Supabase.
-- Fase 2 adicionará escopo por brand_id.
--
-- docs/10-architecture/06-auth-rbac-audit.md §2
-- docs/30-contracts/02-db-schema-conventions.md §5
-- FLOW-05 (external sale ingest) e FLOW-07 (refund e2e)

-- ---------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de transação
-- ---------------------------------------------------------------------------

ALTER TABLE transaction                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_snapshot                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_snapshot_flag_history    ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_item                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_status_history           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SELECT policies: usuário autenticado com conta ativa pode ler tudo (Fase 1)
-- auth_has_active_account() definida em 20260423000002_rls_fase1.sql
-- ---------------------------------------------------------------------------

CREATE POLICY "authenticated_select_transaction"
  ON transaction
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_transaction_snapshot"
  ON transaction_snapshot
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_transaction_snapshot_flag_history"
  ON transaction_snapshot_flag_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_transaction_item"
  ON transaction_item
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_transaction_status_history"
  ON transaction_status_history
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());
