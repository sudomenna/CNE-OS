# FLOW-03: Ciclo de vida da oportunidade no funil

## Gatilho / pré-condições

Uma das condições abaixo:

- contato clica em link rastreável (`trackable_link`) associado a campanha/criativo de um funil;
- operador move manualmente um contato para um funil via UI;
- automação (`automation_trigger_kind='funnel_enter'`) cria oportunidade;
- ingestão (`FLOW-01`) recebe payload com `funnel_id`.

Pré-condições: existe `funnel.is_active=true` e `funnel_stage` inicial configurado. Contato existe (invocar [`FLOW-01`](./01-contact-ingestion.md) antes quando necessário).

## Atores

- humano: comercial / marketing (movimentação manual).
- sistema: `MOD-FUNNEL`, `MOD-AUTOMATION`, `MOD-CAMPAIGN`.
- integração: clique em `trackable_link` passa pelo redirector interno (edge function).

## Passos

1. **Entrada (`enterFunnel`)** — `BR-FUNNEL-OPPORTUNITY` §1:
   - chave `(contact_id, funnel_id)`; se já existe `funnel_entry` com `label NOT IN ('won','lost')`, retorna `{created:false, entry}` — idempotente.
   - caso contrário INSERT `funnel_entry` com `current_stage_id = funnel.default_stage`, `label='open'`, `score=0`, `entry_origin`, `entry_campaign_id`, `entry_creative_id` preenchidos a partir do contexto.
   - emite `TE-FUNNEL-ENTERED`.
2. **Movimentação de estágio (`moveStage`)**:
   - registra `funnel_entry_stage_history (from,to,changed_by,reason)`;
   - atualiza `current_stage_id`;
   - emite `TE-FUNNEL-STAGE-CHANGED`;
   - dispara avaliação de automações com trigger `funnel_stage_change`.
3. **Recompute score (`recomputeScore`)** quando evento relevante ocorre (mensagem inbound, clique, venda aprovada) e existe `funnel_score_rule` ativa casando o `event_kind`:
   - aplica `delta`; INSERT em `funnel_entry_score_history`.
4. **Transição de etiqueta (`setOpportunityLabel`)** — macro: `open → negotiating → concluded` (ou saltos). Manual ou por automação. Emite `TE-OPPORTUNITY-LABEL-CHANGED`.
5. **Ganho (`markWon(entryId, transactionId, conversion?)`)** — invocado por [`FLOW-05`](./05-external-sale-ingest.md) ao aprovar venda da oferta principal do funil:
   - exige `transaction_id NOT NULL` (CK `ck_won_requires_tx`);
   - preenche `conversion_origin`, `conversion_campaign_id`, `conversion_creative_id` com base no contexto (último clique rastreado dentro da janela de atribuição — ver [`FLOW-14`](./14-campaign-attribution.md));
   - atualiza `label='won'`;
   - emite `TE-OPPORTUNITY-WON`.
   - idempotente: chamada repetida com mesmo `transactionId` em `won` é no-op.
6. **Perda (`markLost(entryId, reason)`)**:
   - exige `lost_reason NOT NULL`;
   - `label='lost'`;
   - emite `TE-OPPORTUNITY-LOST`.
7. **Reabertura em refund** — ver [`FLOW-07`](./07-refund-end-to-end.md) passo 6: `won → reopened` (ou proxy `open` até enum ser estendido, `OQ-BR-REFUND-04`).
8. **Compra off-channel**: operador cria/reativa `funnel_entry` manualmente e chama `markWon` com `transaction_id` da compra fora do funil (`BR-FUNNEL-OPPORTUNITY` §3).

## Pós-condições

