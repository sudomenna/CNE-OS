# FLOW-06: Atualização/consolidação de direito em nova compra

## Gatilho / pré-condições

Nova venda aprovada concede a um contato um direito (`customer_entitlement`) com o mesmo `(contact_id, brand_id, ref_kind, ref_id)` de um direito pré-existente. Este fluxo é **subchamado** por [`FLOW-05`](./05-external-sale-ingest.md) passo 13 (grant) e por [`FLOW-10`](./10-renewal-via-new-offer.md).

Pré-condição: a transação está em transação SQL aberta; passos anteriores (`approveTransaction`) já validaram unicidade e criaram snapshot.

## Atores

- humano: nenhum.
- sistema: `MOD-ENTITLEMENT` (`grantFromTransaction`, `consolidate`); `MOD-CONTACT` (tag `auto_tag` quando benefício); `MOD-TIMELINE`.
- integração: não participa.

## Passos

1. **Recolher itens concedidos** do snapshot/transaction_item: `item_kind ∈ {main, bonus, upsell, order_bump, complement, commercial_benefit}` com `product_id` ou `commercial_benefit_id`.
2. **Para cada item**, construir `Entitlement incoming`:
   - `contactId`, `brandId`, `refKind` (`product`|`benefit`), `refId`;
   - `quantity = item.quantity`;
   - `startedAt = transaction.approved_at`;
   - `endsAt` derivado do `access_rule.vigency_months` (null ⇒ perpétuo);
   - `status='active'`, `accessRule = item.resolved_rules`.
3. **Buscar existing** — `SELECT customer_entitlement WHERE (contact_id, brand_id, ref_kind, ref_id) AND status IN ('active','suspended','revoked','expired')` com `FOR UPDATE`. No máximo 1 linha pelo índice parcial único (status='active').
4. **Chamar `consolidate(existing, incoming)`** — [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md). Função pura, determinística. Retorna `{ action, next, reason }`.
5. **Aplicar resultado**:
   - `create` ⇒ INSERT novo `customer_entitlement` com `origin_transaction_id = transaction.id`.
   - `reactivate` ⇒ UPDATE existing para novos parâmetros (`status='active'`, novos `started_at`/`ends_at`/`quantity`/`access_rule`); `last_update_transaction_id = transaction.id`.
   - `extend_expiration` ⇒ UPDATE `ends_at = next.ends_at`, `quantity`, `access_rule`, `last_update_transaction_id`.
   - `promote_perpetuous` ⇒ UPDATE `ends_at=NULL` + demais campos do `next`.
   - `merge_quantity` ⇒ UPDATE `quantity = next.quantity` (soma).
   - `noop` ⇒ nenhuma alteração de estado; ainda assim grava linha informativa em `entitlement_history`.
6. **INSERT `entitlement_history`** com snapshot `from` (estado antes) e `to` (estado depois), `reason` do `consolidate`, `caused_by_transaction_id=transaction.id`. Sempre append-only.
7. **INSERT `entitlement_status_history`** quando `status` mudou (ex.: `revoked→active` no `reactivate`).
8. **Aplicar `auto_tag` de benefício** (quando `item.commercial_benefit.auto_tag`): chamar `MOD-CONTACT.applyTag(contactId, tag, 'benefit')`; emite `TE-CONTACT-TAG-ADDED`.
9. **Emitir evento de timeline** conforme a ação:
   - `create` ⇒ `TE-ENTITLEMENT-GRANTED`.
   - `extend_expiration` ou `merge_quantity` ou `promote_perpetuous` ⇒ `TE-ENTITLEMENT-EXTENDED` (payload inclui `from`/`to`).
   - `reactivate` ⇒ `TE-ENTITLEMENT-GRANTED` com `reason='reactivate_after_revoke'` (alternativa: evento dedicado — `OQ-FLOW-06-01`).
   - `noop` ⇒ nenhum evento (history informativo basta).
10. Repetir passos 2–9 para cada item; todos dentro da mesma transação SQL do caller.

## Pós-condições

