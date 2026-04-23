-- Migration: 20260423000002_rls_fase1
-- Task: T-0-08 — Supabase RLS policies Fase 1 (marca + papel)
--
-- Fase 1: permissiva por papel — todos os operadores autenticados com conta ativa
-- podem fazer SELECT em todas as tabelas de domínio.
-- INSERT/UPDATE/DELETE via service role (app server) — service role bypassa RLS no Supabase.
-- Fase 2 adicionará escopo por brand_id.
--
-- docs/10-architecture/06-auth-rbac-audit.md §2
-- docs/30-contracts/02-db-schema-conventions.md §5

-- ---------------------------------------------------------------------------
-- Habilitar RLS em todas as tabelas de domínio
-- ---------------------------------------------------------------------------

ALTER TABLE brand              ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_entity       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_legal_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_account       ENABLE ROW LEVEL SECURITY;
ALTER TABLE role               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_role          ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission         ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permission    ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE timeline_event     ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_log        ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper function: verifica se o usuário autenticado tem conta ativa
--
-- SECURITY DEFINER: executa como o owner da função (postgres), permitindo
-- acessar user_account sem bypassar o RLS da própria tabela user_account
-- — a função já contém o predicado completo internamente.
-- SET search_path = public: mitiga ataques de search_path injection.
--
-- docs/30-contracts/02-db-schema-conventions.md §5
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION auth_has_active_account()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_account
    WHERE id          = auth.uid()
      AND is_active   = true
      AND deleted_at  IS NULL
  );
$$;

-- ---------------------------------------------------------------------------
-- SELECT policies: usuário autenticado com conta ativa pode ler tudo (Fase 1)
-- Fase 2 adicionará filtro por brand_id via brand membership.
-- ---------------------------------------------------------------------------

CREATE POLICY "authenticated_select_brand"
  ON brand
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_legal_entity"
  ON legal_entity
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_brand_legal_entity"
  ON brand_legal_entity
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_user_account"
  ON user_account
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_role"
  ON role
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_user_role"
  ON user_role
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_permission"
  ON permission
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_role_permission"
  ON role_permission
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_audit_log"
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_timeline_event"
  ON timeline_event
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

CREATE POLICY "authenticated_select_webhook_log"
  ON webhook_log
  FOR SELECT
  TO authenticated
  USING (auth_has_active_account());

-- ---------------------------------------------------------------------------
-- INSERT policies para tabelas append-only
--
-- audit_log e timeline_event: operadores autenticados podem inserir
-- (append-only enforçado por trigger de DB que rejeita UPDATE/DELETE).
-- webhook_log: gerenciado pelo app server (service role); authenticated
-- não insere diretamente.
--
-- Para as demais tabelas mutáveis (brand, legal_entity, etc.):
-- sem policy de INSERT/UPDATE/DELETE = bloqueado para authenticated/anon.
-- Mutations chegam via service role (app server), que bypassa RLS no Supabase.
-- ---------------------------------------------------------------------------

-- audit_log: INSERT liberado para authenticated (append-only via trigger)
-- docs/30-contracts/02-db-schema-conventions.md §6
CREATE POLICY "authenticated_insert_audit_log"
  ON audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_active_account());

-- timeline_event: INSERT liberado para authenticated (append-only via trigger)
-- docs/20-domain/04-timeline.md §3 (INV-TIMELINE-01)
CREATE POLICY "authenticated_insert_timeline_event"
  ON timeline_event
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_has_active_account());

-- NOTE: contact table RLS será adicionada em Sprint 1 quando a tabela existir (T-1-xx).
-- NOTE: Fase 2 adicionará policies de SELECT filtradas por brand_id.
