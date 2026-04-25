-- ============================================================
-- 0050_snapshot_immutable.sql
-- MOD-TRANSACTION (T-8-02, T-8-03)
--
-- 1. trg_transaction_snapshot_immutable
--    Blocks UPDATE and DELETE on transaction_snapshot.
--    BR-SNAPSHOT-IMMUTABILITY (INV-TRX-01).
--
-- 2. FK circular: transaction.snapshot_id → transaction_snapshot(id)
--    DEFERRABLE INITIALLY DEFERRED — breaks circular dependency.
--    docs/20-domain/11-transaction-snapshot.md §3.6, OQ-TRX-03.
--
-- 3. set_transaction_item_updated_at
--    Maintains updated_at on transaction_item.
--
-- 4. trg_transaction_snapshot_flag_history_append_only
--    Blocks UPDATE and DELETE on transaction_snapshot_flag_history.
--    BR-SNAPSHOT-IMMUTABILITY CT-SNAP-06.
--
-- 5. trg_transaction_status_history_append_only
--    Blocks UPDATE and DELETE on transaction_status_history.
--    docs/30-contracts/02-db-schema-conventions.md §8, INV-TRX-05.
--
-- Specs:
--   docs/20-domain/11-transaction-snapshot.md §3.2, §3.3, §3.5, §3.6
--   docs/50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md
--   docs/30-contracts/02-db-schema-conventions.md §3, §8
-- ============================================================

-- ------------------------------------------------------------
-- 1. Immutability trigger for transaction_snapshot
--    BR-SNAPSHOT-IMMUTABILITY — trigger SQL canônico
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION block_transaction_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transaction_snapshot is append-only (BR-SNAPSHOT-IMMUTABILITY)'
    USING ERRCODE = 'feature_not_supported';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_snapshot_block_update
  BEFORE UPDATE ON transaction_snapshot
  FOR EACH ROW EXECUTE FUNCTION block_transaction_snapshot_mutation();

CREATE TRIGGER trg_transaction_snapshot_block_delete
  BEFORE DELETE ON transaction_snapshot
  FOR EACH ROW EXECUTE FUNCTION block_transaction_snapshot_mutation();

-- ------------------------------------------------------------
-- 2. FK circular (DEFERRABLE INITIALLY DEFERRED)
--    transaction.snapshot_id → transaction_snapshot(id)
--    Added AFTER transaction_snapshot table exists.
--    docs/20-domain/11-transaction-snapshot.md §3.6
--    OQ-TRX-03: circular FK (transaction ↔ snapshot) resolved via DEFERRABLE.
-- ------------------------------------------------------------

ALTER TABLE transaction
  ADD CONSTRAINT fk_transaction_snapshot
  FOREIGN KEY (snapshot_id) REFERENCES transaction_snapshot(id)
  DEFERRABLE INITIALLY DEFERRED;

-- ------------------------------------------------------------
-- 3. updated_at trigger for transaction_item
--    docs/30-contracts/02-db-schema-conventions.md §3
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_transaction_item_updated_at
  BEFORE UPDATE ON transaction_item
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- 4. Append-only guard for transaction_snapshot_flag_history
--    BR-SNAPSHOT-IMMUTABILITY CT-SNAP-06
--    docs/20-domain/11-transaction-snapshot.md §3.3
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_transaction_snapshot_flag_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'transaction_snapshot_flag_history is append-only (BR-SNAPSHOT-IMMUTABILITY): % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_snapshot_flag_history_append_only
  BEFORE UPDATE OR DELETE ON transaction_snapshot_flag_history
  FOR EACH ROW EXECUTE FUNCTION prevent_transaction_snapshot_flag_history_mutation();

-- ------------------------------------------------------------
-- 5. Append-only guard for transaction_status_history
--    INV-TRX-05: every status transition is append-only.
--    docs/30-contracts/02-db-schema-conventions.md §8
--    docs/20-domain/11-transaction-snapshot.md §3.5
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_transaction_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'transaction_status_history is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_status_history_append_only
  BEFORE UPDATE OR DELETE ON transaction_status_history
  FOR EACH ROW EXECUTE FUNCTION prevent_transaction_status_history_mutation();
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
