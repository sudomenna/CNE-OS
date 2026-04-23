# FLOW-04: Decisão da condição comercial aplicada

## Gatilho / pré-condições

Invocado sempre que é necessário resolver **qual `offer_condition` aplicar** em um contexto dado. Invocadores:

- `createPendingTransaction` / `approveTransaction` (MOD-TRANSACTION) — [`FLOW-05`](./05-external-sale-ingest.md);
- venda interna iniciada por operador (painel de comercial);
- preview em UI de checkout (não vinculativo; preview não incrementa contador).

Pré-condições: `offer.status='active'`; `offer_condition` existe com ao menos 1 registro `status='active'` **ou** `is_default=true`.

## Atores

- humano: operador (venda interna) ou contato (checkout público).
- sistema: `MOD-OFFER.selectCondition`, `MOD-OFFER.evaluateEligibility`, leitores de `offer_sales_counter`.
- integração: não participa.

## Passos

1. **Receber `DecisionContext`**: `{ contactId, brandId, now, campaignId?, creativeId?, channel?, isInternal? }`. Mode: `preview` ou `commit`.
2. **Carregar `offer`**. Se `status <> 'active'` ⇒ `OfferNotActive` (erro `E-01`).
3. **Carregar todas `offer_condition`** com `status='active'` para a oferta. Se nenhuma: ir ao passo 6.
4. **Avaliar elegibilidade** por condição via `evaluateEligibility(conditionId, ctx)` — [`BR-OFFER-ELIGIBILITY`](../50-business-rules/BR-OFFER-ELIGIBILITY.md). Cada avaliação consulta regras em `offer_condition_rule_group`/`offer_condition_rule` e, quando aplicável, lê `offer_sales_counter.approved_count`.
5. **Filtrar candidatos elegíveis**. Se vazio: ir ao passo 6. Se não vazio: ir ao passo 7.
6. **Fallback default**:
   - buscar condição com `is_default=true AND status='active'`.
   - se existir ⇒ retornar `{ kind:'selected', conditionId, reason:'fallback_default' }`.
   - se não existir ⇒ `NoConditionApplicable` (erro `E-02`).
7. **Ordenar candidatos** por `(priority DESC, advantage_score DESC, created_at DESC)` — [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md).
8. **Desempate**:
   - se `candidatos[0]` difere de `candidatos[1]` em alguma chave ⇒ retornar `{ kind:'selected', conditionId: top.id, reason:'priority_<p>_score_<s>_created_<ts>' }`.
   - se empate total (todas 3 chaves iguais) ⇒ retornar `{ kind:'conflict', candidateConditionIds: [...] }`.
9. **Caller decide**:
   - `selected` + `mode='commit'` ⇒ prossegue (FLOW-05 incrementa counter na aprovação).
   - `conflict` ⇒ caller abre `contact_issue kind='offer_conflict'` com os candidatos e mantém transação em `pending`; emite `TE-CONTACT-ISSUE-OPENED`.
   - `preview` ⇒ apenas retorna, sem efeito colateral.

## Pós-condições

- Nenhum estado mutado (este fluxo é **função pura + leituras**).
- Quando em `conflict`, o caller (FLOW-05) cria `contact_issue` e deixa transação `pending`.
- Preview: nenhum efeito.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `offer.status <> 'active'` | `OfferNotActive` | publicar oferta ou usar outra |
| E-02 | sem elegíveis e sem default | `NoConditionApplicable` | corrigir configuração da oferta (bloquear publicação sem default — `OQ-BR-DECISION-02`) |
| E-03 | empate total | retorna `conflict`; caller abre pendência | operador resolve manualmente no UI escolhendo condição |
| E-04 | `evaluateEligibility` lança por regra mal-formada | propaga `InvalidRuleParamsError`; caller registra | corrigir rule em painel |
| E-05 | `offer_sales_counter` ausente (oferta nova) | auto-criar linha com `approved_count=0` | — |

## Regras referenciadas

- [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md)
- [`BR-OFFER-ELIGIBILITY`](../50-business-rules/BR-OFFER-ELIGIBILITY.md)
- [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md) (aplicado pelo caller após decisão, antes do INSERT)

## Eventos emitidos

Este fluxo **não emite eventos próprios**. Em caso de `conflict` o caller emite `TE-CONTACT-ISSUE-OPENED` (`MOD-CONTACT`).

## Observabilidade

- Métricas:
  - `offer_decision_total{offer_id, outcome}` (outcome: `selected|fallback_default|conflict|error`);
  - `offer_decision_latency_ms{offer_id}`;
  - `offer_conflict_total{offer_id}`;
  - `offer_eligibility_eval_total{rule_kind}`.
- Logs (`correlation_id`, `offer_id`, `condition_id?`, `reason`, `flow='FLOW-04'`).
- Alertas:
  - Sentry: `NoConditionApplicable` > 0 (configuração quebrada em produção).
  - Axiom: taxa de `conflict` acima de 1% — revisar dados (sugestão de desempate por `created_at` já cobre 99%).

## Casos de teste E2E obrigatórios

1. **default-unica-condicao**
   - Given: oferta com 1 condição `is_default=true status=active` sem regras adicionais.
   - When: `selectCondition(offer, ctx)`.
   - Then: `{selected, conditionId:default.id, reason:'fallback_default'}`.

2. **prioridade-vence-score**
   - Given: A `priority=10 score=1`; B `priority=5 score=100`; ambas elegíveis.
   - When: decide.
   - Then: retorna A.

3. **desempate-por-created_at**
   - Given: A e B com `priority` e `score` iguais, `created_at` distintos.
   - When: decide.
   - Then: retorna a mais recente.

4. **conflict-empate-total-abre-pendencia**
   - Given: A e B com tripla idêntica; FLOW-05 chamador.
   - When: decide.
   - Then: resultado `conflict`; FLOW-05 abre `contact_issue kind='offer_conflict'`; transação permanece `pending`.

5. **fallback-quando-nenhum-elegivel**
   - Given: 3 condições falham regras; default elegível.
   - When: decide.
   - Then: default com `reason='fallback_default'`.

6. **sales-count-cap-elegibilidade**
   - Given: regra `sales_count_reached(max=30)`, `approved_count=30`.
   - When: `evaluateEligibility`.
   - Then: `false`; se essa era a única elegível e default existe, retorna default.

## Open Questions

- `OQ-FLOW-04-01` — UI de resolução de `conflict`: operador escolhe manualmente ou sistema oferece ranking alternativo? Cruz com `OQ-BR-DECISION-03`.
- `OQ-FLOW-04-02` — preview em checkout público deve omitir condições `is_public=false`? Proposta: sim.
