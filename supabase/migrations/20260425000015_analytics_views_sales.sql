-- T-10-01: Analytics views — v_transaction_approved, v_refund, v_delinquency_aging
-- Sprint 10, task T-10-01
-- Strategy: SECURITY INVOKER views with WHERE brand_id = ANY(user_brand_ids())
-- RLS resolution (Fase 1): authenticated users see all brands.
-- Fase 2 substituirá por filtro per-user quando user_brand_access for criada.

-- ---------------------------------------------------------------------------
-- Helper function: user_brand_ids()
-- Fase 1: retorna todos os brand IDs (RLS global — usuário autenticado vê tudo).
-- Fase 2: SELECT brand_id FROM user_brand_access WHERE user_id = auth.uid()
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION user_brand_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ARRAY(SELECT id FROM brand);
$$;

-- ---------------------------------------------------------------------------
-- v_transaction_approved
-- Approved transactions enriched with offer name, brand name, contact id.
-- Only rows where transaction.brand_id is in user_brand_ids() are visible.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_transaction_approved
  WITH (security_invoker = true)
AS
SELECT
  t.id,
  t.brand_id,
  b.name                  AS brand_name,
  t.contact_id,
  t.offer_id,
  o.name                  AS offer_name,
  t.amount,
  t.currency,
  t.external_provider,
  t.approved_at,
  t.created_at
FROM transaction t
JOIN brand b   ON b.id = t.brand_id
JOIN offer o   ON o.id = t.offer_id
WHERE t.status = 'approved'
  AND t.brand_id = ANY(user_brand_ids());

-- ---------------------------------------------------------------------------
-- v_refund
-- Refunds enriched with transaction context (brand, contact, offer).
-- brand_id is sourced from transaction; the WHERE filter uses that column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_refund
  WITH (security_invoker = true)
AS
SELECT
  r.id,
  r.transaction_id,
  t.brand_id,
  t.contact_id,
  t.offer_id,
  r.amount,
  r.reason,
  r.status,
  r.external_provider,
  r.created_at,
  r.approved_at,
  r.processed_at
FROM refund r
JOIN transaction t ON t.id = r.transaction_id
WHERE t.brand_id = ANY(user_brand_ids());

-- ---------------------------------------------------------------------------
-- v_delinquency_aging
-- Overdue installments linked to subscriptions, with days_overdue computed.
-- Only subscription-linked installments are included (subscription_id NOT NULL).
-- status filter: 'overdue' — the only delinquency status in installment_status enum.
-- brand_id sourced from subscription.brand_id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_delinquency_aging
  WITH (security_invoker = true)
AS
SELECT
  i.id,
  i.subscription_id,
  s.brand_id,
  s.contact_id,
  s.offer_id,
  i.due_at                                          AS due_date,
  i.amount,
  i.status,
  (CURRENT_DATE - i.due_at::date)::integer          AS days_overdue,
  i.created_at
FROM installment i
JOIN subscription s ON s.id = i.subscription_id
WHERE i.status = 'overdue'
  AND i.subscription_id IS NOT NULL
  AND s.brand_id = ANY(user_brand_ids());
