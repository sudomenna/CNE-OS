# Transação e snapshot (Módulo MOD-TRANSACTION)

## 1. Finalidade

Registrar **o que de fato foi comprado** e preservar o contrato comercial aplicado no momento da venda em um **snapshot imutável** (`jsonb`). Mudanças futuras em oferta, condição, produto ou benefício **não** alteram snapshots passados. A transação é a ponte entre o motor de ofertas ([`MOD-OFFER`](./10-offer-engine.md)), o motor de direitos ([`MOD-ENTITLEMENT`](./12-entitlement.md)) e a cobrança ([`MOD-BILLING`](./13-subscription-billing.md)), além de ser a origem de reembolsos ([`MOD-REFUND`](./14-refund.md)).

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/transaction.ts` (tabelas desta spec)
  - `lib/db/schema/_relations/transaction.ts`
  - `lib/domain/transaction/` (criação de transação, composição de snapshot, emissão de eventos)
  - `lib/domain/transaction/snapshot.ts` (`composeSnapshot`)
  - `lib/domain/transaction/approve.ts` (`approveTransaction` orquestra counter + grants)
  - `app/(app)/transactions/`
  - `tests/unit/transaction/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`transaction_status`, `transaction_snapshot_flag`, `integration_provider`)
  - `docs/20-domain/10-offer-engine.md` (interfaces `selectCondition`, `incrementSalesCounter`, `getIssuingLegalEntity`)
  - `docs/20-domain/09-catalog.md` (dados de produto/benefício para snapshot)
  - `docs/20-domain/12-entitlement.md` (interface de grant)
  - `docs/50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md`
  - `docs/50-business-rules/BR-OFFER-UNIQUENESS.md`
  - `docs/50-business-rules/BR-CONTACT-CLASSIFICATION.md`
- Interfaces públicas expostas:
  - `createPendingTransaction(input): Transaction` — dispara no checkout/webhook pending
  - `approveTransaction(transactionId, externalRef?): Transaction` — atomic: snapshot + counter + grants + TE
  - `refuseTransaction(transactionId, reason): Transaction`
  - `flagSnapshotRefunded(transactionId, refundId)` — chamado por MOD-REFUND; NÃO atualiza `transaction_snapshot.payload`

## 3. Entidades e campos

### 3.1 `transaction`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `brand_id` | uuid | não | — | FK `brand(id) ON DELETE RESTRICT` |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE RESTRICT` |
| `offer_id` | uuid | não | — | FK `offer(id) ON DELETE RESTRICT` |
| `offer_condition_id` | uuid | não | — | FK `offer_condition(id) ON DELETE RESTRICT` |
| `offer_payment_option_id` | uuid | não | — | FK `offer_payment_option(id) ON DELETE RESTRICT` |
| `status` | `transaction_status` | não | `pending` | — |
| `amount` | numeric(12,2) | não | — | `CHECK amount >= 0` |
| `currency` | char(3) | não | `BRL` | — |
| `external_provider` | `integration_provider` | sim | — | p.ex. `digital_guru` |
| `external_id` | text | sim | — | id do provedor |
| `external_fee` | numeric(12,2) | sim | — | taxa cobrada pelo provedor |
| `snapshot_id` | uuid | sim | — | FK `transaction_snapshot(id)`; NULL em `pending`; NOT NULL após `approved` |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |
| `approved_at` | timestamptz | sim | — | `CHECK` coerente com status |
| `refused_at` | timestamptz | sim | — | idem |

**Índices críticos:**
- `uq_transaction_external_provider_external_id (external_provider, external_id) WHERE external_id IS NOT NULL` — idempotência de webhook (ver [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)).
- `uq_transaction_unique_offer_per_contact (contact_id, offer_id) WHERE status='approved'` — BR-OFFER-UNIQUENESS (exceções tratadas em BR).
- `idx_transaction_contact ON transaction (contact_id, created_at DESC)`.
- `idx_transaction_offer ON transaction (offer_id)`.

### 3.2 `transaction_snapshot`

Append-only. Trigger bloqueia UPDATE/DELETE do `payload`. Ver [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md).

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `transaction_id` | uuid | não | — | FK `transaction(id) ON DELETE RESTRICT`; `uq_transaction_snapshot_transaction_id` |
| `flag` | `transaction_snapshot_flag` | não | `normal` | `normal`, `refunded`, `disputed` — ver §3.3 sobre mutação controlada |
| `payload` | jsonb | não | — | **imutável** após insert |
| `created_at` | timestamptz | não | `now()` | — |

