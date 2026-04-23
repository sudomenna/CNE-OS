# Catálogo comercial (Módulo MOD-CATALOG)

## 1. Finalidade

Modelar **o que pode ser ofertado ao mercado**: produtos do catálogo por marca, categorias de produto e benefícios comerciais reutilizáveis. Este módulo **não vende** nada — ele é pré-requisito de [`MOD-OFFER`](./10-offer-engine.md). Produto só aparece no mercado dentro de uma oferta (ver [regra transversal 10.2 do PRD](../90-meta/archive/prd_v2.md) e invariante `INV-CATALOG-02`).

Benefício comercial existe para representar direitos sem produto formal (grupo VIP, certificado especial, mentoria pontual), com vigência, responsável e tag automática opcionais.

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/catalog.ts` (tabelas `product`, `product_category`, `commercial_benefit`)
  - `lib/db/schema/_relations/catalog.ts`
  - `lib/domain/catalog/` (normalização de slug, validadores de produto/benefício)
  - `app/(app)/settings/catalog/products/`
  - `app/(app)/settings/catalog/benefits/`
  - `app/(app)/settings/catalog/categories/`
  - `tests/unit/catalog/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`product_kind`, `offer_condition_item_kind`)
  - `docs/20-domain/01-organization.md` (FK `brand_id`)
  - `docs/50-business-rules/BR-CONTACT-CLASSIFICATION.md` (regra "curso → aluno" depende de `product_kind`)
- Interfaces públicas expostas:
  - `getProduct(productId): Product`
  - `listProductsByBrand(brandId): Product[]`
  - `getCommercialBenefit(benefitId): CommercialBenefit`
  - `resolveAutoTag(benefitId): string | null` (usado por MOD-TRANSACTION para aplicar tag ao aprovar)

## 3. Entidades e campos

### 3.1 `product`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `brand_id` | uuid | não | — | FK `brand(id) ON DELETE RESTRICT` |
| `category_id` | uuid | sim | — | FK `product_category(id) ON DELETE SET NULL` |
| `name` | text | não | — | — |
| `slug` | text | não | — | `uq_product_brand_slug (brand_id, slug)`, `ck_product_slug_kebab` |
| `kind` | `product_kind` | não | `other` | — |
| `description` | text | sim | — | — |
| `metadata` | jsonb | não | `'{}'` | — |
| `status` | text | não | `active` | `ck_product_status IN ('active','archived')` |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |
| `deleted_at` | timestamptz | sim | — | — |

### 3.2 `product_category`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `brand_id` | uuid | não | — | FK `brand(id) ON DELETE RESTRICT` |
| `name` | text | não | — | — |
| `slug` | text | não | — | `uq_product_category_brand_slug (brand_id, slug)` |
| `parent_id` | uuid | sim | — | FK `product_category(id) ON DELETE SET NULL` |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

### 3.3 `commercial_benefit`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `brand_id` | uuid | não | — | FK `brand(id) ON DELETE RESTRICT` |
| `name` | text | não | — | — |
| `slug` | text | não | — | `uq_commercial_benefit_brand_slug (brand_id, slug)` |
| `description` | text | sim | — | — |
| `auto_tag` | text | sim | — | Tag aplicada automaticamente ao contato ao aprovar transação que contém este benefício (ver MOD-TRANSACTION §passo de grant). |
| `default_duration_months` | int | sim | — | Vigência padrão sugerida; pode ser sobrescrita em `offer_condition_item.vigency_months` |
| `default_responsible_user_id` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |
| `delivery_status_required` | boolean | não | `false` | Quando `true`, todo `transaction_item` gerado exige `delivery_status` diferente de `pending` |
| `status` | text | não | `active` | `ck_commercial_benefit_status IN ('active','archived')` |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

