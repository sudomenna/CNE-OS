-- BR-CONTACT-CLASSIFICATION: nova hierarquia mentorado > student > customer > lead
--
-- Mudanças:
--   • adiciona valor 'mentorado' (mentoria → classificação dedicada)
--   • remove valor 'paid_lead' (colapsado em 'customer')
--
-- Estratégia: recriar o enum em transação atômica.
-- Backfill defensivo: contact_classification 'paid_lead' → 'customer' antes da migração.
-- Conferido em 2026-04-26: 0 contatos paid_lead em produção; impacto efetivo nulo.

-- ---------------------------------------------------------------------------
-- 1) Backfill: remapeia 'paid_lead' → 'customer' nas tabelas que usam o enum
-- ---------------------------------------------------------------------------

UPDATE contact
   SET classification = 'customer'
 WHERE classification = 'paid_lead';

UPDATE contact_status_history
   SET from_classification = 'customer'
 WHERE from_classification = 'paid_lead';

UPDATE contact_status_history
   SET to_classification = 'customer'
 WHERE to_classification = 'paid_lead';

-- ---------------------------------------------------------------------------
-- 2) Recria o enum com a nova lista de valores
-- ---------------------------------------------------------------------------

CREATE TYPE contact_classification_v2 AS ENUM (
  'lead',
  'customer',
  'student',
  'mentorado'
);

-- ---------------------------------------------------------------------------
-- 3) Migra colunas existentes para o novo type
-- ---------------------------------------------------------------------------

ALTER TABLE contact
  ALTER COLUMN classification DROP DEFAULT;
ALTER TABLE contact
  ALTER COLUMN classification TYPE contact_classification_v2
  USING classification::text::contact_classification_v2;
ALTER TABLE contact
  ALTER COLUMN classification SET DEFAULT 'lead';

ALTER TABLE contact_status_history
  ALTER COLUMN from_classification TYPE contact_classification_v2
  USING from_classification::text::contact_classification_v2;
ALTER TABLE contact_status_history
  ALTER COLUMN to_classification TYPE contact_classification_v2
  USING to_classification::text::contact_classification_v2;

-- ---------------------------------------------------------------------------
-- 4) Drop do enum antigo + rename do novo para o nome canônico
-- ---------------------------------------------------------------------------

DROP TYPE contact_classification;
ALTER TYPE contact_classification_v2 RENAME TO contact_classification;

COMMENT ON TYPE contact_classification IS
  'BR-CONTACT-CLASSIFICATION: hierarquia mentorado > student > customer > lead';
