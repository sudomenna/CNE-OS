# Organização (Módulo MOD-ORG)

## 1. Finalidade

Modelar as unidades organizacionais que operam o sistema: **marcas** da CNE Educação, **entidades fiscais** (CNPJs) emissoras de notas, a relação N×N entre ambas, além dos **usuários internos** e seus **papéis (role)** que acessam o produto. É a base multi-tenant sobre a qual todos os demais módulos ancoram seus registros (`brand_id`).

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/organization.ts` (tabelas `brand`, `legal_entity`, `brand_legal_entity`, `user_account`, `role`, `user_role`)
  - `lib/db/schema/_relations/organization.ts`
  - `lib/domain/organization/` (validadores de CNPJ, helpers de resolução de marca)
  - `app/(app)/settings/brands/` (CRUD de marcas)
  - `app/(app)/settings/legal-entities/` (CRUD de CNPJs)
  - `app/(app)/settings/users/` (CRUD de usuários + papéis)
  - `tests/unit/organization/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`role_kind`)
  - `docs/50-business-rules/BR-RBAC.md`
- Interfaces públicas expostas (consumidas por outros módulos):
  - `listBrandsForUser(userId): Brand[]`
  - `resolveLegalEntityForSale(brandId, offerId): LegalEntity` (usado por MOD-TRANSACTION para stamp no snapshot)
  - `hasRole(userId, role_kind): boolean`

## 3. Entidades e campos

### 3.1 `brand`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `name` | text | não | — | `uq_brand_name` |
| `slug` | text | não | — | `uq_brand_slug`, `ck_brand_slug_kebab` |
| `logo_url` | text | sim | — | — |
| `primary_color` | text | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |
| `deleted_at` | timestamptz | sim | — | — |

### 3.2 `legal_entity`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `cnpj` | varchar(14) | não | — | `uq_legal_entity_cnpj`, `ck_legal_entity_cnpj_length` |
| `company_name` | text | não | — | — |
| `trade_name` | text | sim | — | — |
| `tax_regime` | text | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

### 3.3 `brand_legal_entity` (N×N)

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `brand_id` | uuid | não | — | FK `brand(id)`, parte da PK |
| `legal_entity_id` | uuid | não | — | FK `legal_entity(id)`, parte da PK |
| `is_default` | boolean | não | `false` | — |
| `created_at` | timestamptz | não | `now()` | — |

PK composta `(brand_id, legal_entity_id)`. Índice parcial `uq_brand_legal_entity_default` garantindo no máximo um `is_default = true` por marca.

### 3.4 `user_account`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | — (sem default) | PK; igual ao `auth.users.id` do Supabase — caller fornece |
| `email` | text | não | — | `uq_user_account_email` |
| `full_name` | text | não | — | — |
| `phone` | text | sim | — | — |
| `is_active` | boolean | não | `true` | — |
| `totp_enabled` | boolean | não | `false` | — |
| `last_login_at` | timestamptz | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |
| `deleted_at` | timestamptz | sim | — | — |

### 3.5 `role`

Catálogo fixo; espelha o enum `role_kind` (ver `30-contracts/01-enums.md`).

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `kind` | `role_kind` | não | — | `uq_role_kind` |
| `description` | text | sim | — | — |

### 3.6 `user_role`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `user_id` | uuid | não | — | FK `user_account(id) ON DELETE CASCADE`, parte da PK |
| `role_id` | uuid | não | — | FK `role(id)`, parte da PK |
| `granted_by` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |
| `granted_at` | timestamptz | não | `now()` | — |

### 3.7 DDL Drizzle/SQL

