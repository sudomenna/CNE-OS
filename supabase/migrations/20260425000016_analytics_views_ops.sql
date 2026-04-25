-- T-10-02: Analytics Views — v_funnel_conversion, v_inbox_sla, v_campaign_roi
-- Sprint 10 | docs/20-domain/15-analytics-ops.md
-- Requer: user_brand_ids() criada em 20260425000015_analytics_rbac_helpers.sql

-- ---------------------------------------------------------------------------
-- v_funnel_conversion
-- View sobre funnel_entry com join para funnel.
-- Mostra conversão por estágio com cycle_time_days calculado.
-- RLS: filtra por user_brand_ids() sobre funnel.brand_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_funnel_conversion AS
SELECT
  f.id                                                        AS funnel_id,
  f.name                                                      AS funnel_name,
  f.brand_id                                                  AS brand_id,
  fe.contact_id,
  fe.label,
  fe.current_stage_id,
  fe.score,
  fe.entry_date,
  fe.entry_origin,
  fe.entry_campaign_id,
  fe.conversion_campaign_id,
  fe.created_at,
  -- cycle_time_days: dias desde a entrada até agora
  -- se convertido (label = 'won') e updated_at disponível usamos updated_at como proxy
  -- BR-FUNNEL-OPPORTUNITY: entry_date é a referência canônica de início do ciclo
  CASE
    WHEN fe.label = 'won'
      THEN EXTRACT(EPOCH FROM (fe.updated_at - fe.entry_date)) / 86400
    ELSE
      EXTRACT(EPOCH FROM (now() - fe.entry_date)) / 86400
  END                                                         AS cycle_time_days
FROM funnel_entry fe
JOIN funnel f ON f.id = fe.funnel_id
WHERE f.brand_id = ANY(user_brand_ids())
  AND f.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- v_inbox_sla
-- View sobre conversation com join para channel_account.
-- Campos calculados: response_time_minutes, is_overdue.
-- RLS: filtra por user_brand_ids() sobre brand_id resolvido via COALESCE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_inbox_sla AS
SELECT
  c.id,
  COALESCE(c.brand_id, ca.brand_id)                          AS brand_id,
  c.contact_id,
  c.channel_account_id,
  c.status,
  c.assigned_user_id,
  c.last_message_at,
  c.created_at,
  c.updated_at,
  -- response_time_minutes: tempo entre criação e última mensagem
  CASE
    WHEN c.last_message_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (c.last_message_at - c.created_at)) / 60
    ELSE NULL
  END                                                         AS response_time_minutes,
  -- is_overdue: conversa aberta sem resposta por mais de 24 horas
  CASE
    WHEN c.status = 'open' AND c.created_at < now() - INTERVAL '24 hours'
      THEN true
    ELSE false
  END                                                         AS is_overdue
FROM conversation c
JOIN channel_account ca ON ca.id = c.channel_account_id
WHERE COALESCE(c.brand_id, ca.brand_id) = ANY(user_brand_ids())
  AND c.deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- v_campaign_roi
-- View agregada sobre campaign com contagem de entradas e conversões.
-- RLS: filtra por user_brand_ids() sobre campaign.brand_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_campaign_roi AS
SELECT
  c.id                                                        AS campaign_id,
  c.name                                                      AS campaign_name,
  c.brand_id,
  c.funnel_id,
  c.is_active,
  c.starts_at,
  c.ends_at,
  c.created_at,
  COUNT(fe_entry.id)                                          AS entries_count,
  COUNT(fe_conv.id)                                           AS conversions_count,
  COUNT(fe_conv.id)::numeric / NULLIF(COUNT(fe_entry.id), 0) AS conversion_rate
FROM campaign c
LEFT JOIN funnel_entry fe_entry
  ON fe_entry.entry_campaign_id = c.id
LEFT JOIN funnel_entry fe_conv
  ON fe_conv.conversion_campaign_id = c.id
  AND fe_conv.label = 'won'
WHERE c.brand_id = ANY(user_brand_ids())
  AND c.deleted_at IS NULL
GROUP BY
  c.id,
  c.name,
  c.brand_id,
  c.funnel_id,
  c.is_active,
  c.starts_at,
  c.ends_at,
  c.created_at;
