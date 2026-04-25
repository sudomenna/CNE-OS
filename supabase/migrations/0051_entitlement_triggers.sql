-- ============================================================
-- 0051_entitlement_triggers.sql
-- MOD-ENTITLEMENT (T-8-05)
--
-- Triggers:
--   1. trg_entitlement_history_append_only        — bloqueia UPDATE/DELETE em entitlement_history (INV-ENT-03)
--   2. trg_entitlement_status_history_append_only — bloqueia UPDATE/DELETE em entitlement_status_history
--   3. trg_entitlement_history_origin_immutable   — bloqueia UPDATE de origin_transaction_id em customer_entitlement (INV-ENT-04)
--
-- Specs:
--   docs/20-domain/12-entitlement.md §3.2, §3.3 (INV-ENT-03, INV-ENT-04)
--   docs/30-contracts/02-db-schema-conventions.md §8
-- ============================================================

-- ------------------------------------------------------------
-- 1. Append-only guard para entitlement_history
--    INV-ENT-03: trigger bloqueia UPDATE/DELETE.
--    docs/20-domain/12-entitlement.md §3.2
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_entitlement_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'entitlement_history is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entitlement_history_append_only
  BEFORE UPDATE OR DELETE ON entitlement_history
  FOR EACH ROW EXECUTE FUNCTION prevent_entitlement_history_mutation();

-- ------------------------------------------------------------
-- 2. Append-only guard para entitlement_status_history
--    docs/30-contracts/02-db-schema-conventions.md §8
--    docs/20-domain/12-entitlement.md §3.3
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_entitlement_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'entitlement_status_history is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entitlement_status_history_append_only
  BEFORE UPDATE OR DELETE ON entitlement_status_history
  FOR EACH ROW EXECUTE FUNCTION prevent_entitlement_status_history_mutation();

-- ------------------------------------------------------------
-- 3. Immutability guard para origin_transaction_id
--    INV-ENT-04: origin_transaction_id jamais muda após INSERT.
--    A guard fica em customer_entitlement (BEFORE UPDATE).
--    docs/20-domain/12-entitlement.md §5 INV-ENT-04
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_entitlement_origin_transaction_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.origin_transaction_id IS DISTINCT FROM OLD.origin_transaction_id THEN
    RAISE EXCEPTION
      'INV-ENT-04: origin_transaction_id is immutable after INSERT (entitlement id=%). '
      'Attempted change from % to %.',
      OLD.id, OLD.origin_transaction_id, NEW.origin_transaction_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entitlement_history_origin_immutable
  BEFORE UPDATE ON customer_entitlement
  FOR EACH ROW EXECUTE FUNCTION prevent_entitlement_origin_transaction_change();
