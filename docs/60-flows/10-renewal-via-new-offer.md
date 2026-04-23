# FLOW-10: Renovação via oferta dedicada

## Gatilho / pré-condições

Contato possui `customer_entitlement` ativo (ou recém-expirado dentro da janela de graça) proveniente de uma oferta `O1`. Uma oferta `O2` com `offer.type='renewal'` e `offer.renews_offer_id=O1.id` é comprada. Este fluxo é **subchamado** por [`FLOW-05`](./05-external-sale-ingest.md) passos 6–15; aqui detalhamos a parte específica de renovação.

Pré-condições:
- `O2.type='renewal'` e `O2.renews_offer_id IS NOT NULL` (CHECK `ck_offer_renewal_requires_ref`);
- contato tem `transaction approved` em `O1` com entitlement derivado;
- compra normal de `O2` dispara FLOW-05; este fluxo é a exceção à unicidade.

## Atores

- humano: (indireto) contato que clica em renovar; operador comercial em venda interna.
- sistema: `MOD-OFFER` (`assertRenewalEligibility`), `MOD-TRANSACTION`, `MOD-ENTITLEMENT` (consolidação), `MOD-TIMELINE`.
- integração: Digital Guru (fluxo externo de pagamento).

## Passos

1. **Checkout inicia compra de O2** — webhook `order.pending` chega via FLOW-05 passos 1–5.
2. **Guard BR-OFFER-UNIQUENESS** (FLOW-05 passo 6) — caller chama `assertUniqueOfferPurchase(contactId, O2.id)`:
   - como `O2.id` é **distinto** de `O1.id`, o índice parcial único `uq_transaction_unique_offer_per_contact (contact_id, offer_id)` **não bloqueia**.
   - `BR-OFFER-UNIQUENESS` tabela decisão linha 4: `offer.type='renewal'` ⇒ guard delega a `BR-RENEWAL`.
3. **Guard BR-RENEWAL** — `assertRenewalEligibility(contactId, O2.id)`:
   1. Carrega `O2`; exige `type='renewal'` e `renews_offer_id != null`. Caso não: `OfferNotRenewal` (erro `E-01`).
   2. `origin_offer_id = O2.renews_offer_id` (isto é, `O1.id`).
   3. Busca `transaction approved` do contato com `offer_id = O1.id` e entitlements derivados.
   4. Verifica se há `customer_entitlement` com `status='active'` OU `status='expired' AND ends_at > now() - grace` (grace = 30 dias default, `OQ-BR-RENEW-01`).
   5. Se nenhum satisfaz ⇒ `RenewalWithoutActiveEntitlement` (erro `E-02`); FLOW-05 cancela a transação.
   6. Se `entitlement.status='revoked'` (por refund) ⇒ rejeita (`BR-RENEWAL` tabela §linha 5).
4. **Selecionar condição** — FLOW-05 passo 7 (normal, via [`FLOW-04`](./04-offer-condition-decision.md)).
5. **Aprovar transação T2** — FLOW-05 passos 8–12: incrementa counter de `O2`, snapshot, items, status=`approved`.
6. **Consolidar direito** — FLOW-05 passo 13 → [`FLOW-06`](./06-entitlement-update.md) com:
   - `existing` = entitlement ativo/em graça de `O1` (mesmo `ref_kind`/`ref_id` quando a renovação referencia o mesmo produto/benefício — requisito para consolidar, `BR-RENEWAL §observação crítica`).
   - `incoming` = entitlement derivado de `T2`.
   - Ação típica:
     - `extend_expiration` — ambos finitos; estende `ends_at` segundo política de sobreposição;
     - `promote_perpetuous` — renovação vitalícia promove direito finito;
     - `reactivate` — se existing está `expired` dentro da graça.
   - Se a oferta de renovação referencia produto **distinto** ⇒ `consolidate` não encontra `existing` e cria novo entitlement (comportamento correto — cadeia de renovação pode incluir upgrade).
7. **Efeitos colaterais FLOW-05**:
   - reclassificar contato (provavelmente permanece `student`/`customer` sem alteração);
   - fechar oportunidade em funil de `O2` se existir;
   - criar subscription derivada se `O2.billing_kind='subscription'`.
8. **Emitir eventos**: `TE-SALE-APPROVED`, `TE-ENTITLEMENT-EXTENDED` (ou `GRANTED` conforme `consolidate`), `TE-OPPORTUNITY-WON` (se funil), `TE-SUBSCRIPTION-STARTED` (se subscription).

## Pós-condições

