# Motor de ofertas (Módulo MOD-OFFER)

## 1. Finalidade

Representar a **lógica comercial real** de como a CNE oferta ao mercado: uma oferta por marca, com múltiplas condições, itens, regras de elegibilidade (AND/OR com nesting), opções de pagamento e prioridade/score para desempate. É o coração operacional do sistema — quando uma venda chega (via checkout ou integração), este módulo decide **qual condição aplicar** em função do contexto (data, campanha, canal, vendas aprovadas até o momento, etc.).

Uma oferta é fixa em sua **entidade fiscal emissora** (CNPJ) — decisão formalizada em [`ADR-02`](../90-meta/04-decision-log.md#adr-02) e em [`10-architecture`] (campo `issuing_legal_entity_id`). Isto simplifica NF-e posterior e congela o contrato fiscal da venda.

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/offer.ts` (todas as tabelas desta spec)
  - `lib/db/schema/_relations/offer.ts`
  - `lib/domain/offer/` (engine de decisão, avaliação de regras, incremento de contador)
  - `lib/domain/offer/decision.ts` (`selectCondition`)
  - `lib/domain/offer/eligibility.ts` (`evaluateEligibility`, `evaluateRuleGroup`)
  - `lib/domain/offer/sales-counter.ts` (incremento atômico)
  - `app/(app)/offers/` (CRUD de oferta, condição, regra, item, payment option)
  - `tests/unit/offer/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`offer_status`, `offer_condition_status`, `offer_rule_kind`, `offer_rule_operator`, `offer_payment_method`, `offer_condition_item_kind`)
  - `docs/20-domain/01-organization.md` (FK `brand_id`, `legal_entity`)
  - `docs/20-domain/09-catalog.md` (FK `product`, `commercial_benefit`)
  - `docs/20-domain/07-campaign-creative.md` (regras por `campaign_id`, `creative_id`)
  - `docs/50-business-rules/BR-OFFER-DECISION.md`
  - `docs/50-business-rules/BR-OFFER-ELIGIBILITY.md`
  - `docs/50-business-rules/BR-OFFER-UNIQUENESS.md`
  - `docs/50-business-rules/BR-RENEWAL.md`
- Interfaces públicas expostas:
  - `selectCondition(offerId: uuid, ctx: DecisionContext): Promise<DecisionResult>`
  - `evaluateEligibility(conditionId: uuid, ctx: DecisionContext): Promise<boolean>`
  - `incrementSalesCounter(offerId: uuid, txDb): Promise<number>` (chamada dentro da transação SQL da venda)
  - `getOfferWithDefaultCondition(offerId): Offer`
  - `getIssuingLegalEntity(offerId): LegalEntity` (lido por MOD-TRANSACTION para stamp no snapshot)

### Tipo `DecisionContext` (fonte canônica)

```ts
type DecisionContext = {
  contactId: string;
  brandId: string;
  now: Date;                      // timestamp server-side, nunca client
  campaignId?: string;
  creativeId?: string;
  channel?: 'whatsapp' | 'instagram' | 'email' | 'site' | 'api';
  isInternal?: boolean;           // uso interno do comercial
};

type DecisionResult =
  | { kind: 'selected'; conditionId: string; reason: string }
  | { kind: 'conflict'; candidateConditionIds: string[]; reason: 'tie_on_all_desempate' };
```

## 3. Entidades e campos

### 3.1 `offer`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `brand_id` | uuid | não | — | FK `brand(id) ON DELETE RESTRICT` |
| `issuing_legal_entity_id` | uuid | **não** | — | FK `legal_entity(id) ON DELETE RESTRICT`. **Imutável após primeira venda aprovada** — ver `INV-OFFER-03`. |
| `name` | text | não | — | — |
| `slug` | text | não | — | `uq_offer_brand_slug (brand_id, slug)`, kebab-case |
| `description` | text | sim | — | — |
| `type` | text | não | `regular` | `ck_offer_type IN ('regular','renewal')`. Quando `renewal`, `renews_offer_id` obrigatório. |
| `renews_offer_id` | uuid | sim | — | FK `offer(id) ON DELETE RESTRICT`; obrigatório quando `type='renewal'` (CHECK). |
| `status` | `offer_status` | não | `draft` | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |
| `created_by` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |

