-- ADR-18: channel_account — credenciais encriptadas via pgcrypto + coluna last_seen_at
--
-- Esta migration:
--   1. Ativa a extensão pgcrypto (necessária para pgp_sym_encrypt / pgp_sym_decrypt)
--   2. Adiciona coluna last_seen_at (timestamptz nullable) para rastrear última atividade
--   3. Invalida registros com credentials plaintext (sem o envelope v:1)
--      → credentials = NULL; operador reconfigura via UI após deploy
--   4. Adiciona COMMENT documentando o formato esperado
--
-- Idempotente: CREATE EXTENSION IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.
-- Nunca dropa coluna nem altera tipo — apenas adiciona e anota.

-- ---------------------------------------------------------------------------
-- 1. Extensão pgcrypto
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 2. Coluna last_seen_at
--    NULL = nenhuma atividade registrada desde a configuração.
--    Atualizada pelo adapter do provedor após cada evento recebido.
-- ---------------------------------------------------------------------------
ALTER TABLE channel_account
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Backfill: registros com credentials plaintext (não-envelope) → NULL
--
--    O domínio T-15-03 grava credentials apenas como envelope:
--      { "v": 1, "encryptedAt": "...", "ciphertext": "..." }
--    Qualquer registro sem esse campo "ciphertext" é credentials plaintext
--    legado e não pode ser encriptado em migration (chave em runtime).
--    Decisão ADR-18: zerar credenciais — operador reconfigura via UI.
-- ---------------------------------------------------------------------------
UPDATE channel_account
SET
  credentials = NULL,
  is_active   = false
WHERE credentials IS NOT NULL
  AND (credentials->>'ciphertext') IS NULL;

-- ---------------------------------------------------------------------------
-- 4. Comentário de coluna — documenta o formato esperado
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN channel_account.credentials IS
  'ADR-18: envelope encriptado { v, encryptedAt, ciphertext }. NULL = não configurado. Plaintext NUNCA persistido.';

COMMENT ON COLUMN channel_account.last_seen_at IS
  'ADR-18: timestamp da última atividade registrada pelo adapter do provedor. NULL quando ainda não houve atividade.';