**Nota sobre `flag`:** o enum permite `refunded`/`disputed`, mas a mutação do campo `flag` é **proibida via UPDATE**; a política deste módulo é que toda mudança de flag gera uma linha em [`transaction_snapshot_flag_history`](#33-transaction_snapshot_flag_history) e, **na leitura**, a flag efetiva é `coalesce(último to_flag, payload.flag)` — o campo `flag` na tabela permanece `normal` como valor inicial. Essa decisão mantém `transaction_snapshot` tabela 100% append-only (trigger bloqueia UPDATE). Ver BR-SNAPSHOT-IMMUTABILITY §enforcement.

#### Schema do `payload` (documentação canônica)

```ts
type TransactionSnapshotPayload = {
  version: 1;
  captured_at: string;        // ISO8601, server-side
  brand: {
    id: string;
    name: string;
    slug: string;
  };
  legal_entity: {
    id: string;               // issuing_legal_entity_id da oferta no instante da venda
    cnpj: string;
    company_name: string;
    tax_regime?: string;
  };
  offer: {
    id: string;
    name: string;
    slug: string;
    type: 'regular' | 'renewal';
    renews_offer_id?: string;
  };
  condition: {
    id: string;
    name: string;
    priority: number;
    advantage_score: number;
    is_default: boolean;
    is_public: boolean;
  };
  rules: {
    group_id: string;
    operator: 'and' | 'or';
    children: RuleNode[];     // árvore completa de grupos + regras avaliadas
    evaluation: 'match' | 'fallback_default';
    context_snapshot: {
      campaign_id?: string;
      creative_id?: string;
      channel?: string;
      is_internal?: boolean;
    };
  };
  items: Array<{
    condition_item_id: string;
    kind: 'main'|'bonus'|'upsell'|'order_bump'|'complement'|'commercial_benefit';
    product?: { id: string; name: string; slug: string; kind: string; };
    commercial_benefit?: { id: string; name: string; slug: string; auto_tag?: string; };
    quantity: number;
    access_rule: Record<string, unknown>;
    vigency_months: number | null;
    discount: number | null;
    responsible_user_id: string | null;
  }>;
  payment_option: {
    id: string;
    method: string;            // offer_payment_method
    price: number;
    installments: number | null;
    custom_config: Record<string, unknown>;
  };
  source: {
    provider?: string;         // integration_provider
    external_id?: string;
    raw_event_id?: string;     // linkagem a webhook_log
  };
};
```

### 3.3 `transaction_snapshot_flag_history`

Append-only. Uma linha por mudança de flag.

```sql
CREATE TABLE transaction_snapshot_flag_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES transaction_snapshot(id),
  from_flag transaction_snapshot_flag,
  to_flag transaction_snapshot_flag NOT NULL,
  reason text NOT NULL,
  caused_by_refund_id uuid,      -- FK lógica a refund.id (sem FK física para evitar ciclo)
  changed_by uuid REFERENCES user_account(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tsfh_snapshot ON transaction_snapshot_flag_history (snapshot_id);
```

### 3.4 `transaction_item`

Itens materializados a partir do snapshot. Usados para UI, entrega e analytics; **não** são fonte da verdade (snapshot é).

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `transaction_id` | uuid | não | — | FK `transaction(id) ON DELETE RESTRICT` |
| `item_kind` | `offer_condition_item_kind` | não | — | — |
| `product_id` | uuid | sim | — | FK `product(id) ON DELETE RESTRICT` |
| `commercial_benefit_id` | uuid | sim | — | FK `commercial_benefit(id) ON DELETE RESTRICT` |
| `quantity` | int | não | — | `CHECK quantity > 0` |
| `resolved_rules` | jsonb | não | `'{}'` | cópia de `access_rule` + vigência aplicada |
| `delivery_status` | text | não | `pending` | CHECK `IN ('pending','scheduled','in_progress','delivered','not_applicable')` |
| `responsible_user_id` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

### 3.5 `transaction_status_history`

Append-only. Ver convenção [`02-db-schema-conventions.md §8`](../30-contracts/02-db-schema-conventions.md).

```sql
CREATE TABLE transaction_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transaction(id),
  from_status transaction_status,
  to_status transaction_status NOT NULL,
  changed_by uuid REFERENCES user_account(id),
  actor_system text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.6 DDL copiável

```sql
CREATE TABLE transaction (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES offer(id) ON DELETE RESTRICT,
  offer_condition_id uuid NOT NULL REFERENCES offer_condition(id) ON DELETE RESTRICT,
  offer_payment_option_id uuid NOT NULL REFERENCES offer_payment_option(id) ON DELETE RESTRICT,
  status transaction_status NOT NULL DEFAULT 'pending',
  amount numeric(12,2) NOT NULL,
  currency char(3) NOT NULL DEFAULT 'BRL',
  external_provider integration_provider,
  external_id text,
  external_fee numeric(12,2),
  snapshot_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  refused_at timestamptz,
  CONSTRAINT ck_transaction_amount CHECK (amount >= 0),
  CONSTRAINT ck_transaction_approved_coherence CHECK (
    (status = 'approved' AND approved_at IS NOT NULL AND snapshot_id IS NOT NULL)
    OR (status <> 'approved')
  ),
  CONSTRAINT ck_transaction_refused_coherence CHECK (
    (status = 'refused' AND refused_at IS NOT NULL) OR (status <> 'refused')
  )
);
CREATE UNIQUE INDEX uq_transaction_external_provider_external_id
  ON transaction (external_provider, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX uq_transaction_unique_offer_per_contact
  ON transaction (contact_id, offer_id) WHERE status = 'approved';
CREATE INDEX idx_transaction_contact ON transaction (contact_id, created_at DESC);
CREATE INDEX idx_transaction_offer ON transaction (offer_id);

CREATE TABLE transaction_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transaction(id) ON DELETE RESTRICT,
  flag transaction_snapshot_flag NOT NULL DEFAULT 'normal',
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_transaction_snapshot_transaction_id UNIQUE (transaction_id)
);
-- Trigger de imutabilidade — ver BR-SNAPSHOT-IMMUTABILITY
```

Após criar `transaction_snapshot`, FK reversa:
```sql
ALTER TABLE transaction
  ADD CONSTRAINT fk_transaction_snapshot
  FOREIGN KEY (snapshot_id) REFERENCES transaction_snapshot(id) DEFERRABLE INITIALLY DEFERRED;
```

## 4. Relações (ASCII)

```
contact ──< transaction >── offer
              │            │
              │            └─ offer_condition ─ offer_payment_option
              │
              ├─1—1 transaction_snapshot ──< transaction_snapshot_flag_history
              ├─< transaction_item
              └─< transaction_status_history
```

## 5. Invariantes

- `INV-TRX-01`: `transaction_snapshot.payload` **nunca** é atualizado nem deletado. Trigger `trg_transaction_snapshot_immutable` bloqueia `UPDATE` e `DELETE` retornando exceção. Ver [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md).
- `INV-TRX-02`: transação com `status='approved'` tem `snapshot_id NOT NULL` e `approved_at NOT NULL` (CHECK).
- `INV-TRX-03`: contato não pode ter 2 transações `approved` para a mesma `offer_id` — índice parcial único. Exceções (renewal, após refund) detalhadas em [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md).
- `INV-TRX-04`: `transaction.brand_id = offer.brand_id` (guard na Server Action; poderia ser CHECK materializado).
- `INV-TRX-05`: toda `transaction_status_history` é append-only (trigger).
- `INV-TRX-06`: `transaction.external_id` único por `external_provider` (quando presente) — idempotência de webhook.
- `INV-TRX-07`: venda direta de produto sem oferta é impossível (todas as FKs `offer_id`, `offer_condition_id`, `offer_payment_option_id` são NOT NULL). Complementa `INV-CATALOG-02`.

## 6. Estados e transições (`transaction_status`)

| De | Evento | Para | Efeitos colaterais |
|---|---|---|---|
| — | `createPendingTransaction` | `pending` | INSERT transaction; emite `TE-SALE-PENDING` |
| `pending` | provedor confirma pagamento | `approved` | compor snapshot, incrementar `offer_sales_counter`, gerar `transaction_item`, chamar MOD-ENTITLEMENT.grant, emitir `TE-SALE-APPROVED`, (se aplicável) fechar oportunidade no funil |
| `pending` | provedor recusa | `refused` | `refused_at=now()`; emite `TE-SALE-REFUSED` |
| `approved` | MOD-REFUND aprova | `refunded` | não altera snapshot.payload; cria linha em `transaction_snapshot_flag_history (to_flag='refunded')`; emite `TE-SALE-REFUNDED` |
| `approved` | provedor notifica chargeback | `chargeback` | cria linha em flag_history (`disputed`); emite `TE-SALE-CHARGEBACK` |
| `pending` | admin cancela | `cancelled` | — |

Todas as transições gravam `transaction_status_history`.

## 7. Regras de negócio referenciadas

- [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)
- [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md)
- [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md) (chamada em pending→approved)
- [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md)
- [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md) (eleva lead → customer/student)
- [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)

## 8. Eventos de timeline emitidos

- `TE-SALE-PENDING` — ao criar transação pendente.
- `TE-SALE-APPROVED` — ao aprovar (inclui `snapshot_id` no payload).
- `TE-SALE-REFUSED` — ao recusar.
- `TE-SALE-REFUNDED` — emitido por MOD-REFUND (deste módulo: apenas flag no snapshot).
- `TE-SALE-CHARGEBACK` — ao receber notificação.
- Aplicação de `auto_tag` de benefício emite `TE-CONTACT-TAG-ADDED` (delegado para MOD-CONTACT).

Schema de payload em [`30-contracts/03-timeline-event-catalog.md`](../30-contracts/03-timeline-event-catalog.md).

## 9. Fluxos relacionados

- `FLOW-04-SALE-INGESTION` — webhook Digital Guru → transaction pending → approved (ver [`60-flows/`]).
- `FLOW-07-REFUND-END-TO-END` — transação `approved` → `refunded`.
- `FLOW-OFFER-DECISION` — chamada de `selectCondition` em pending→approved.

## 10. Fluxo principal: `approveTransaction` (passos atômicos)

Tudo em **uma transação SQL**:

1. `SELECT ... FOR UPDATE` em `transaction` para evitar dupla aprovação.
2. Validar `BR-OFFER-UNIQUENESS` (considerar exceções: `offer.type='renewal'` ou existência de snapshot anterior com flag `refunded`).
3. Chamar `MOD-OFFER.selectCondition(offer_id, ctx)` — se resultado for `conflict`, abrir `contact_issue` kind `offer_conflict` e manter transação em `pending` (operador resolve).
4. `UPDATE offer_sales_counter SET approved_count=approved_count+1 WHERE offer_id=$1 RETURNING approved_count;` (ADR-07 aceita excesso).
5. Compor `TransactionSnapshotPayload` (função pura `composeSnapshot`), inserir em `transaction_snapshot`.
6. Inserir `transaction_item` por item do snapshot.
7. Atualizar `transaction`: `status='approved'`, `snapshot_id=...`, `approved_at=now()`.
8. Chamar `MOD-ENTITLEMENT.grantFromTransaction(transactionId)` (aplica `BR-ENTITLEMENT-CONSOLIDATION`).
9. Chamar `MOD-CONTACT.reclassify(contactId)` (BR-CONTACT-CLASSIFICATION) e aplicar `auto_tag` de benefícios.
10. Chamar `MOD-FUNNEL.closeOpportunityAsWon` se houver oportunidade aberta ligada ao contato/oferta.
11. Emitir `TE-SALE-APPROVED` + `TE-ENTITLEMENT-GRANTED` (via MOD-ENTITLEMENT).
12. Se `offer.type='renewal'` ou subscription associada: delegar para MOD-BILLING criar `subscription`/`installment`.

Qualquer falha ⇒ ROLLBACK total; transação permanece `pending` para reprocessamento via Inngest retry (idempotente via `external_id`).

## 11. Casos de teste obrigatórios

- `transaction.create-pending.emits-te-pending`.
- `transaction.approve.happy` — compõe snapshot coerente com oferta/condição/payment option no momento.
- `transaction.approve.snapshot-is-frozen` — alteração posterior em `offer.name` não muda `snapshot.payload.offer.name`.
- `transaction.approve.updates-sales-counter-by-one`.
- `transaction.approve.rejects-second-approved-same-offer-same-contact` (BR-OFFER-UNIQUENESS), com exceções cobertas em seus próprios casos.
- `transaction.approve.idempotent-by-external-id` — webhook repetido do provedor não cria transação duplicada.
- `transaction.approve.conflict-condition-opens-issue-and-stays-pending`.
- `transaction_snapshot.update-fails` — tentativa de UPDATE retorna erro do trigger.
- `transaction_snapshot.delete-fails` — idem para DELETE.
- `transaction.flag-refunded.creates-history-row-keeps-payload`.

## 12. Open Questions

- `OQ-TRX-01` — `transaction.external_fee` deve ser parte do snapshot (`source.fee`)? Hoje fica só na tabela `transaction` para conciliação financeira.
- `OQ-TRX-02` — `transaction_item.delivery_status` usa CHECK texto porque enum `commercial_benefit_delivery_status` não existe em `30-contracts`. Serializar criação do enum.
- `OQ-TRX-03` — FK `snapshot_id` DEFERRABLE + circular (transaction ↔ snapshot) — confirmar que Drizzle gera migration aceitável.
- `OQ-TRX-04` — chargeback gera `transaction_status='chargeback'` e reembolso? Ou só marca flag disputed? Decisão com operação.
- `OQ-TRX-05` — se `selectCondition` retorna conflict, quem resolve no UI e reaprova? Formalizar em FLOW.
