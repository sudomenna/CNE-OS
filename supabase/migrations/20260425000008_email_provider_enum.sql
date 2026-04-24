-- T-3-09: Add 'email' value to integration_provider enum
-- Required for email adapter idempotency via webhook_log
-- docs/30-contracts/01-enums.md §Integração

ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'email';