- `T2.status='approved'` em `O2`.
- `T1.status='approved'` **permanece** em `O1` (renovação não reembolsa a original).
- Entitlement consolidado com `ends_at` estendido ou promovido; `last_update_transaction_id=T2.id`.
- `entitlement_history` registra `from`/`to` com `caused_by_transaction_id=T2.id`.
- Índice parcial único não é violado (offer_ids distintos).

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `O2.type != 'renewal'` | `OfferNotRenewal`; fluxo incorreto invocado | revisar oferta (provavelmente venda regular) |
| E-02 | contato sem direito ativo da original | `RenewalWithoutActiveEntitlement`; transação cancelada | contato deve comprar `O1` (não renovar) |
| E-03 | direito revogado por refund | `RenewalWithoutActiveEntitlement`; rejeita | contato recompra via `O1` (refund liberou — `BR-OFFER-UNIQUENESS`) |
| E-04 | `O2` referencia produto distinto do original | não consolida; cria direito paralelo (esperado) | — |
| E-05 | renovação de renovação (cadeia, `OQ-BR-RENEW-02`) | `assertRenewalEligibility` recursivo — Fase 1 não suporta | aguardar decisão |

## Regras referenciadas

- [`BR-RENEWAL`](../50-business-rules/BR-RENEWAL.md)
- [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md)
- [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md)
- [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md)
- [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)

## Eventos emitidos

Herdados de FLOW-05, com ênfase:

1. `TE-SALE-PENDING` e `TE-SALE-APPROVED` para `T2`.
2. `TE-ENTITLEMENT-EXTENDED` (caso mais comum) ou `TE-ENTITLEMENT-GRANTED`.
3. `TE-OPPORTUNITY-WON` (opcional, funil da renovação).
4. `TE-SUBSCRIPTION-STARTED` / `TE-SUBSCRIPTION-RENEWED` (opcional).

## Observabilidade

- Métricas:
  - `renewal_purchase_total{origin_offer_id}`;
  - `renewal_rejected_total{reason}` (breakdown: `no_active_entitlement`, `revoked`, `grace_expired`);
  - `entitlement_promote_perpetuous_total`;
  - `entitlement_extend_from_renewal_total`.
- Logs (`correlation_id`, `transaction_id=T2`, `origin_transaction_id=T1`, `entitlement_id`, `consolidate_action`, `flow='FLOW-10'`).
- Alertas:
  - Axiom: dashboard de churn/retenção usando `renewal_purchase_total / active_entitlements_expiring`.
  - Sentry: `renewal_rejected_total.revoked` > threshold (indica marketing convidando contatos errados).

## Casos de teste E2E obrigatórios

1. **renovacao-feliz-extende**
   - Given: C tem E1 ativa (`ends=2026-10-01`) de P1 via T1 em O1; O2 renewal, item com vigency 12m; `now=2026-09-01`.
   - When: approved O2.
   - Then: T2 approved; `consolidate` `extend_expiration`; `E1.ends_at=2027-09-01`; `TE-ENTITLEMENT-EXTENDED`.

2. **renovacao-vitalicia-promove**
   - Given: E1 `ends_at=2026-12-01`; O2 renewal item vitalício.
   - When: approved O2.
   - Then: `E1.ends_at=NULL`; `action='promote_perpetuous'`.

3. **sem-direito-ativo-bloqueia**
   - Given: C sem transação em O1.
   - When: tenta comprar O2.
   - Then: `RenewalWithoutActiveEntitlement`; T2 cancelled.

4. **direito-revogado-bloqueia**
   - Given: T1 refundada; E1 `revoked`.
   - When: O2.
   - Then: rejeita. Recompra deve ser de O1.

5. **dentro-da-graca-permite-reativar**
   - Given: E1 `expired` em `now-15d`; graça 30d.
   - When: O2 approved.
   - Then: `consolidate` retorna `reactivate`; `E1.status='active'` com novos parâmetros.

6. **renovacao-nao-dispara-unique-offer**
   - Given: C tem T1 approved em O1.
   - When: approved T2 em O2 (renewal).
   - Then: índice parcial não viola; INSERT OK.

7. **renovacao-com-produto-distinto-cria-paralelo**
   - Given: O1 vende P1; O2 renewal mas item aponta P2.
   - When: approved O2.
   - Then: novo entitlement de P2 criado; E1 de P1 inalterado.

## Open Questions

- `OQ-FLOW-10-01` — cadeia de renovações (`OQ-BR-RENEW-02`): se `O3.renews_offer_id=O2` (que já é renewal de O1), assertRenewalEligibility deve ser recursivo?
- `OQ-FLOW-10-02` — preço mínimo da renovação (`OQ-BR-RENEW-04`): validar X% da original antes do approved?
- `OQ-FLOW-10-03` — grace period configurável por marca ou oferta (`OQ-BR-RENEW-01`)? Fase 1 global 30d.