- `funnel_entry` reflete estado atual determinístico.
- `funnel_entry_stage_history` e `funnel_entry_score_history` são append-only e refletem integralmente a trajetória.
- Quando `won`: `transaction_id` e `conversion_*` preenchidos.
- Quando `lost`: `lost_reason` preenchido.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `enterFunnel` em par já ativo | retorna entrada existente (idempotente) | — |
| E-02 | `moveStage` para estágio de funil diferente | `StageFunnelMismatchError` | validar UI |
| E-03 | `markWon` sem `transaction_id` | `WonRequiresTransactionError` | garantir caller fornece |
| E-04 | `markLost` sem `reason` | `LostRequiresReasonError` | UI obriga campo |
| E-05 | dois funis vendem a mesma oferta (`OQ-BR-FUNNEL-01`) | fechar oportunidade com `entry_date` mais recente | aguardar decisão formal |
| E-06 | automação tenta mover estágio em oportunidade `won`/`lost` | rejeitar; log informativo | — |

## Regras referenciadas

- [`BR-FUNNEL-OPPORTUNITY`](../50-business-rules/BR-FUNNEL-OPPORTUNITY.md)
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md) (`funnel.write` para marketing/comercial)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)
- [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md) (contexto da conversão)

## Eventos emitidos

- `TE-FUNNEL-ENTERED`
- `TE-FUNNEL-STAGE-CHANGED`
- `TE-OPPORTUNITY-LABEL-CHANGED`
- `TE-OPPORTUNITY-WON`
- `TE-OPPORTUNITY-LOST`

## Observabilidade

- Métricas:
  - `funnel_entry_created_total{funnel_id}`;
  - `funnel_stage_transitions_total{funnel_id, from, to}`;
  - `funnel_won_total{funnel_id}` e `funnel_lost_total`;
  - `funnel_conversion_rate{funnel_id}` (deriva).
- Logs (`correlation_id`, `contact_id`, `funnel_id`, `entry_id`, `flow='FLOW-03'`).
- Alertas:
  - Sentry: violação do índice único de oportunidade ativa (indica race).
  - Axiom: pipeline visual — estágios com acúmulo anormal.

## Casos de teste E2E obrigatórios

1. **enter-idempotente**
   - Given: oportunidade E1 ativa em `(C, F)`.
   - When: `enterFunnel({C,F})` novamente.
   - Then: `{created:false}`; nenhuma linha nova; nenhum evento emitido.

2. **stage-change-dispara-automation**
   - Given: `automation_rule` ativa com trigger `funnel_stage_change`, filtro `funnel_id=F, to_stage_id=S2`.
   - When: `moveStage(E1, S2)`.
   - Then: `TE-FUNNEL-STAGE-CHANGED` + `automation_execution` criada.

3. **won-preenche-conversion-e-emite-evento**
   - Given: E1 ativa; T aprovada via FLOW-05 da oferta do funil.
   - When: `markWon(E1, T.id, {conversion_creative_id:C1})`.
   - Then: `label='won'`, `transaction_id=T.id`, `conversion_*` preenchidos; `TE-OPPORTUNITY-WON`.

4. **lost-exige-motivo**
   - Given: E1 ativa.
   - When: `markLost(E1, '')`.
   - Then: `LostRequiresReasonError`.

5. **score-aumenta-com-mensagem-inbound**
   - Given: `funnel_score_rule(event_kind='message_inbound', delta=+5)` ativa em F; contato C em E1.
   - When: [`FLOW-02`](./02-omnichannel-message.md) processa inbound.
   - Then: `E1.score += 5`; linha em `funnel_entry_score_history`.

6. **off-channel-won-manual**
   - Given: contato sem entrada ativa; operador seleciona funil F; T existe.
   - When: cria `funnel_entry` + `markWon(entry, T.id)`.
   - Then: nova entrada com `label='won'`, `transaction_id=T.id`.

7. **refund-reabre-opportunity**
   - Given: E1 `won` com T1.
   - When: FLOW-07 aprova refund em T1.
   - Then: `label='reopened'` (ou `open` por proxy, `OQ-BR-REFUND-04`).

## Open Questions

- `OQ-FLOW-03-01` — duas oportunidades em funis distintos vendendo a mesma oferta: qual fecha no `markWon` automático (`OQ-BR-FUNNEL-01`)? Proposta: a mais recente com `label NOT IN ('won','lost')`.
- `OQ-FLOW-03-02` — score deve ter cap inferior/superior (evitar negativo extremo)? Cruz com `OQ-FUNNEL-02`.
