-- Migration: 20260425000013_sprint9_billing_subscription
-- Sprint 9 — MOD-BILLING
-- Creates subscription_status and installment_status enums,
-- subscription table, and installment table.
--
-- Specs:
--   docs/20-domain/13-subscription-billing.md §3.1, §3.2, §3.4
--   docs/30-contracts/01-enums.md §Assinatura/Cobrança
--   docs/30-contracts/02-db-schema-conventions.md

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'trial',
    'active',
    'past_due',
    'paused',
    'cancelled',
    'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE installment_status AS ENUM (
    'scheduled',
    'paid',
    'overdue',
    'refunded',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- subscription
-- docs/20-domain/13-subscription-billing.md §3.1, §3.4
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS subscription (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id              uuid        NOT NULL REFERENCES contact(id)               ON DELETE RESTRICT ON UPDATE CASCADE,
  brand_id                uuid        NOT NULL REFERENCES brand(id)                 ON DELETE RESTRICT ON UPDATE CASCADE,
  offer_id                uuid        NOT NULL REFERENCES offer(id)                 ON DELETE RESTRICT ON UPDATE CASCADE,
  offer_condition_id      uuid        NOT NULL REFERENCES offer_condition(id)       ON DELETE RESTRICT ON UPDATE CASCADE,
  offer_payment_option_id uuid        NOT NULL REFERENCES offer_payment_option(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  origin_transaction_id   uuid        NOT NULL REFERENCES transaction(id)           ON DELETE RESTRICT ON UPDATE CASCADE,
  status                  subscription_status NOT NULL DEFAULT 'trial',
  current_period_start    timestamptz NOT NULL DEFAULT now(),
  current_period_end      timestamptz NOT NULL,
  next_billing_at         timestamptz,
  trial_ends_at           timestamptz,
  cancelled_at            timestamptz,
  cancel_reason           text,
  external_provider       integration_provider,
  external_id             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  -- INV-BILL-02: period coherence
  CONSTRAINT ck_subscription_period CHECK (current_period_end > current_period_start),

  -- INV-BILL-03: trial status requires trial_ends_at
  CONSTRAINT ck_subscription_trial CHECK (
    (status = 'trial' AND trial_ends_at IS NOT NULL)
    OR (status <> 'trial')
  ),

  -- INV-BILL-04: cancelled status requires cancelled_at
  CONSTRAINT ck_subscription_cancelled CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled')
  )
);

-- INV-BILL-05 / BR-INTEGRATION-IDEMPOTENCY: unique external reference when present
CREATE UNIQUE INDEX IF NOT EXISTS uq_subscription_external
  ON subscription (external_provider, external_id)
  WHERE external_id IS NOT NULL;

-- Fast lookup by contact and status — used in CRM contact view and dunning
CREATE INDEX IF NOT EXISTS idx_subscription_contact
  ON subscription (contact_id, status);

-- updated_at trigger (shared helper from _helpers)
CREATE TRIGGER set_subscription_updated_at
  BEFORE UPDATE ON subscription
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- installment
-- docs/20-domain/13-subscription-billing.md §3.2, §3.4
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS installment (
  id                uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    uuid           REFERENCES transaction(id)   ON DELETE RESTRICT ON UPDATE CASCADE,
  subscription_id   uuid           REFERENCES subscription(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  sequence          int            NOT NULL,
  due_at            timestamptz    NOT NULL,
  amount            numeric(12,2)  NOT NULL,
  status            installment_status NOT NULL DEFAULT 'scheduled',
  paid_at           timestamptz,
  external_provider integration_provider,
  external_id       text,
  boleto_url        text,
  retry_count       int            NOT NULL DEFAULT 0,
  last_retry_at     timestamptz,
  created_at        timestamptz    NOT NULL DEFAULT now(),
  updated_at        timestamptz    NOT NULL DEFAULT now(),

  -- amount must be non-negative
  CONSTRAINT ck_installment_amount CHECK (amount >= 0),

  -- paid status requires paid_at
  CONSTRAINT ck_installment_paid_coherence CHECK (
    (status = 'paid' AND paid_at IS NOT NULL)
    OR (status <> 'paid')
  ),

  -- INV-BILL-01: exactly one parent (transaction XOR subscription)
  CONSTRAINT ck_installment_parent_exclusive CHECK (
    (transaction_id IS NOT NULL AND subscription_id IS NULL)
    OR (transaction_id IS NULL AND subscription_id IS NOT NULL)
  )
);

-- BR-INTEGRATION-IDEMPOTENCY: unique external reference when present
CREATE UNIQUE INDEX IF NOT EXISTS uq_installment_external
  ON installment (external_provider, external_id)
  WHERE external_id IS NOT NULL;

-- Unique sequence per subscription parent
CREATE UNIQUE INDEX IF NOT EXISTS uq_installment_seq_sub
  ON installment (subscription_id, sequence)
  WHERE subscription_id IS NOT NULL;

-- Unique sequence per transaction parent
CREATE UNIQUE INDEX IF NOT EXISTS uq_installment_seq_trx
  ON installment (transaction_id, sequence)
  WHERE transaction_id IS NOT NULL;

-- Used by dunning cron to find overdue installments
CREATE INDEX IF NOT EXISTS idx_installment_status_due
  ON installment (status, due_at);

-- updated_at trigger (shared helper from _helpers)
CREATE TRIGGER set_installment_updated_at
  BEFORE UPDATE ON installment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
