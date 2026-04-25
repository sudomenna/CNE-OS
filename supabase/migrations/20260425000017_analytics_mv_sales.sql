-- T-10-03: Materialized views — mv_sales_by_brand_day, mv_refund_by_brand_day
-- Sprint 10, task T-10-03
-- Depends on: 20260425000015_analytics_views_sales.sql (v_transaction_approved, v_refund)
-- Strategy: materialized immediately (no WITH NO DATA) so data is available on first query.
-- Unique indexes on (brand_id, day, offer_id) enable REFRESH MATERIALIZED VIEW CONCURRENTLY.

-- ---------------------------------------------------------------------------
-- mv_sales_by_brand_day
-- Aggregates approved transactions by (brand_id, day, offer_id).
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_sales_by_brand_day AS
SELECT
  brand_id,
  approved_at::date AS day,
  offer_id,
  offer_name,
  COUNT(*)          AS transactions_count,
  SUM(amount)       AS gross_revenue,
  AVG(amount)       AS avg_ticket
FROM v_transaction_approved
GROUP BY brand_id, approved_at::date, offer_id, offer_name;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX uq_mv_sales_by_brand_day
  ON mv_sales_by_brand_day (brand_id, day, offer_id);

-- Index for queries filtering by brand + date range
CREATE INDEX idx_mv_sales_brand_day
  ON mv_sales_by_brand_day (brand_id, day DESC);

-- ---------------------------------------------------------------------------
-- mv_refund_by_brand_day
-- Aggregates refunds by (brand_id, day, offer_id).
-- ---------------------------------------------------------------------------

CREATE MATERIALIZED VIEW mv_refund_by_brand_day AS
SELECT
  brand_id,
  created_at::date AS day,
  offer_id,
  COUNT(*)         AS refunds_count,
  SUM(amount)      AS refunded_amount
FROM v_refund
GROUP BY brand_id, created_at::date, offer_id;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX uq_mv_refund_by_brand_day
  ON mv_refund_by_brand_day (brand_id, day, offer_id);

-- Index for queries filtering by brand + date range
CREATE INDEX idx_mv_refund_brand_day
  ON mv_refund_by_brand_day (brand_id, day DESC);
