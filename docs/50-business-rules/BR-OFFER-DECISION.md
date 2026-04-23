# BR-OFFER-DECISION: qual condição aplicar numa venda

## Enunciado

Dada uma `offer` ativa e um contexto de venda (marca, contato, data, canal, campanha, criativo, flag interno), o sistema **deve selecionar exatamente uma `offer_condition`** para aplicar, seguindo hierarquia objetiva de desempate. Caso não seja possível desempatar, o sistema **marca conflito** e **não aplica** condição automaticamente.

## Motivação

Evitar decisão arbitrária ou dependente de ordem de leitura do banco. Toda venda registra qual condição aplicou **e por quê** (campo `reason`), viabilizando auditoria. "Mais vantajosa" foi substituído por `advantage_score` numérico, manual, para tornar o critério determinístico (ver PRD §9.9.6 e §9.9.7).

## Escopo

- Módulos afetados: [`MOD-OFFER`](../20-domain/10-offer-engine.md), [`MOD-TRANSACTION`](../20-domain/11-transaction-snapshot.md).
- Entidades: `offer`, `offer_condition`, `offer_condition_rule_group`, `offer_condition_rule`.

## Enforcement

- [ ] DB constraint (SQL)
- [ ] DB trigger
- [x] Função de domínio pura (`selectCondition`)
- [x] Guard em Server Action (venda chama `selectCondition` antes de gravar transação)
- [ ] Guard em UI (UI pode mostrar preview, mas a decisão autoritativa é server-side)

## Contrato TS

```ts
export type DecisionContext = {
  contactId: string;
  brandId: string;
  now: Date;
  campaignId?: string;
  creativeId?: string;
  channel?: 'whatsapp' | 'instagram' | 'email' | 'site' | 'api';
  isInternal?: boolean;
};

export type DecisionResult =
  | { kind: 'selected'; conditionId: string; reason: string }
  | { kind: 'conflict'; candidateConditionIds: string[]; reason: 'tie_on_all_desempate' };

export async function selectCondition(
  offerId: string,
  ctx: DecisionContext,
): Promise<DecisionResult>;
```

Implementação canônica em `lib/domain/offer/decision.ts`. Não aceita fallback silencioso para primeira condição lexicográfica; empate real é **sempre** `conflict`.

## Algoritmo

```
1. Carregar offer. Se status <> 'active' → lançar OfferNotActive.
2. Carregar todas offer_condition com status='active' para este offer_id.
3. Para cada condição: eligible = evaluateEligibility(condition, ctx)  — ver BR-OFFER-ELIGIBILITY.
4. Filtrar candidatos = [c where eligible].
5. Se candidatos vazio:
     default = condição com is_default=true e status=active.
     retornar { kind: 'selected', conditionId: default.id, reason: 'fallback_default' }.
6. Ordenar candidatos por (priority DESC, advantage_score DESC, created_at DESC).
7. Se len(candidatos) >= 2 e top[0] empata com top[1] em (priority, advantage_score, created_at)
     (ou seja, todas três chaves iguais) → coletar todos empatados → { kind: 'conflict', ... }.
8. Caso contrário retornar { kind: 'selected', conditionId: top[0].id,
     reason: 'priority_<p>_score_<s>_created_<ts>' }.
```

## Tabela de decisão (desempate)

| Passo | Critério | Sentido | O que decide |
|---|---|---|---|
| 1 | Elegibilidade (`evaluateEligibility`) | filtro | se passa ou não |
| 2 | `priority` | DESC | maior vence |
| 3 | `advantage_score` | DESC | maior vence |
| 4 | `created_at` | DESC | mais recente vence |
| 5 | Empate total | — | **conflito**: abrir `contact_issue` kind `offer_conflict`, manter transação `pending` |

## Casos de teste (Given/When/Then)

### CT-DECISION-01 — Só condição default, contexto vazio
- **Given** oferta ativa com 1 condição `is_default=true, status=active` sem regras adicionais; `ctx = { contactId, brandId, now }`.
- **When** `selectCondition(offer.id, ctx)`.
- **Then** retorna `{ kind: 'selected', conditionId: default.id, reason: 'fallback_default' }` (ou `priority_0_...` se default é elegível por construção).

### CT-DECISION-02 — Duas condições, prioridade vence score
- **Given** condição A `priority=10, advantage_score=1`; condição B `priority=5, advantage_score=100`; ambas elegíveis.
- **When** `selectCondition`.
- **Then** retorna A.

### CT-DECISION-03 — Empate em prioridade resolve por score
- **Given** A `priority=10, advantage_score=5`; B `priority=10, advantage_score=8`.
- **When** decisão.
- **Then** retorna B.

### CT-DECISION-04 — Empate em prioridade e score resolve por created_at
- **Given** A `priority=10, advantage_score=5, created_at=2026-01-01`; B mesmos valores mas `created_at=2026-03-01`.
- **When** decisão.
- **Then** retorna B (mais recente).

### CT-DECISION-05 — Empate total vira conflict
- **Given** A e B com mesmos `priority`, `advantage_score` e `created_at` (cenário raro mas possível via import em batch).
- **When** decisão.
- **Then** `{ kind: 'conflict', candidateConditionIds: [A.id, B.id] }`. Venda não prossegue; `contact_issue` aberto (feito pelo caller).

### CT-DECISION-06 — Nenhum candidato elegível cai no fallback
- **Given** 3 condições, todas com regras que falham no contexto; existe default.
- **When** decisão.
- **Then** retorna default com `reason='fallback_default'`.

## Rastreabilidade

- Teste esperado: `tests/unit/offer/decision.test.ts` (matriz dos 6 CTs acima + fuzzing de empates).
- Referenciada em: [`MOD-OFFER §11`](../20-domain/10-offer-engine.md#11-fluxo-principal-decisão-de-condição-selectcondition), [`MOD-TRANSACTION §10`](../20-domain/11-transaction-snapshot.md#10-fluxo-principal-approvetransaction-passos-atômicos).
- PRD origem: §9.9.6, §9.9.7.

## Open Questions

- `OQ-BR-DECISION-01` — `reason` do resultado deve ser estruturado (`{ priority, score, created_at }`) em vez de string concatenada? Útil para UI de auditoria.
- `OQ-BR-DECISION-02` — quando a default tem regras que falham no contexto mínimo, isso é erro de configuração (bloquear publicação) ou caso válido (retornar conflict)? Proposta: bloquear publicação.
- `OQ-BR-DECISION-03` — operadores devem resolver conflito no UI escolhendo manualmente a condição? Fluxo detalhado em FLOW a criar.
