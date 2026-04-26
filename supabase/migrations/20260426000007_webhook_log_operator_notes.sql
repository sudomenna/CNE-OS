-- FLOW-12: Add operator_notes column to webhook_log
-- Append-only jsonb array for operator diagnostic notes during DLQ review/reprocess.
-- Each item: { addedAt: string (ISO), addedBy: string (uuid), text: string }

ALTER TABLE webhook_log
  ADD COLUMN IF NOT EXISTS operator_notes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN webhook_log.operator_notes IS
  'Notas append-only do operador. Array de {addedAt, addedBy, text}.';
