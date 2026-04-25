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