### 3.2 `offer_condition`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `offer_id` | uuid | não | — | FK `offer(id) ON DELETE CASCADE` |
| `name` | text | não | — | — |
| `description` | text | sim | — | — |
| `priority` | int | não | `0` | `ck_offer_condition_priority_range CHECK (priority BETWEEN -1000 AND 1000)` |
| `advantage_score` | numeric(8,2) | não | `0` | score de vantagem comercial — manual |
| `status` | `offer_condition_status` | não | `draft` | — |
| `is_public` | boolean | não | `true` | quando `false`, condição só se aplica via flag `isInternal=true` no contexto |
| `is_default` | boolean | não | `false` | índice parcial único garante **exatamente 1** `is_default=true` por `offer_id` com `status='active'` |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |
| `created_by` | uuid | sim | — | FK `user_account(id)` |

### 3.3 `offer_condition_rule_group`

Grupo lógico de regras; permite nesting.

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `offer_condition_id` | uuid | não | — | FK `offer_condition(id) ON DELETE CASCADE` |
| `parent_group_id` | uuid | sim | — | FK `offer_condition_rule_group(id) ON DELETE CASCADE` (auto-referência para nesting) |
| `operator` | `offer_rule_operator` | não | `and` | `and` \| `or` |
| `created_at` | timestamptz | não | `now()` | — |

**Grupo raiz por condição:** exatamente 1 grupo com `parent_group_id IS NULL` por `offer_condition_id` (índice parcial único).

### 3.4 `offer_condition_rule`

Regra atômica dentro de um grupo.

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `group_id` | uuid | não | — | FK `offer_condition_rule_group(id) ON DELETE CASCADE` |
| `kind` | `offer_rule_kind` | não | — | — |
| `params` | jsonb | não | `'{}'` | schema por `kind` — ver §3.4.1 |
| `created_at` | timestamptz | não | `now()` | — |

#### 3.4.1 Schema de `params` por `kind`

| `kind` | Schema `params` |
|---|---|
| `date_range` | `{ start_at: ISO8601, end_at: ISO8601 }` — inclusivo em `start_at`, exclusivo em `end_at` |
| `sales_count_reached` | `{ max: int }` — elegível se `offer_sales_counter.approved_count < max` |
| `campaign` | `{ campaign_ids: uuid[] }` — elegível se `ctx.campaignId ∈ campaign_ids` |
| `channel` | `{ channels: channel_kind[] }` — elegível se `ctx.channel ∈ channels` |
| `creative` | `{ creative_ids: uuid[] }` — elegível se `ctx.creativeId ∈ creative_ids` |
| `internal_use` | `{}` — elegível se `ctx.isInternal === true` |

Validação: Server Action valida `params` contra schema zod específico por `kind` antes de persistir.

### 3.5 `offer_condition_item`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `offer_condition_id` | uuid | não | — | FK `offer_condition(id) ON DELETE CASCADE` |
| `kind` | `offer_condition_item_kind` | não | — | `main`, `bonus`, `upsell`, `order_bump`, `complement`, `commercial_benefit` |
| `product_id` | uuid | sim | — | FK `product(id) ON DELETE RESTRICT` |
| `commercial_benefit_id` | uuid | sim | — | FK `commercial_benefit(id) ON DELETE RESTRICT` |
| `quantity` | int | não | `1` | `CHECK quantity > 0` |
| `access_rule` | jsonb | não | `'{}'` | ex.: `{ "delay_days": 0, "drip": false }` |
| `vigency_months` | int | sim | — | NULL = perpetuous (vitalício) |
| `discount` | numeric(12,2) | sim | — | desconto aplicado sobre o preço base do item, se houver preço unitário |
| `responsible_user_id` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |
| `order_index` | int | não | `0` | ordenação dentro da condição |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

**CHECK `ck_offer_condition_item_ref_exclusive`:**
```
(product_id IS NOT NULL AND commercial_benefit_id IS NULL AND kind <> 'commercial_benefit')
OR
(product_id IS NULL AND commercial_benefit_id IS NOT NULL AND kind = 'commercial_benefit')
```
Cada item aponta exclusivamente para produto **ou** benefício, e `kind='commercial_benefit'` exige `commercial_benefit_id`.

### 3.6 `offer_payment_option`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `offer_condition_id` | uuid | não | — | FK `offer_condition(id) ON DELETE CASCADE` |
| `method` | `offer_payment_method` | não | — | `pix`, `credit_card`, `installments`, `boleto`, `custom` |
| `price` | numeric(12,2) | não | — | `CHECK price >= 0` |
| `installments` | int | sim | — | obrigatório quando `method='installments'` (CHECK) |
| `custom_config` | jsonb | não | `'{}'` | ex.: parcelamento customizado, taxas, configuração externa |
| `is_active` | boolean | não | `true` | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

