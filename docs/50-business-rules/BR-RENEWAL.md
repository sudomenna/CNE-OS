# BR-RENEWAL: renovação como oferta dedicada

## Enunciado

Uma renovação é representada como uma **oferta distinta** com `offer.type='renewal'` e `offer.renews_offer_id` apontando para a oferta original. Ao vender uma oferta de renovação:

1. O sistema **exige** que o contato tenha um `customer_entitlement` ativo proveniente da oferta original (direito ainda vigente, ou recém-expirado dentro de janela de graça configurável).
2. A venda **é permitida** mesmo que o contato já tenha comprado a oferta original (exceção natural à regra de unicidade, porque `offer_id` é diferente — ver [`BR-OFFER-UNIQUENESS`](./BR-OFFER-UNIQUENESS.md)).
3. O grant resultante **estende** o direito existente (via [`BR-ENTITLEMENT-CONSOLIDATION`](./BR-ENTITLEMENT-CONSOLIDATION.md)), não cria paralelo.

## Motivação

Preservar simultaneamente (a) compra única por oferta, (b) continuidade do direito, (c) rastreabilidade de qual venda originou qual renovação. Decisão registrada em [`snazzy-creek-review.md §3.4`](../90-meta/archive/snazzy-creek-review.md#34-renovação--compra-única).

## Escopo

- Módulos: [`MOD-OFFER`](../20-domain/10-offer-engine.md), [`MOD-TRANSACTION`](../20-domain/11-transaction-snapshot.md), [`MOD-ENTITLEMENT`](../20-domain/12-entitlement.md).
- Entidades: `offer` (campos `type`, `renews_offer_id`), `customer_entitlement`, `transaction`.

## Enforcement

- [x] DB constraint (`ck_offer_renewal_requires_ref`)
- [x] Função de domínio pura (`assertRenewalEligibility`)
- [x] Guard em Server Action (`createPendingTransaction`/`approveTransaction` checam antes)
- [ ] DB trigger
- [ ] Guard em UI

## DDL relevante

```sql
ALTER TABLE offer
  ADD CONSTRAINT ck_offer_renewal_requires_ref CHECK (
    (type = 'regular' AND renews_offer_id IS NULL)
    OR (type = 'renewal' AND renews_offer_id IS NOT NULL)
  );
```

## Contrato TS

```ts
export async function assertRenewalEligibility(
  contactId: string,
  offerId: string,   // oferta de renovação
  tx: DrizzleTx,
): Promise<void>;
// throws RenewalWithoutActiveEntitlement quando contato não tem direito ativo da oferta original;
//         ou OfferNotRenewal quando offer.type !== 'renewal'.
```

Algoritmo:
```
1. offer = SELECT offer WHERE id=offerId. Exigir type='renewal' e renews_offer_id != null.
2. origin = offer.renews_offer_id.
3. Verificar existência de customer_entitlement com status='active'
   e cuja origin_transaction_id aponta para uma transaction aprovada do contato com offer_id=origin.
   (Ou, mais diretamente: existe transaction approved (contact, origin) com entitlements ativos derivados.)
4. Aceitar também "acabou de expirar" se `ends_at > now() - INTERVAL '<grace>'` (grace configurável por marca; default 30 dias).
5. Se nenhum direito ativo/em graça → throw RenewalWithoutActiveEntitlement.
```

## Tabela de decisão (na venda)

| Contato tem transação `approved` para `renews_offer_id`? | Direito ativo dela? | Ação |
|---|---|---|
| não | — | rejeitar `RenewalWithoutActiveEntitlement` |
| sim | sim | permitir venda |
| sim | expirado dentro da graça | permitir venda |
| sim | expirado fora da graça | rejeitar (mesmo raciocínio: renovação requer continuidade) |
| sim | revogado por refund | rejeitar (sem direito = não há o que renovar) |

## Consolidação do direito (integração com BR-ENTITLEMENT-CONSOLIDATION)

Quando a venda de renewal é aprovada, MOD-ENTITLEMENT chama `consolidate(existing, incoming)`:
- `existing` = direito ativo da oferta original (mesmo `ref_id` — produto/benefício compartilhado entre original e renovação via itens das condições).
- `incoming` = direito gerado pela renovação.
- Resultado típico: `extend_expiration` (estende `ends_at`) ou `promote_perpetuous` (se a renovação for vitalícia).

**Observação crítica:** para consolidação funcionar, a oferta de renovação deve ter itens apontando para os **mesmos** `product_id`/`commercial_benefit_id` da original. Se a renovação referenciar produto distinto, cria direito novo (não consolida) — comportamento correto.

## Casos de teste (Given/When/Then)

### CT-RENEWAL-01 — Renovação feliz estende direito
- **Given** contato C com direito ativo E1 de produto P1 via T1 na oferta O1 (ends_at=2026-10-01); oferta O2 tipo=renewal, renews_offer_id=O1, item aponta P1 com vigency_months=12; `ctx.now=2026-09-01`.
- **When** `approveTransaction` para (C, O2).
- **Then** `assertRenewalEligibility` passa; transação T2 aprovada; `consolidate` retorna `extend_expiration` com `next.ends_at=2027-09-01` (estende +12 a partir de now porque sobrepõe); `last_update_transaction_id=T2`; `TE-ENTITLEMENT-EXTENDED` emitido; T1 permanece `approved`.

### CT-RENEWAL-02 — Sem direito ativo bloqueia
- **Given** contato D sem transação para O1.
- **When** tenta comprar O2 (renewal de O1).
- **Then** `RenewalWithoutActiveEntitlement`; transação não é criada.

### CT-RENEWAL-03 — Direito revogado por refund bloqueia renovação
- **Given** contato E tinha T1 aprovada em O1, mas foi refundada; E1 agora `status='revoked'`.
- **When** tenta comprar O2.
- **Then** rejeição; renovação não é caminho de recompra (BR-OFFER-UNIQUENESS já libera recompra da O1 via refund).

### CT-RENEWAL-04 — Renovação não dispara BR-OFFER-UNIQUENESS
- **Given** contato com T1 aprovada em O1.
- **When** aprova T2 em O2 (renewal).
- **Then** índice parcial único não viola porque `offer_id` (O2) é diferente de (O1); INSERT ok.

### CT-RENEWAL-05 — Renovação vitalícia promove direito
- **Given** existing E1 `ends_at=2026-12-01`; O2 tipo=renewal com item `vigency_months=null` (vitalício).
- **When** aprovação.
- **Then** `consolidate` retorna `promote_perpetuous`; `E1.ends_at=null`.

### CT-RENEWAL-06 — Dentro da graça permite renovar
- **Given** E1 expirou em `now-15d`; graça=30d.
- **When** aprova T2 renewal.
- **Then** permitido; `consolidate` trata existing como existente (status='expired') → reativa com novos parâmetros.

## Rastreabilidade

- Teste esperado: `tests/integration/offer/renewal.test.ts` + `tests/unit/entitlement/consolidate.test.ts` (cenários overlap).
- Referenciada em: [`MOD-OFFER §3.1`](../20-domain/10-offer-engine.md#31-offer) (campos `type`/`renews_offer_id`), [`BR-OFFER-UNIQUENESS`](./BR-OFFER-UNIQUENESS.md), [`BR-ENTITLEMENT-CONSOLIDATION`](./BR-ENTITLEMENT-CONSOLIDATION.md).
- Origem: revisão `snazzy-creek-review.md §3.4`.

## Open Questions

- `OQ-BR-RENEW-01` — janela de graça é fixa por sistema ou configurável por marca/oferta? Proposta Fase 1: constante global 30 dias.
- `OQ-BR-RENEW-02` — renovação pode referenciar outra renovação (cadeia)? Proposta: sim (`renews_offer_id` pode apontar para offer `type='renewal'`); assertRenewalEligibility recursivo.
- `OQ-BR-RENEW-03` — a oferta de renovação precisa ter o mesmo conjunto de itens que a original? Fase 1: sem obrigação (flexível para "upgrade"); negócio define.
- `OQ-BR-RENEW-04` — preço da renovação pode ser qualquer coisa ou sofrer guard de "não menor que X% da original"? Negócio.
