# BR-OFFER-ELIGIBILITY: regras de elegibilidade e contador atômico

## Enunciado

Uma `offer_condition` é **elegível** em um contexto de venda se **todas** as regras do seu grupo raiz avaliam para `true`, respeitando os operadores lógicos de cada grupo (`and`/`or`) e o aninhamento de subgrupos. A regra `sales_count_reached` é avaliada contra o contador atômico `offer_sales_counter.approved_count`; o incremento ocorre na aprovação da venda e pode permitir excesso sob concorrência (ver [`ADR-07`](../90-meta/04-decision-log.md#adr-07)).

## Motivação

Suportar campanhas temporais, limites de vendas ("30 primeiros"), restrições por canal/criativo/campanha e combinações E/OU, com comportamento previsível e testável. Contador atômico evita escanear `transaction` para decidir.

## Escopo

- Módulo: [`MOD-OFFER`](../20-domain/10-offer-engine.md).
- Entidades: `offer_condition_rule_group`, `offer_condition_rule`, `offer_sales_counter`.

## Enforcement

- [x] Função de domínio pura (`evaluateEligibility`, `evaluateRuleGroup`)
- [x] Guard em Server Action (venda chama antes de decidir)
- [x] DB constraint indireta: incremento do counter em `UPDATE ... RETURNING` serializado por linha

## Tipos de regra (`offer_rule_kind`) e schema de `params`

| Kind | Params (jsonb) | Semântica | Elegível quando |
|---|---|---|---|
| `date_range` | `{ start_at: ISO8601, end_at: ISO8601 }` | vigência | `start_at <= ctx.now < end_at` |
| `sales_count_reached` | `{ max: int }` | limite de vendas aprovadas na oferta | `offer_sales_counter.approved_count < max` |
| `campaign` | `{ campaign_ids: uuid[] }` | restrição a campanhas | `ctx.campaignId ∈ campaign_ids` |
| `channel` | `{ channels: channel_kind[] }` | restrição a canais | `ctx.channel ∈ channels` |
| `creative` | `{ creative_ids: uuid[] }` | restrição a criativos | `ctx.creativeId ∈ creative_ids` |
| `internal_use` | `{}` | só comercial interno | `ctx.isInternal === true` |

Regra ausente do grupo ⇒ não influencia (não é "false" automático).

## Combinação lógica

Grupo tem `operator: 'and' | 'or'` e pode conter filhos de dois tipos:
- `offer_condition_rule` (regra atômica)
- `offer_condition_rule_group` (subgrupo, via `parent_group_id`)

Avaliação recursiva de `evaluateRuleGroup(group, ctx)`:
- `and`: `true` se todos os filhos (regras + subgrupos) avaliam `true`; vazio ⇒ `true`.
- `or`:  `true` se pelo menos um filho avalia `true`; vazio ⇒ `false`.

## Contrato TS

```ts
export type RuleParams = Record<string, unknown>;

export async function evaluateEligibility(
  conditionId: string,
  ctx: DecisionContext,
): Promise<boolean>;

export async function evaluateRuleGroup(
  groupId: string,
  ctx: DecisionContext,
): Promise<boolean>;

// Incremento atômico do contador (chamado só no momento de aprovar venda).
export async function incrementSalesCounter(
  offerId: string,
  txDb: DrizzleTx,
): Promise<number>;
```

## DDL relevante (resumo)

```sql
-- Contador
CREATE TABLE offer_sales_counter (
  offer_id uuid PRIMARY KEY REFERENCES offer(id) ON DELETE CASCADE,
  approved_count bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Incremento atômico (dentro da transação SQL da venda)
UPDATE offer_sales_counter
SET approved_count = approved_count + 1, updated_at = now()
WHERE offer_id = $1
RETURNING approved_count;
```

## Concorrência (ADR-07)

Sequência de uma venda que passa por regra `sales_count_reached(max=30)`:

1. Ler `approved_count` durante avaliação (ex.: `SELECT`).
2. Decidir elegibilidade com base nesse valor.
3. Aprovar transação → `UPDATE` do contador dentro da transação SQL.

Entre os passos 1 e 3, outra conexão pode fazer o mesmo. Postgres serializa o UPDATE na linha, mas **não** serializa o SELECT anterior. Resultado: com 10 conexões concorrentes e `approved_count=29`, **todas 10** podem passar a avaliação e aprovar, virando o contador para 39. Comportamento **aceito** por ADR-07; operação corrige manualmente. Para mitigar parcialmente, o UPDATE pode incluir re-check:

```sql
UPDATE offer_sales_counter
SET approved_count = approved_count + 1, updated_at = now()
WHERE offer_id = $1
  AND approved_count < $max   -- opcional: reforço em runtime
RETURNING approved_count;
```

Quando ausente o WHERE, o excesso flui; quando presente, a venda abortará em transações subsequentes ao limite. Decisão Fase 1: **sem o re-check** (conforme ADR-07), para simplicidade.

## Casos de teste (Given/When/Then)

### CT-ELIG-01 — date_range passa dentro da janela
- **Given** regra `date_range({start_at: 2026-04-01, end_at: 2026-05-01})`; `ctx.now = 2026-04-15`.
- **When** `evaluateEligibility`.
- **Then** `true`.

### CT-ELIG-02 — date_range falha fora
- **Given** mesma regra; `ctx.now = 2026-06-01`.
- **When** avalia.
- **Then** `false`.

### CT-ELIG-03 — sales_count_reached liga/desliga no limite
- **Given** regra `sales_count_reached({max: 30})`; `approved_count=29`.
- **When** avalia.
- **Then** `true`.
- **Given'** `approved_count=30`.
- **Then'** `false`.

### CT-ELIG-04 — AND exige todas
- **Given** grupo `and` com `date_range` (passa) + `campaign([X])` (falha).
- **When** avalia.
- **Then** `false`.

### CT-ELIG-05 — OR aceita qualquer
- **Given** grupo `or` com `date_range` (passa) + `sales_count_reached` (falha).
- **When** avalia.
- **Then** `true`.

### CT-ELIG-06 — Aninhamento: "(campanha X e até 30) OU (canal WA)"
- **Given** raiz `or`, com subgrupo A `and [campaign([X]), sales_count_reached(30)]` e regra B `channel([whatsapp])`.
- **When** `ctx.channel='whatsapp'` (mesmo com A falhando).
- **Then** `true`.

### CT-ELIG-07 — Grupo AND vazio é true; OR vazio é false
- **Given** grupo `and` sem filhos.
- **Then** `true`.
- **Given** grupo `or` sem filhos.
- **Then** `false`.

### CT-ELIG-08 — Race de contador permite excesso
- **Given** `sales_count_reached(30)` e `approved_count=29`; 5 vendas concorrentes.
- **When** todas chamam `evaluateEligibility` (true) e aprovam em sequência.
- **Then** contador termina em 34 (5 incrementos atômicos); comportamento aceito (ADR-07). Operação recebe alerta via dashboard.

## Rastreabilidade

- Teste esperado: `tests/unit/offer/eligibility.test.ts` + `tests/integration/offer/sales-counter-concurrency.test.ts`.
- Referenciada em: [`MOD-OFFER §3.7`](../20-domain/10-offer-engine.md#37-offer_sales_counter), [`BR-OFFER-DECISION`](./BR-OFFER-DECISION.md).
- PRD origem: §9.9.4, §9.9.5, §9.9.8.

## Open Questions

- `OQ-BR-ELIG-01` — incluir `re-check` opcional no UPDATE do counter para ofertas que não aceitam excesso? Exige flag por oferta.
- `OQ-BR-ELIG-02` — `date_range.end_at` é exclusivo; confirmar com negócio (evita "um dia a mais" de surpresa).
- `OQ-BR-ELIG-03` — permitir regra customizada via função SQL plugável? Fase 2.
- `OQ-BR-ELIG-04` — `channel` de `DecisionContext` inclui `site`/`api` que não estão em `channel_kind`. Tarefa serial para alinhar enum.