> Opção de pagamento **nunca altera benefícios**; só altera preço/forma. Cobrado via MOD-TRANSACTION ao gerar snapshot.

### 3.7 `offer_sales_counter`

Contador atômico **por oferta** (não por condição) — consulta da regra `sales_count_reached`. Ver [`ADR-07`](../90-meta/04-decision-log.md#adr-07) sobre aceitar excesso em race.

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `offer_id` | uuid | não | — | PK, FK `offer(id) ON DELETE CASCADE` |
| `approved_count` | bigint | não | `0` | monotônico |
| `updated_at` | timestamptz | não | `now()` | — |

**Concorrência:** MOD-TRANSACTION, dentro da mesma transação SQL que aprova a venda, executa:
```sql
UPDATE offer_sales_counter
SET approved_count = approved_count + 1, updated_at = now()
WHERE offer_id = $1
RETURNING approved_count;
```
Postgres serializa UPDATE na mesma linha. A **avaliação** de `sales_count_reached` ocorre **antes** da decisão; com N conexões concorrentes, pode haver `approved_count` igual a 30 para duas delas → ambas aprovam → vira 31. Comportamento documentado e aceito em `ADR-07`.

### 3.8 `offer_status_history` e `offer_condition_priority_history`

Append-only; trigger bloqueia UPDATE/DELETE.

```sql
CREATE TABLE offer_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offer(id),
  from_status offer_status,
  to_status offer_status NOT NULL,
  changed_by uuid REFERENCES user_account(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offer_condition_priority_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_condition_id uuid NOT NULL REFERENCES offer_condition(id),
  from_priority int,
  to_priority int NOT NULL,
  from_advantage_score numeric(8,2),
  to_advantage_score numeric(8,2) NOT NULL,
  changed_by uuid REFERENCES user_account(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.9 DDL copiável (ofertas, condições, regras, itens, payment options, counter)

```sql
CREATE TABLE offer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  issuing_legal_entity_id uuid NOT NULL REFERENCES legal_entity(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  type text NOT NULL DEFAULT 'regular',
  renews_offer_id uuid REFERENCES offer(id) ON DELETE RESTRICT,
  status offer_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES user_account(id) ON DELETE SET NULL,
  CONSTRAINT uq_offer_brand_slug UNIQUE (brand_id, slug),
  CONSTRAINT ck_offer_slug_kebab CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  CONSTRAINT ck_offer_type CHECK (type IN ('regular','renewal')),
  CONSTRAINT ck_offer_renewal_requires_ref CHECK (
    (type='regular' AND renews_offer_id IS NULL)
    OR (type='renewal' AND renews_offer_id IS NOT NULL)
  )
);

CREATE TABLE offer_condition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES offer(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  priority int NOT NULL DEFAULT 0,
  advantage_score numeric(8,2) NOT NULL DEFAULT 0,
  status offer_condition_status NOT NULL DEFAULT 'draft',
  is_public boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES user_account(id) ON DELETE SET NULL,
  CONSTRAINT ck_offer_condition_priority_range CHECK (priority BETWEEN -1000 AND 1000)
);
CREATE UNIQUE INDEX uq_offer_condition_default_per_offer
  ON offer_condition (offer_id) WHERE is_default = true AND status = 'active';
CREATE INDEX idx_offer_condition_offer ON offer_condition (offer_id);

CREATE TABLE offer_condition_rule_group (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_condition_id uuid NOT NULL REFERENCES offer_condition(id) ON DELETE CASCADE,
  parent_group_id uuid REFERENCES offer_condition_rule_group(id) ON DELETE CASCADE,
  operator offer_rule_operator NOT NULL DEFAULT 'and',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_offer_rule_group_root
  ON offer_condition_rule_group (offer_condition_id) WHERE parent_group_id IS NULL;

CREATE TABLE offer_condition_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES offer_condition_rule_group(id) ON DELETE CASCADE,
  kind offer_rule_kind NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_offer_condition_rule_group ON offer_condition_rule (group_id);

CREATE TABLE offer_condition_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_condition_id uuid NOT NULL REFERENCES offer_condition(id) ON DELETE CASCADE,
  kind offer_condition_item_kind NOT NULL,
  product_id uuid REFERENCES product(id) ON DELETE RESTRICT,
  commercial_benefit_id uuid REFERENCES commercial_benefit(id) ON DELETE RESTRICT,
  quantity int NOT NULL DEFAULT 1,
  access_rule jsonb NOT NULL DEFAULT '{}',
  vigency_months int,
  discount numeric(12,2),
  responsible_user_id uuid REFERENCES user_account(id) ON DELETE SET NULL,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_offer_condition_item_quantity CHECK (quantity > 0),
  CONSTRAINT ck_offer_condition_item_ref_exclusive CHECK (
    (product_id IS NOT NULL AND commercial_benefit_id IS NULL AND kind <> 'commercial_benefit')
    OR
    (product_id IS NULL AND commercial_benefit_id IS NOT NULL AND kind = 'commercial_benefit')
  )
);
CREATE INDEX idx_offer_condition_item_condition ON offer_condition_item (offer_condition_id);

CREATE TABLE offer_payment_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_condition_id uuid NOT NULL REFERENCES offer_condition(id) ON DELETE CASCADE,
  method offer_payment_method NOT NULL,
  price numeric(12,2) NOT NULL,
  installments int,
  custom_config jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_offer_payment_option_price CHECK (price >= 0),
  CONSTRAINT ck_offer_payment_option_installments CHECK (
    (method = 'installments' AND installments IS NOT NULL AND installments > 1)
    OR (method <> 'installments')
  )
);

