-- Migration: 20260425000014_sprint9_billing_history
-- Sprint 9 — MOD-BILLING (T-9-03)
-- Creates subscription_status_history and installment_status_history tables
-- with append-only triggers.
--
-- INV-BILL-06: mudança de status de subscription/installment grava linha em
--              *_status_history (append-only).
--
-- Specs:
--   docs/20-domain/13-subscription-billing.md §3.3
--   docs/30-contracts/02-db-schema-conventions.md §8

-- ---------------------------------------------------------------------------
-- subscription_status_history
-- Append-only trail of subscription status transitions.
-- FK ON DELETE CASCADE: history rows are removed together with the subscription.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscription_status_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid        NOT NULL REFERENCES subscription(id) ON DELETE CASCADE ON UPDATE CASCADE,
  old_status      subscription_status,                  -- NULL on first row (no prior state)
  new_status      subscription_status NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  changed_by      uuid,                                 -- NULL for system transitions (cron/webhook)
  note            text
);

-- Fast lookup by subscription ordered by date — used in subscription detail and audit.
CREATE INDEX IF NOT EXISTS idx_subscription_status_history_sub
  ON subscription_status_history (subscription_id, changed_at);

-- ---------------------------------------------------------------------------
-- installment_status_history
-- Append-only trail of installment status transitions.
-- FK ON DELETE CASCADE: history rows are removed together with the installment.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS installment_status_history (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id  uuid        NOT NULL REFERENCES installment(id) ON DELETE CASCADE ON UPDATE CASCADE,
  old_status      installment_status,                   -- NULL on first row (no prior state)
  new_status      installment_status NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now(),
  changed_by      uuid,                                 -- NULL for system transitions (cron/webhook)
  note            text
);

-- Fast lookup by installment ordered by date — used in dunning and audit.
CREATE INDEX IF NOT EXISTS idx_installment_status_history_inst
  ON installment_status_history (installment_id, changed_at);

-- ---------------------------------------------------------------------------
-- Append-only trigger for subscription_status_history
-- INV-BILL-06: blocks UPDATE and DELETE.
-- docs/30-contracts/02-db-schema-conventions.md §8
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_subscription_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'subscription_status_history is append-only (INV-BILL-06): % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_subscription_status_history_append_only
  BEFORE UPDATE OR DELETE ON subscription_status_history
  FOR EACH ROW EXECUTE FUNCTION prevent_subscription_status_history_mutation();

-- ---------------------------------------------------------------------------
-- Append-only trigger for installment_status_history
-- INV-BILL-06: blocks UPDATE and DELETE.
-- docs/30-contracts/02-db-schema-conventions.md §8
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION prevent_installment_status_history_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'installment_status_history is append-only (INV-BILL-06): % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_installment_status_history_append_only
  BEFORE UPDATE OR DELETE ON installment_status_history
  FOR EACH ROW EXECUTE FUNCTION prevent_installment_status_history_mutation();
