-- ============================================================
-- 0052_refund_triggers.sql
-- MOD-REFUND (T-8-06)
--
-- Triggers:
--   1. set_refund_updated_at         — atualiza updated_at em UPDATE em refund
--   2. trg_refund_effect_log_append_only     — bloqueia UPDATE/DELETE em refund_effect_log (INV-REFUND-05)
--   3. trg_refund_status_history_append_only — bloqueia UPDATE/DELETE em refund_status_history
--
-- Specs:
--   docs/20-domain/14-refund.md §3.2, §3.3 (INV-REFUND-05)
--   docs/30-contracts/02-db-schema-conventions.md §3, §8
-- ============================================================

-- ------------------------------------------------------------
-- 1. set_updated_at trigger para refund
--    docs/30-contracts/02-db-schema-conventions.md §3
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_refund_updated_at
  BEFORE UPDATE ON refund
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 2. Append-only guard para refund_effect_log
--    INV-REFUND-05: trigger bloqueia UPDATE/DELETE.
--    docs/20-domain/14-refund.md §3.2
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_refund_effect_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'refund_effect_log is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refund_effect_log_append_only
  BEFORE UPDATE OR DELETE ON refund_effect_log
  FOR EACH ROW EXECUTE FUNCTION prevent_refund_effect_log_mutation();

-- ------------------------------------------------------------
-- 3. Append-only guard para refund_status_history
--    docs/30-contracts/02-db-schema-conventions.md §8
--    docs/20-domain/14-refund.md §3.3
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_refund_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'refund_status_history is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refund_status_history_append_only
  BEFORE UPDATE OR DELETE ON refund_status_history
  FOR EACH ROW EXECUTE FUNCTION prevent_refund_status_history_mutation();