```sql
CREATE TABLE brand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  logo_url text,
  primary_color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT uq_brand_name UNIQUE (name),
  CONSTRAINT uq_brand_slug UNIQUE (slug),
  CONSTRAINT ck_brand_slug_kebab CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$')
);

CREATE TABLE legal_entity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj varchar(14) NOT NULL,
  company_name text NOT NULL,
  trade_name text,
  tax_regime text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_legal_entity_cnpj UNIQUE (cnpj),
  CONSTRAINT ck_legal_entity_cnpj_length CHECK (char_length(cnpj) = 14 AND cnpj ~ '^[0-9]{14}$')
);

CREATE TABLE brand_legal_entity (
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  legal_entity_id uuid NOT NULL REFERENCES legal_entity(id) ON DELETE RESTRICT,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, legal_entity_id)
);
CREATE UNIQUE INDEX uq_brand_legal_entity_default
  ON brand_legal_entity (brand_id) WHERE is_default = true;

CREATE TABLE user_account (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  totp_enabled boolean NOT NULL DEFAULT false,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT uq_user_account_email UNIQUE (email)
);

CREATE TABLE role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind role_kind NOT NULL,
  description text,
  CONSTRAINT uq_role_kind UNIQUE (kind)
);

CREATE TABLE user_role (
  user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES role(id) ON DELETE RESTRICT,
  granted_by uuid REFERENCES user_account(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_role_user ON user_role (user_id);
```

## 4. Relações (ASCII)

```
brand ──< brand_legal_entity >── legal_entity
  │
  └─(implícito via brand_id em outras tabelas)

user_account ──< user_role >── role
```

Multiplicidade: `brand` 1..N `brand_legal_entity` N..1 `legal_entity`. Um usuário tem 1..N `role`.

## 5. Invariantes

- `INV-ORG-01`: toda `brand` ativa tem pelo menos 1 `brand_legal_entity`. Verificado em Server Action de criação de marca e em guard antes da primeira venda.
- `INV-ORG-02`: `legal_entity.cnpj` tem exatamente 14 dígitos numéricos (CHECK no DB).
- `INV-ORG-03`: no máximo um `brand_legal_entity.is_default = true` por marca (índice único parcial).
- `INV-ORG-04`: um `user_account` tem pelo menos um papel ativo ou `is_active = false`. Guard em Server Action.
- `INV-ORG-05`: `brand.slug` é kebab-case, único, imutável após a primeira venda ter sido registrada para a marca.

## 6. Estados e transições

`brand` e `user_account` usam soft-delete (`deleted_at`), não state machine.

| Entidade | Estado origem | Evento | Estado destino | Guard |
|---|---|---|---|---|
| `user_account` | `is_active=true` | admin desativa | `is_active=false` | admin; registra audit_log |
| `user_account` | `is_active=false` | admin reativa | `is_active=true` | admin |
| `brand` | `deleted_at IS NULL` | admin arquiva | `deleted_at = now()` | não pode haver transação ativa/pendente na marca |

## 7. Regras de negócio referenciadas

- [`BR-RBAC`](../50-business-rules/BR-RBAC.md) — matriz de permissões por `role_kind`.
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md) — registra criação/alteração/desativação de usuário e marca.

## 8. Eventos de timeline emitidos

Nenhum. Este módulo não emite `TE-*` (contato ainda não existe no escopo).

## 9. Fluxos relacionados

- `FLOW-BOOTSTRAP` — criação da primeira marca + CNPJ + usuário admin em ambiente novo.
- `FLOW-USER-INVITE` — convite e ativação de novo usuário interno.

## 10. Casos de teste obrigatórios

- `brand.create.happy` — cria marca com slug válido e associa CNPJ default.
- `brand.create.rejects-duplicate-slug` — segunda marca com o mesmo slug retorna erro.
- `legal_entity.create.rejects-invalid-cnpj` — CNPJ com menos de 14 dígitos ou com caracteres não numéricos é recusado pelo CHECK.
- `brand_legal_entity.default.unique-per-brand` — promover um segundo `is_default` dispara violação do índice único parcial.
- `brand_legal_entity.default.allows-multiple-brands` — mesmo CNPJ pode ser default em duas marcas distintas.
- `user_role.assign.happy` — admin atribui papel `commercial` a usuário.
- `user_account.deactivate.keeps-history` — desativar usuário não apaga suas referências em `granted_by`.
- `brand.archive.rejects-active-transaction` — marca com transação `pending`/`approved` não pode ser soft-deletada.

## 11. Open Questions

- `OQ-ORG-01` — um usuário pode ter escopo restrito a marcas específicas (papel por marca) ou todo papel é global? Fase 1 assume global.
- `OQ-ORG-02` — precisamos de uma entidade `team` entre `user_account` e `role` para agrupar responsabilidades (ex.: suporte-CNEcarreiras)?
