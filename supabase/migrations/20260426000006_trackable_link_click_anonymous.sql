-- Migration: trackable_link_click_anonymous
-- FLOW-14 (Campaign Attribution) — tabela de cliques anônimos para resolução retroativa (E-03).
-- Purge de registros com mais de 90 dias é feito via pg_cron (ver comentário ao final).

CREATE TABLE IF NOT EXISTS trackable_link_click_anonymous (
  id                uuid        NOT NULL DEFAULT gen_random_uuid(),
  trackable_link_id uuid        NOT NULL,
  session_id        text        NOT NULL,
  utm_snapshot      jsonb       NOT NULL,
  ip                text,
  user_agent        text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT trackable_link_click_anonymous_pkey PRIMARY KEY (id),

  -- CASCADE: link removido → cliques anônimos sem propósito (FLOW-14 passo 2)
  CONSTRAINT fk_anon_click_trackable_link
    FOREIGN KEY (trackable_link_id)
    REFERENCES trackable_link (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Garante idempotência do redirector (double-submit / retry na mesma sessão+link)
CREATE UNIQUE INDEX IF NOT EXISTS uq_anon_click_session_link
  ON trackable_link_click_anonymous (session_id, trackable_link_id);

-- Lookup por sessão+tempo: job de resolução retroativa (FLOW-14 E-03)
CREATE INDEX IF NOT EXISTS idx_anon_click_session
  ON trackable_link_click_anonymous (session_id, created_at);

-- Lookup por link: métricas de CTR anônimo
CREATE INDEX IF NOT EXISTS idx_anon_click_link
  ON trackable_link_click_anonymous (trackable_link_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Fase 1: usuários autenticados podem ler (operadores internos).
-- Escrita ocorre apenas pelo redirector (service role / edge function).
-- ---------------------------------------------------------------------------
ALTER TABLE trackable_link_click_anonymous ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_select_trackable_link_click_anonymous
  ON trackable_link_click_anonymous
  FOR SELECT
  TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- Purge de registros antigos (> 90 dias) — FLOW-14 E-02
--
-- Recomendação: agendar via pg_cron (menos overhead que trigger por INSERT):
--
--   SELECT cron.schedule(
--     'purge_anon_clicks_90d',
--     '0 3 * * *',   -- diariamente às 03h UTC
--     $$
--       DELETE FROM trackable_link_click_anonymous
--       WHERE created_at < now() - INTERVAL '90 days';
--     $$
--   );
--
-- O cron NÃO é criado aqui para evitar dependência de pg_cron ativo no ambiente.
-- Criar manualmente após confirmar extensão disponível no Supabase.
-- ---------------------------------------------------------------------------