CREATE TABLE offer_sales_counter (
  offer_id uuid PRIMARY KEY REFERENCES offer(id) ON DELETE CASCADE,
  approved_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

## 4. Relações (ASCII)

```
brand ──< offer >── legal_entity (issuing)
              │
              └─< offer_condition ──< offer_condition_rule_group ──< offer_condition_rule
                       │                        └── (auto-referência parent_group_id)
                       ├─< offer_condition_item >── product
                       │                       └── commercial_benefit
                       └─< offer_payment_option

offer 1—1 offer_sales_counter
offer (type=renewal) ──renews_offer_id──> offer
```

## 5. Invariantes

- `INV-OFFER-01`: toda `offer` ativa tem pelo menos **1 condição com `is_default=true` e `status='active'`** (índice parcial único garante unicidade; guard na Server Action garante existência).
- `INV-OFFER-02`: `offer_condition.priority` e `advantage_score` mudanças ficam em `offer_condition_priority_history` (trigger append-only).
- `INV-OFFER-03`: `offer.issuing_legal_entity_id` **não pode** ser alterado após a primeira `transaction` com `status IN ('approved','pending')` referenciando a oferta. Enforçado por Server Action + trigger.
- `INV-OFFER-04`: `offer.type='renewal'` ⇒ `renews_offer_id IS NOT NULL` (CHECK).
- `INV-OFFER-05`: cada `offer_condition` tem **exatamente 1** grupo de regras raiz (`parent_group_id IS NULL`). Índice parcial único.
- `INV-OFFER-06`: `offer_condition_item.quantity > 0` (CHECK).
- `INV-OFFER-07`: item com `kind='commercial_benefit'` aponta para `commercial_benefit_id`; demais kinds apontam para `product_id`. CHECK `ck_offer_condition_item_ref_exclusive`.
- `INV-OFFER-08`: `offer_payment_option` com `method='installments'` exige `installments > 1`.
- `INV-OFFER-09`: `offer_sales_counter.approved_count` é monotônico; só cresce (trigger bloqueia DECREMENT exceto por job de manutenção explícito).
- `INV-OFFER-10`: regras combinam sempre dentro de grupo; regra solta sem grupo é inválida (FK `group_id NOT NULL`).

## 6. Estados e transições

### 6.1 `offer.status` (enum `offer_status`)

| De | Evento | Para | Guard |
|---|---|---|---|
| `draft` | publicar | `active` | tem ≥1 condição ativa com `is_default=true` |
| `active` | pausar | `paused` | — |
| `paused` | retomar | `active` | — |
| `active` \| `paused` | arquivar | `archived` | sem transações `pending` |
| `archived` | — | — | terminal |

Toda transição registra em `offer_status_history`.

### 6.2 `offer_condition.status` (enum `offer_condition_status`)

| De | Evento | Para | Guard |
|---|---|---|---|
| `draft` | publicar | `active` | tem ≥1 `offer_payment_option` ativa e ≥1 item |
| `active` | pausar | `paused` | não é a `is_default` da oferta ativa (condição padrão não pausa) |
| `paused` | retomar | `active` | — |
| qualquer | arquivar | `archived` | não é `is_default` |

## 7. Regras de negócio referenciadas

- [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md) — hierarquia de desempate.
- [`BR-OFFER-ELIGIBILITY`](../50-business-rules/BR-OFFER-ELIGIBILITY.md) — avaliação de regras e contador atômico.
- [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md) — compra única por oferta.
- [`BR-RENEWAL`](../50-business-rules/BR-RENEWAL.md) — ofertas de renovação e exceção de unicidade.
- [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md) — mudanças futuras em oferta não afetam snapshots passados.

## 8. Eventos de timeline emitidos

Nenhum emitido diretamente por MOD-OFFER. Quando uma oferta é usada numa venda, os eventos `TE-SALE-*` são emitidos por MOD-TRANSACTION. Auditoria de mudança em oferta vai para `audit_log` (BR-AUDIT).

## 9. Fluxos relacionados

- `FLOW-OFFER-SETUP` — criar oferta + condição padrão + item + payment option antes de publicar.
- `FLOW-OFFER-DECISION` — chamada de `selectCondition` no contexto de venda. Ver §11 (passos) em [`60-flows/04-sale-ingestion.md`](../60-flows/).
- `FLOW-OFFER-SALES-COUNTER-RACE` — demonstra 31+ vendas aprovadas em race (ADR-07).

## 10. Casos de teste obrigatórios

- `offer.create.happy` — oferta draft com 1 condição default ativa e 1 item + 1 payment option.
- `offer.publish.rejects-without-default-condition` — publicar sem `is_default` viola `INV-OFFER-01`.
- `offer.issuing_legal_entity.immutable-after-sale` — tentar alterar `issuing_legal_entity_id` após transação aprovada é bloqueado.
- `offer_condition.default.unique-per-offer` — tentar marcar segunda condição como default com status active viola índice parcial único.
- `offer_condition_rule_group.root.unique-per-condition` — tentar criar segundo grupo raiz falha.
- `offer_condition_item.commercial_benefit.kind-consistency` — `kind='commercial_benefit'` sem `commercial_benefit_id` falha CHECK.
- `offer_payment_option.installments.requires-gt-1` — `method='installments'` com `installments=1` falha CHECK.
- `offer.type-renewal.requires-renews-offer-id` — oferta `type='renewal'` sem `renews_offer_id` falha CHECK.
- `offer_sales_counter.increment.monotonic` — incrementos concorrentes serializam; valor nunca decresce.
- `decision.select.fallback-when-no-rules` — oferta com só a condição default aplica default.
- `decision.select.priority-wins` — condição priority=10 vence condição priority=5 com score maior (prioridade > score).
- `decision.select.score-tiebreak` — empate de priority resolve pelo maior `advantage_score`.
- `decision.select.conflict-on-full-tie` — empate em priority + score + created_at → retorna `kind='conflict'`.

## 11. Fluxo principal: decisão de condição (`selectCondition`)

```
Input: offerId, ctx = DecisionContext

1. Carregar oferta. Se status <> 'active' → erro.
2. Carregar todas condições com status='active' da oferta.
3. Para cada condição:
     elig = evaluateEligibility(condition, ctx)
     (avalia grupo raiz recursivamente; operator AND/OR; nesting OK)
   Filtrar candidatos = [c where elig === true].
4. Se candidatos vazio → retornar a condição default como fallback
   (guard: default sempre elegível por construção — suas regras não podem bloquear default;
    se default tem regras e não passa, considerar erro de configuração).
5. Ordenar candidatos por (priority DESC, advantage_score DESC, created_at DESC).
6. Se o topo empata em priority+advantage_score+created_at com o próximo →
     retornar { kind: 'conflict', candidateConditionIds: tied }.
7. Caso contrário → retornar { kind: 'selected', conditionId: top.id, reason: '...'}.
```

Detalhes de avaliação, casos de empate e tratamento de conflito em [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md) e [`BR-OFFER-ELIGIBILITY`](../50-business-rules/BR-OFFER-ELIGIBILITY.md).

## 12. Open Questions

- `OQ-OFFER-01` — condição default pode ter regras? Proposta atual: **sim, mas com guard** que bloqueia publicação se a default não for elegível num contexto mínimo (brand + now). Confirmar com negócio.
- `OQ-OFFER-02` — `created_at DESC` como terceiro desempate — e se duas condições foram criadas no mesmo milissegundo (batch)? Precisamos de `id` como quarto desempate? Hoje marca conflito.
- `OQ-OFFER-03` — `channel_kind` do PRD não inclui `site` e `api` que aparecem em `DecisionContext.channel`; alinhar enum ou usar campo free-text no contexto.
- `OQ-OFFER-04` — `offer_payment_option.custom_config` precisa de schema canônico por `method`? Hoje livre.
- `OQ-OFFER-05` — ao arquivar oferta com contador >0, o counter é preservado (sim, por histórico); confirmar política de recriação ao reativar.