- Para cada `(contact, brand, ref_kind, ref_id)` existe no máximo 1 linha com `status='active'` em `customer_entitlement`.
- `entitlement_history` e `entitlement_status_history` refletem a mutação.
- Timeline contém eventos correspondentes.
- Tags `auto_tag` aplicadas ao contato.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `consolidate` recebe `existing.suspended` | resultado trata como ativo mas preserva `status='suspended'` (`OQ-BR-ENT-CON-02`) | operador que suspendeu decide reativação |
| E-02 | produto/benefício referenciado foi arquivado (FK dangling) | falhar transação; rollback global | corrigir catálogo |
| E-03 | violação do índice parcial único (concorrência) | retry SERIALIZATION_FAILURE | — |
| E-04 | `incoming.ends_at < existing.started_at` (dados inconsistentes) | `consolidate` rejeita com `InvalidTemporalError`; rollback | investigar dados do snapshot |

## Regras referenciadas

- [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md)
- [`BR-RENEWAL`](../50-business-rules/BR-RENEWAL.md) (caller específico)
- [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md) (fonte dos itens)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)

## Eventos emitidos

- `TE-ENTITLEMENT-GRANTED` (create / reactivate).
- `TE-ENTITLEMENT-EXTENDED` (extend_expiration / promote_perpetuous / merge_quantity).
- `TE-CONTACT-TAG-ADDED` (quando `auto_tag`).

## Observabilidade

- Métricas:
  - `entitlement_consolidate_total{action}`;
  - `entitlement_active_total{ref_kind}` (gauge periódico);
  - `auto_tag_applied_total{tag}`.
- Logs (`correlation_id`, `transaction_id`, `entitlement_id`, `action`, `reason`, `flow='FLOW-06'`).
- Alertas:
  - Sentry: ação `noop` em `both_perpetuous` acima de N/hora (possível bug de webhook duplicado não detectado).
  - Axiom: distribuição de `action` — detectar regressão quando `extend_expiration` sobe sem motivo.

## Casos de teste E2E obrigatórios

1. **extend-12m-mais-12m**
   - Given: E1 `ends_at=2026-06-01`, `started=2026-01-01`; incoming `started=2026-05-01, ends=2027-05-01` (sobrepõe).
   - When: consolidate.
   - Then: `action='extend_expiration'`, `E1.ends_at=2027-05-01`; `TE-ENTITLEMENT-EXTENDED`.

2. **12m-depois-vitalicio**
   - Given: E1 finito `ends_at=2026-12-31`; incoming perpétuo.
   - When: consolidate.
   - Then: `action='promote_perpetuous'`, `E1.ends_at=NULL`.

3. **vitalicio-depois-12m-noop**
   - Given: E1 perpétuo; incoming finito.
   - When: consolidate.
   - Then: `action='noop'`; `E1` inalterado; history informativo gravado.

4. **revogado-por-refund-reativa-com-nova-compra**
   - Given: E1 `status='revoked'` por refund prévio.
   - When: nova compra incoming.
   - Then: `action='reactivate'`, `E1.status='active'`, novos parâmetros; `entitlement_status_history(revoked→active)`.

5. **sem-existing-cria**
   - Given: contato sem direito em (brand, product).
   - When: primeira compra.
   - Then: `action='create'`, nova linha, `TE-ENTITLEMENT-GRANTED`.

6. **auto-tag-aplicada-uma-vez**
   - Given: item `commercial_benefit.auto_tag='vip'`; contato sem a tag.
   - When: grant.
   - Then: tag `vip` aplicada; `TE-CONTACT-TAG-ADDED`; reentrega do webhook não duplica.

7. **dois-itens-no-mesmo-snapshot**
   - Given: snapshot com item `main` (produto P1) + item `bonus` (produto P2).
   - When: grant.
   - Then: 2 linhas distintas em `customer_entitlement` (ref_id distintos); 2 eventos.

## Open Questions

- `OQ-FLOW-06-01` — `reactivate` emite `TE-ENTITLEMENT-GRANTED` ou evento dedicado `TE-ENTITLEMENT-REACTIVATED`? Hoje catálogo não tem o segundo. Proposta: manter `GRANTED` com `reason='reactivate_after_revoke'`.
- `OQ-FLOW-06-02` — tempo já consumido pré-revogação deve ser descontado na reativação (`OQ-BR-ENT-CON-03`)? Fase 1: não.
