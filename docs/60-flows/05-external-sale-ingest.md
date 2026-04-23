# FLOW-05: Ingestão de venda externa (crítico)

## Gatilho / pré-condições

Webhook do provedor de pagamento (Digital Guru) entrega evento de transação: `order.pending`, `order.approved`, `order.refused`, `order.chargeback`. Pré-condições:

- endpoint público autenticado por HMAC;
- oferta existente mapeada pelo `external_product_id` do provedor;
- `webhook_log` tem UNIQUE `(provider, external_event_id)` — [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md).

## Atores

- humano: nenhum (inteiramente automatizado).
- sistema: `MOD-INTEGRATION`, `MOD-CONTACT`, `MOD-TRANSACTION`, `MOD-OFFER`, `MOD-ENTITLEMENT`, `MOD-FUNNEL`, `MOD-BILLING`, `MOD-TIMELINE`.
- integração: `digital_guru`.

## Passos

Todos os passos no processamento de `order.approved` ocorrem **dentro de uma única transação SQL** (seguindo [`MOD-TRANSACTION §10`](../20-domain/11-transaction-snapshot.md#10-fluxo-principal-approvetransaction-passos-atômicos)).

1. **Recepção & idempotência** — `ingestWebhook('digital_guru', externalEventId, payload)`:
   - INSERT em `webhook_log ON CONFLICT DO NOTHING`.
   - duplicado + `processed` ⇒ 200, sem efeito.
   - caso novo ⇒ enfileirar `processWebhook(id)` no Inngest.
2. **Mapeamento canônico** (em `processWebhook`): extrair `{ external_product_id → offer_id, buyer (cpf/email/phone), amount, currency, payment_method, external_id, external_fee, event_kind }`.
3. **Resolver contato** via `resolveContactIdentity` ([`FLOW-01`](./01-contact-ingestion.md)) com `origin='integration'`, `sourceRef=external_event_id`. Obter `contactId`.
4. **Bifurcação por `event_kind`**:
   - `order.pending` ⇒ passo 5 (criar pending).
   - `order.approved` ⇒ passos 5 (se pending não existe) → 6..15.
   - `order.refused` ⇒ passo 16.
   - `order.chargeback` ⇒ passo 17.
5. **Criar/atualizar `transaction` pending** (idempotência via `uq_transaction_external_provider_external_id`):
   - se já existe `transaction` com `(digital_guru, external_id)`: `SELECT FOR UPDATE` a existente;
   - senão INSERT com `status='pending'`, `snapshot_id=NULL`, amount, fees.
   - emite `TE-SALE-PENDING`.
6. **BR-OFFER-UNIQUENESS guard** — `assertUniqueOfferPurchase(contactId, offerId)`:
   - se contato já tem `approved` para essa oferta e **não** é renewal e snapshot anterior não está `refunded` ⇒ marcar transação `cancelled` + log + emitir evento informativo; parar.
   - se `offer.type='renewal'` ⇒ chamar `assertRenewalEligibility` ([`BR-RENEWAL`](../50-business-rules/BR-RENEWAL.md) / [`FLOW-10`](./10-renewal-via-new-offer.md)); violação ⇒ cancelar.
7. **Selecionar condição** — delegar a [`FLOW-04`](./04-offer-condition-decision.md) com contexto `{ contactId, brandId=offer.brandId, now=payload.approved_at, campaignId, creativeId, channel:'api', isInternal:false }`.
   - resultado `conflict` ⇒ abrir `contact_issue kind='offer_conflict'`, manter `pending`, encerrar sem aprovar; `TE-CONTACT-ISSUE-OPENED`.
   - resultado `selected` ⇒ continuar.
8. **Incrementar contador atômico** — `UPDATE offer_sales_counter SET approved_count=approved_count+1 WHERE offer_id=$1 RETURNING approved_count` (aceita excesso — ADR-07).
9. **Compor `transaction_snapshot.payload`** via `composeSnapshot` (função pura): coleta dados congelados de brand, legal_entity (CNPJ emissor do momento), offer, condition, árvore de rules, items com seus `product`/`commercial_benefit`, payment_option, source.
10. **INSERT `transaction_snapshot`** (append-only — [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)).
11. **INSERT `transaction_item`** por item do snapshot (materialização para UI/delivery; snapshot continua sendo fonte da verdade).
12. **UPDATE `transaction`** para `status='approved'`, `snapshot_id=...`, `approved_at=payload.approved_at`; `transaction_status_history` recebe linha.
13. **Conceder direitos** — `MOD-ENTITLEMENT.grantFromTransaction(transactionId)`:
    - por item `kind IN ('main','bonus','upsell','order_bump','complement')` com `product_id`: construir `Entitlement incoming` e chamar `consolidate(existing, incoming)` ([`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md)) — ver [`FLOW-06`](./06-entitlement-update.md);
    - por item `kind='commercial_benefit'`: criar/consolidar `customer_entitlement` de `ref_kind='benefit'`; aplicar `auto_tag` ao contato se configurado;
    - emite `TE-ENTITLEMENT-GRANTED` (ou `TE-ENTITLEMENT-EXTENDED`/`TE-ENTITLEMENT-REACTIVATED`).
14. **Reclassificar contato** — `MOD-CONTACT.reclassify(contactId)` ([`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md)); emite `TE-CONTACT-CLASSIFICATION-CHANGED` se mudou.
15. **Fechar oportunidade** — se existe `funnel_entry` ativa em funil cuja `offer_id` é a comprada, `MOD-FUNNEL.markWon(entryId, transactionId)` ([`FLOW-03`](./03-funnel-opportunity-lifecycle.md)). Se contato não tem entrada ativa mas há funil da oferta, criar e marcar won automaticamente (regra de consolidação — pode ser flag de configuração).
16. **Se assinatura** — `offer.billing_kind='subscription'` ⇒ `MOD-BILLING.createSubscriptionFromTransaction(transactionId)` ([`FLOW-11`](./11-subscription-cycle.md)) com `trial_ends_at`/`current_period_end` derivados.
17. **Emitir eventos** dentro da mesma transação (ordem): `TE-SALE-APPROVED`, `TE-ENTITLEMENT-GRANTED`(xN), `TE-CONTACT-CLASSIFICATION-CHANGED`(opcional), `TE-OPPORTUNITY-WON`(opcional), `TE-SUBSCRIPTION-STARTED`(opcional).
18. **`webhook_log.status='processed'`**; commit.
19. **`order.refused`**: `UPDATE transaction SET status='refused', refused_at=now()`; `TE-SALE-REFUSED`.
20. **`order.chargeback`**: `UPDATE transaction SET status='chargeback'`; INSERT em `transaction_snapshot_flag_history(to_flag='disputed')`; `TE-SALE-CHARGEBACK`. Proposta (`OQ-BR-REFUND-05`): disparar refund automático system-opened.

Qualquer falha ⇒ ROLLBACK total; `webhook_log.attempts++`, `last_error`; Inngest faz backoff até 5 tentativas; depois `dead_letter`.

## Pós-condições (para `order.approved`)

- `transaction.status='approved'`, `snapshot_id` setado, `transaction_snapshot.payload` congelado.
- `transaction_item` inseridos.
- `offer_sales_counter.approved_count` incrementado em 1.
- `customer_entitlement` consolidados refletem nova compra.
- `contact.classification` atualizada se elegível.
- `funnel_entry.label='won'` quando aplicável.
- `subscription` e `installment` inicial criados (se aplicável).
- Timeline do contato reflete 3–6 eventos novos.
- `webhook_log.status='processed'`.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | HMAC inválida | 401; sem persistir | revisar segredo |
| E-02 | `external_product_id` sem oferta mapeada | `webhook_log.failed`, `last_error='unmapped_product'` | cadastrar mapping; reprocess [`FLOW-12`](./12-webhook-reprocess.md) |
| E-03 | contato em blacklist | cancelar transação; log; sem efeitos | revisão humana |
| E-04 | duplicate offer (sem exceção) | transação `cancelled`; nota explicativa | operador decide refund ou cancelamento externo |
| E-05 | `offer_conflict` (tie) | `pending` + `contact_issue`; operador resolve via UI | `FLOW-09` |
| E-06 | grant falha por FK inexistente (produto deletado) | ROLLBACK; alertar | corrigir catálogo |
| E-07 | webhook reentregue entre passos | idempotência por `external_id` unique impede duplicação | — |
| E-08 | provedor notifica approved antes de pending | passo 5 cria pending e imediatamente aprova (sem emitir `TE-SALE-PENDING`? — proposta: emitir sequencial) | — |

## Regras referenciadas

- [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)
- [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md)
- [`BR-OFFER-ELIGIBILITY`](../50-business-rules/BR-OFFER-ELIGIBILITY.md)
- [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md)
- [`BR-RENEWAL`](../50-business-rules/BR-RENEWAL.md)
- [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)
- [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md)
- [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md)
- [`BR-FUNNEL-OPPORTUNITY`](../50-business-rules/BR-FUNNEL-OPPORTUNITY.md)
- [`BR-SUBSCRIPTION`](../50-business-rules/BR-SUBSCRIPTION.md)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)

## Eventos emitidos

Ordem canônica para `order.approved` (na mesma transação SQL):

1. `TE-SALE-PENDING` (se passo 5 criou pending novo).
2. `TE-SALE-APPROVED`.
3. `TE-ENTITLEMENT-GRANTED` / `TE-ENTITLEMENT-EXTENDED` / `TE-ENTITLEMENT-REACTIVATED` (1..N).
4. `TE-CONTACT-TAG-ADDED` (quando `auto_tag` de benefício).
5. `TE-CONTACT-CLASSIFICATION-CHANGED` (opcional).
6. `TE-OPPORTUNITY-WON` (opcional).
7. `TE-SUBSCRIPTION-STARTED` (opcional).

Para `order.refused`: `TE-SALE-REFUSED`.
Para `order.chargeback`: `TE-SALE-CHARGEBACK`.

## Observabilidade

- Métricas:
  - `sale_ingest_total{provider, event_kind, outcome}`;
  - `sale_ingest_latency_ms{provider}` (webhook → commit);
  - `sale_conflict_total{offer_id}`;
  - `sale_duplicate_offer_total`;
  - `entitlement_consolidate_total{action}`.
- Logs (`correlation_id`, `external_event_id`, `contact_id`, `transaction_id`, `offer_id`, `condition_id`, `snapshot_id`, `flow='FLOW-05'`).
- Alertas:
  - Sentry: qualquer rollback após passo 10 (snapshot criado mas não persistido — gravíssimo).
  - Sentry: `unmapped_product` > 0.
  - Axiom: dashboard de "vendas ingeridas por marca/oferta/hora" com série temporal.
  - PagerDuty: `dead_letter` em venda (impacto financeiro direto).

## Casos de teste E2E obrigatórios

1. **approved-happy-path**
   - Given: contato C existe; oferta O com 1 condição default; webhook `order.approved` com `external_id='evt_1'`.
   - When: processado.
   - Then: `transaction.approved`, `snapshot` criado, `transaction_item`(s) materializados, contador +1, direito ativo, `C.classification='customer'` (ou `student`), funil marcado won se aplicável; 5+ eventos emitidos.

2. **idempotencia-webhook-duplicado**
   - Given: `evt_1` já processado.
   - When: reentrega.
   - Then: `webhook_log` detecta; 200; nenhuma transação nova; contador inalterado.

3. **approved-renewal-estende-direito**
   - Given: C possui E1 ativa de P1 via T1 em O1 (ends 2026-10-01); O2 renewal de O1; `now=2026-09-01`.
   - When: approved de O2.
   - Then: T2 aprovada; `consolidate` retorna `extend_expiration`; `E1.ends_at=2027-09-01`; `TE-ENTITLEMENT-EXTENDED`.

4. **conflict-abre-issue-e-mantem-pending**
   - Given: 2 condições empatadas em tripla; approved chega.
   - When: FLOW-04 retorna `conflict`.
   - Then: `transaction.status='pending'`, `contact_issue kind='offer_conflict'` aberta; nenhum snapshot criado; nenhum counter incrementado.

5. **duplicate-offer-sem-refund-cancela**
   - Given: C tem `approved` em O; nova approved para (C,O) sem renewal nem refund.
   - When: processada.
   - Then: nova transação `cancelled`; evento informativo; alertar operação.

6. **snapshot-imutavel-apos-criacao**
   - Given: transação aprovada há 1 dia; operador muda nome da oferta.
   - When: lê snapshot.
   - Then: `payload.offer.name` é o nome do momento da venda, não o atual.

7. **order-refused-nao-emite-grant**
   - Given: approved falha antifraude provedor; chega `order.refused`.
   - When: processado.
   - Then: `status='refused'`, `refused_at`; nenhum snapshot, nenhum grant, nenhuma classificação.

8. **subscription-criada-quando-billing_kind=subscription**
   - Given: oferta configurada como assinatura mensal.
   - When: approved.
   - Then: `subscription` ativa com `current_period_end=approved_at+30d`; `installment` inicial; `TE-SUBSCRIPTION-STARTED`.

9. **rollback-em-falha-no-passo-13**
   - Given: consolidação de direito falha por bug transitório.
   - When: approved sendo processado.
   - Then: ROLLBACK total; `webhook_log.attempts++`; retry Inngest.

10. **chargeback-marca-snapshot-disputed**
    - Given: transação aprovada T1.
    - When: provedor envia `chargeback`.
    - Then: `T1.status='chargeback'`, linha em `flag_history(to_flag='disputed')`, `TE-SALE-CHARGEBACK` emitido.

## Open Questions

- `OQ-FLOW-05-01` — `chargeback` dispara fluxo de refund automático (como system refund)? Cruz com `OQ-BR-REFUND-05`. Proposta: sim.
- `OQ-FLOW-05-02` — quando approved chega sem um `order.pending` prévio, emitir `TE-SALE-PENDING` antes de `TE-SALE-APPROVED` pela coerência da timeline?
- `OQ-FLOW-05-03` — `duplicate offer` sem refund deveria abrir `contact_issue` em vez de apenas cancelar, para revisão humana? Proposta: sim.
