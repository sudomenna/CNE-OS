# BR-OFFER-UNIQUENESS: compra única por oferta

## Enunciado

Um `contact` **não pode** ter duas `transaction` com `status='approved'` referenciando a mesma `offer_id`. Exceções:

1. **Renovação** — oferta com `type='renewal'` pode ser comprada por um contato que já possui compra da oferta original (`renews_offer_id`). Ver [`BR-RENEWAL`](./BR-RENEWAL.md).
2. **Após refund** — se a transação aprovada anterior está com snapshot flagado `refunded` (via `transaction_snapshot_flag_history`), o contato **pode** recomprar a mesma oferta.

## Motivação

Regra transversal do PRD §10.3 ("o contato não pode comprar a mesma oferta novamente"). Evita cobranças duplicadas acidentais e garante integridade do pipeline de direitos adquiridos. As exceções foram formalizadas em [`ADR-02`](../90-meta/04-decision-log.md#adr-02) (refund libera recompra).

## Escopo

- Módulo: [`MOD-TRANSACTION`](../20-domain/11-transaction-snapshot.md).
- Entidades: `transaction`, `transaction_snapshot_flag_history`.

## Enforcement

- [x] DB constraint (índice parcial único)
- [x] Guard em Server Action (para dar erro amigável antes de tentar INSERT e para tratar exceções)
- [ ] DB trigger
- [ ] Função de domínio pura (lógica está nos guards)
- [ ] Guard em UI (UI pode mostrar "você já comprou" como hint)

## DDL canônica

```sql
CREATE UNIQUE INDEX uq_transaction_unique_offer_per_contact
  ON transaction (contact_id, offer_id)
  WHERE status = 'approved';
```

Esse índice **não** diferencia refund do passado. A exceção (após refund) é tratada em dois passos:

1. **Antes de INSERT**, Server Action verifica: existe transação aprovada para (contact, offer)? Se sim, consultar `transaction_snapshot_flag_history` por `snapshot_id` dessa transação com `to_flag='refunded'`. Se existir, transicionar a transação antiga para `status='refunded'` (já feito ao executar o refund efetivamente; ver [`BR-REFUND`](./BR-REFUND.md) passo 4) de modo que o índice parcial **já não cobre** aquela linha, liberando nova aprovação.
2. **Renovação**: antes do INSERT, Server Action verifica se `offer.type='renewal'` e `offer.renews_offer_id` bate com alguma transação aprovada do contato; permite a nova compra, que será uma linha `approved` separada, com `offer_id` da renovação (diferente do `offer_id` da original). O índice parcial único **não dispara** porque `offer_id` é distinto.

> **Importante:** a renovação não viola o índice porque `offer_id` é outro. A exceção "após refund" é viabilizada porque a transação anterior deixa de estar `approved` (vira `refunded`), saindo do índice parcial.

## Tabela de decisão (guard em Server Action)

| Contato já tem `approved` para `offer_id`? | `offer.type` | Snapshot anterior flagado `refunded`? | Ação |
|---|---|---|---|
| não | `regular` | — | INSERT permitido |
| não | `renewal` | — | guard valida `BR-RENEWAL` (existe direito da oferta original); INSERT permitido |
| sim | `regular` | não | rejeitar com `DuplicateOfferPurchase` |
| sim | `regular` | sim, e transação anterior já está `status='refunded'` | INSERT permitido (índice parcial não cobre) |
| sim | `renewal` | — | **guard permite**: renovação é exceção natural (offer_id da renewal é outro; ver BR-RENEWAL) |

## Contrato TS

```ts
export async function assertUniqueOfferPurchase(
  contactId: string,
  offerId: string,
  tx: DrizzleTx,
): Promise<void>; // throws DuplicateOfferPurchase quando violação detectada
```

Chamado em `createPendingTransaction` (melhor UX) **e** implicitamente assegurado pelo índice parcial no `approveTransaction` (defesa em profundidade).

## Casos de teste (Given/When/Then)

### CT-UNIQ-01 — Segunda compra é bloqueada
- **Given** contato tem transação `approved` para oferta O1.
- **When** novo `approveTransaction` para o mesmo contato e O1.
- **Then** erro `DuplicateOfferPurchase` (violação do índice).

### CT-UNIQ-02 — Oferta de renovação permite
- **Given** contato tem transação `approved` para oferta O1; existe oferta O2 com `type='renewal'` e `renews_offer_id=O1`; contato tem direito ativo de O1.
- **When** `approveTransaction` para O2.
- **Then** INSERT permitido; transação aprovada; ver BR-RENEWAL para consolidação de direito.

### CT-UNIQ-03 — Recompra após refund permite
- **Given** contato tem transação T1 aprovada para O1; refund aprovado em T1; T1 agora está `status='refunded'`; snapshot flagado `refunded`.
- **When** novo `approveTransaction` para (contato, O1).
- **Then** INSERT permitido (índice parcial não cobre T1).

### CT-UNIQ-04 — Sem refund, segunda compra falha mesmo com cancelamento
- **Given** contato tem transação `approved` para O1; admin mudou status para `cancelled` por erro operacional sem refund.
- **When** novo `approveTransaction` para (contato, O1).
- **Then** ambos estados `cancelled` e `refunded` **saem** do índice — INSERT permitido. **Comportamento secundário esperado**: cancelamento administrativo sem refund é desencorajado e deve ser reservado a estornos de erro de digitação. Regra de auditoria em `BR-AUDIT` detecta.

### CT-UNIQ-05 — Renovação sem direito ativo da original falha
- **Given** contato sem direito ativo de O1; oferta O2 `type=renewal, renews_offer_id=O1`.
- **When** `approveTransaction` para O2.
- **Then** guard de BR-RENEWAL recusa com `RenewalWithoutActiveEntitlement` (não é violação do índice, mas de BR-RENEWAL).

## Rastreabilidade

- Teste esperado: `tests/integration/transaction/uniqueness.test.ts`.
- Referenciada em: [`MOD-TRANSACTION §5`](../20-domain/11-transaction-snapshot.md#5-invariantes) (INV-TRX-03), [`BR-RENEWAL`](./BR-RENEWAL.md), [`BR-REFUND`](./BR-REFUND.md).
- PRD origem: §9.9.2, §10.3.

## Open Questions

- `OQ-BR-UNIQ-01` — cancelamento administrativo sem refund deve ser bloqueado? Hoje CT-UNIQ-04 expõe comportamento indesejado; proposta: exigir refund sempre que houver necessidade de "liberar recompra".
- `OQ-BR-UNIQ-02` — chargeback (`status='chargeback'`) libera recompra? Hoje sai do índice parcial — provável desejado, mas documentar em BR-REFUND.
- `OQ-BR-UNIQ-03` — oferta em `status='archived'` ainda bloqueia recompra se há transação aprovada? Sim (índice cobre).
