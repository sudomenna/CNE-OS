-- T-10-04: Materialized Views — mv_funnel_stage_conversion, mv_inbox_daily, mv_campaign_attribution
-- Sprint 10 | docs/20-domain/15-analytics-ops.md
-- Requer: 20260425000016_analytics_views_ops.sql (v_funnel_conversion, v_inbox_sla, v_campaign_roi)
-- Índices únicos habilitam REFRESH CONCURRENTLY sem lock exclusivo.

-- ---------------------------------------------------------------------------
-- mv_funnel_stage_conversion
-- Agrega v_funnel_conversion por (brand_id, funnel_id, label, dia).
-- REFRESH CONCURRENTLY habilitado pelo índice único em (brand_id, funnel_id, label, day).
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_funnel_stage_conversion AS
SELECT
  brand_id,
  funnel_id,
  funnel_name,
  label,
  entry_date::date                AS day,
  COUNT(*)                        AS entries_count,
  AVG(cycle_time_days)            AS avg_cycle_time_days,
  AVG(score)                      AS avg_score
FROM v_funnel_conversion
GROUP BY brand_id, funnel_id, funnel_name, label, entry_date::date;

CREATE UNIQUE INDEX uq_mv_funnel_stage_conversion
  ON mv_funnel_stage_conversion (brand_id, funnel_id, label, day);

CREATE INDEX idx_mv_funnel_brand_day
  ON mv_funnel_stage_conversion (brand_id, day DESC);

-- ---------------------------------------------------------------------------
-- mv_inbox_daily
-- Agrega v_inbox_sla por (brand_id, dia).
-- REFRESH CONCURRENTLY habilitado pelo índice único em (brand_id, day).
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_inbox_daily AS
SELECT
  brand_id,
  created_at::date                                              AS day,
  COUNT(*)                                                      AS conversations_count,
  COUNT(*) FILTER (WHERE status = 'open')                       AS open_count,
  COUNT(*) FILTER (WHERE status = 'closed')                     AS closed_count,
  AVG(response_time_minutes)                                    AS avg_response_time_minutes,
  COUNT(*) FILTER (WHERE is_overdue = true)                     AS overdue_count
FROM v_inbox_sla
GROUP BY brand_id, created_at::date;

CREATE UNIQUE INDEX uq_mv_inbox_daily
  ON mv_inbox_daily (brand_id, day);

CREATE INDEX idx_mv_inbox_brand_day
  ON mv_inbox_daily (brand_id, day DESC);

-- ---------------------------------------------------------------------------
-- mv_campaign_attribution
-- Snapshot de v_campaign_roi para leitura rápida.
-- REFRESH CONCURRENTLY habilitado pelo índice único em (campaign_id).
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_campaign_attribution AS
SELECT
  campaign_id,
  campaign_name,
  brand_id,
  funnel_id,
  is_active,
  starts_at,
  ends_at,
  entries_count,
  conversions_count,
  conversion_rate
FROM v_campaign_roi;

CREATE UNIQUE INDEX uq_mv_campaign_attribution
  ON mv_campaign_attribution (campaign_id);

CREATE INDEX idx_mv_campaign_brand
  ON mv_campaign_attribution (brand_id);