> O status de entrega de um item gerado por benefício usa enum externo `commercial_benefit_delivery_status` (`pending`, `scheduled`, `in_progress`, `delivered`, `not_applicable`) — declarado em [`30-contracts/01-enums.md`](../30-contracts/01-enums.md) caso ainda não exista. Enquanto não existir, este módulo consome como `text` com CHECK, e registra pendência em [`OQ-CATALOG-01`](#11-open-questions).

### 3.4 DDL copiável

```sql
CREATE TABLE product_category (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  parent_id uuid REFERENCES product_category(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_product_category_brand_slug UNIQUE (brand_id, slug)
);

CREATE TABLE product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES product_category(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL,
  kind product_kind NOT NULL DEFAULT 'other',
  description text,
  metadata jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT uq_product_brand_slug UNIQUE (brand_id, slug),
  CONSTRAINT ck_product_slug_kebab CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT ck_product_status CHECK (status IN ('active','archived'))
);
CREATE INDEX idx_product_brand ON product (brand_id);
CREATE INDEX idx_product_kind ON product (kind);

CREATE TABLE commercial_benefit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  auto_tag text,
  default_duration_months int,
  default_responsible_user_id uuid REFERENCES user_account(id) ON DELETE SET NULL,
  delivery_status_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_commercial_benefit_brand_slug UNIQUE (brand_id, slug),
  CONSTRAINT ck_commercial_benefit_status CHECK (status IN ('active','archived'))
);
CREATE INDEX idx_commercial_benefit_brand ON commercial_benefit (brand_id);
```

## 4. Relações (ASCII)

```
brand ─< product_category ─< product
  │                          │
  │                          └─(referenciado por offer_condition_item.product_id em MOD-OFFER)
  │
  └─< commercial_benefit
           └─(referenciado por offer_condition_item.commercial_benefit_id em MOD-OFFER)
```

- Produto pertence a 1 marca, 0..1 categoria.
- Categoria é hierárquica (auto-referência `parent_id`).
- Benefício comercial pertence a 1 marca e é referenciado N vezes por itens de condição.

## 5. Invariantes

- `INV-CATALOG-01`: `product.brand_id` é imutável após a primeira referência em `offer_condition_item`. Guard em Server Action verifica existência de itens antes de permitir troca de marca.
- `INV-CATALOG-02`: **produto nunca é vendido diretamente**. Transação sempre carrega `offer_id` e `offer_condition_id`; produto aparece via `transaction_item.product_id` derivado do snapshot. Enforçado em MOD-TRANSACTION (constraint e guard).
- `INV-CATALOG-03`: `product.slug` é único por marca e kebab-case (CHECK no DB + índice).
- `INV-CATALOG-04`: `commercial_benefit.slug` é único por marca.
- `INV-CATALOG-05`: `product.status='archived'` **não** apaga referências em ofertas existentes; apenas impede inclusão em novas `offer_condition_item`.
- `INV-CATALOG-06`: `commercial_benefit.auto_tag`, quando presente, é kebab-case (validação de domínio).

## 6. Estados e transições

| Entidade | De | Evento | Para | Guard |
|---|---|---|---|---|
| `product` | `active` | admin/marketing arquiva | `archived` | nenhuma condição com `offer_condition.status='active'` referenciando este produto |
| `product` | `archived` | admin reativa | `active` | — |
| `commercial_benefit` | `active` | admin arquiva | `archived` | nenhuma condição ativa referenciando este benefício |
| `commercial_benefit` | `archived` | admin reativa | `active` | — |

Produto/benefício **não** são soft-deletados (`deleted_at`) para preservar integridade referencial com snapshots de transação. Arquivamento é via `status`.

## 7. Regras de negócio referenciadas

- [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md) — compra de produto com `kind='course'` ou `kind='training_online'`/`training_in_person' eleva contato a `student`.
- [`BR-OFFER-ELIGIBILITY`](../50-business-rules/BR-OFFER-ELIGIBILITY.md) — itens de condição referenciam `product.id` ou `commercial_benefit.id`.

## 8. Eventos de timeline emitidos

Nenhum. Catálogo não gera evento no contato (contato não existe na operação de catálogo). Criação/arquivamento de produto e benefício registram linha em `audit_log` (ver [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md)).

## 9. Fluxos relacionados

- `FLOW-CATALOG-SETUP` — cadastro de produto + categoria + benefício antes de criar oferta.
- `FLOW-BENEFIT-AUTO-TAG` — ao aprovar transação com benefício que tem `auto_tag`, MOD-TRANSACTION aplica tag no contato.

## 10. Casos de teste obrigatórios

- `product.create.happy` — produto com slug kebab válido é persistido.
- `product.create.rejects-duplicate-slug-in-brand` — segundo produto com o mesmo slug na mesma marca viola `uq_product_brand_slug`.
- `product.create.allows-same-slug-across-brands` — mesmo slug em marcas diferentes é aceito.
- `product.archive.keeps-historical-references` — produto arquivado continua visível em `transaction_snapshot` antigos.
- `product.archive.blocks-new-active-condition` — tentar arquivar produto referenciado por condição ativa é rejeitado.
- `commercial_benefit.auto_tag.applies-on-transaction-approval` — integração com MOD-TRANSACTION aplica tag.
- `commercial_benefit.default_duration.propagates-as-item-default` — MOD-OFFER usa `default_duration_months` como sugestão inicial ao criar item.
- `product_category.hierarchy.parent-cycle-rejected` — categoria não pode ser descendente de si mesma.

## 11. Open Questions

- `OQ-CATALOG-01` — o enum `commercial_benefit_delivery_status` está listado no contexto desta spec mas **não existe** em [`30-contracts/01-enums.md`](../30-contracts/01-enums.md). Precisa ser criado numa tarefa serial de contratos antes de materializar DDL final.
- `OQ-CATALOG-02` — `product.metadata` (jsonb) terá schema canônico por `product_kind` (ex.: curso exige `duration_hours`)? Fase 1 aceita livre.
- `OQ-CATALOG-03` — `product.status` é enum próprio ou reaproveita `offer_status`? Hoje usa CHECK texto; considerar enum `catalog_status` dedicado.
- `OQ-CATALOG-04` — benefício comercial pode ter `default_duration_months=NULL` significando perpetuous; confirmar com negócio.
