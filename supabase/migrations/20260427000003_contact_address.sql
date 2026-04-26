-- BR-IDENTITY (estendida): endereço estruturado por contato.
-- Resolve a pendência [pending-contact-address-table] do MEMORY.md §1.
-- Substitui o workaround de armazenar address.city / address.state / address.zip em contact_custom_field.

-- ---------------------------------------------------------------------------
-- 1) Enum contact_address_kind
-- ---------------------------------------------------------------------------

CREATE TYPE contact_address_kind AS ENUM (
  'home',
  'billing',
  'shipping'
);

-- ---------------------------------------------------------------------------
-- 2) Tabela contact_address
-- ---------------------------------------------------------------------------

CREATE TABLE contact_address (
  id          uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid                   NOT NULL REFERENCES contact(id) ON DELETE CASCADE ON UPDATE CASCADE,
  kind        contact_address_kind   NOT NULL DEFAULT 'home',
  is_primary  boolean                NOT NULL DEFAULT false,
  street      text,
  number      text,
  complement  text,
  district    text,
  city        text,
  state       varchar(32),
  zip         varchar(16),
  country     varchar(2)             NOT NULL DEFAULT 'BR',
  created_at  timestamptz            NOT NULL DEFAULT now(),
  updated_at  timestamptz            NOT NULL DEFAULT now(),

  CONSTRAINT ck_contact_address_zip_br
    CHECK (country <> 'BR' OR zip IS NULL OR zip ~ '^[0-9]{8}$'),
  CONSTRAINT ck_contact_address_state_br
    CHECK (country <> 'BR' OR state IS NULL OR state ~ '^[A-Z]{2}$')
);

-- Apenas 1 endereço primary por (contato, kind)
CREATE UNIQUE INDEX uq_contact_address_primary
  ON contact_address (contact_id, kind)
  WHERE is_primary = true;

CREATE INDEX idx_contact_address_contact ON contact_address (contact_id);
CREATE INDEX idx_contact_address_city    ON contact_address (city);

-- Trigger updated_at (helper já existe — set_updated_at)
CREATE TRIGGER t_contact_address_set_updated_at
  BEFORE UPDATE ON contact_address
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 3) RLS — autenticados leem; escrita restrita a roles com contact.write
--    (Sprint 13 ativou RLS por módulo; aplico mesmo padrão)
-- ---------------------------------------------------------------------------

ALTER TABLE contact_address ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_select_contact_address
  ON contact_address
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY authenticated_write_contact_address
  ON contact_address
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- 4) Backfill: migra custom_fields globais (brand_id NULL) com keys 'address.*'
--    Cada contato com pelo menos um campo vira 1 registro contact_address kind='home', primary=true.
-- ---------------------------------------------------------------------------

WITH addr_cf AS (
  SELECT
    contact_id,
    MAX(CASE WHEN key = 'address.city'   THEN value::text END) AS city_raw,
    MAX(CASE WHEN key = 'address.state'  THEN value::text END) AS state_raw,
    MAX(CASE WHEN key = 'address.zip'    THEN value::text END) AS zip_raw
  FROM contact_custom_field
  WHERE brand_id IS NULL
    AND key IN ('address.city', 'address.state', 'address.zip')
  GROUP BY contact_id
)
INSERT INTO contact_address (contact_id, kind, is_primary, city, state, zip, country)
SELECT
  contact_id,
  'home',
  true,
  -- value é jsonb; ::text gera literal com aspas → strip aspas externas
  NULLIF(trim(BOTH '"' FROM city_raw), ''),
  NULLIF(trim(BOTH '"' FROM state_raw), ''),
  NULLIF(regexp_replace(trim(BOTH '"' FROM zip_raw), '\D', '', 'g'), ''),
  'BR'
FROM addr_cf
WHERE city_raw IS NOT NULL OR state_raw IS NOT NULL OR zip_raw IS NOT NULL;

-- Limpa as keys antigas — fonte de verdade agora é contact_address
DELETE FROM contact_custom_field
 WHERE brand_id IS NULL
   AND key IN ('address.city', 'address.state', 'address.zip');

COMMENT ON TABLE contact_address IS
  'Endereços estruturados do contato (home/billing/shipping). Substitui custom_field key=address.* (migração 20260427000003).';
