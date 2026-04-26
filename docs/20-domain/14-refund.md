# Reembolso (Módulo MOD-REFUND)

## 1. Finalidade

Operar **reembolso end-to-end** de uma transação aprovada: abrir solicitação, aprovar (por admin ou financial), executar efeitos em cascata (flagar snapshot, revogar entitlements, reclassificar contato, reverter oportunidade no funil, cancelar assinatura) e liberar recompra da mesma oferta. Formalizado em [`ADR-02`](../90-meta/04-decision-log.md#adr-02).

O reembolso **não** altera `transaction_snapshot.payload` — a imutabilidade é preservada por uma nova linha em `transaction_snapshot_flag_history` (ver [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md)).

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/refund.ts` (`refund`, `refund_effect_log`, `refund_status_history`)
  - `lib/db/schema/_relations/refund.ts`
  - `lib/domain/refund/` (`openRefund`, `approveRefund`, `rejectRefund`, `executeRefundEffects`)
  - `app/(app)/transactions/[id]/refund/`
  - `tests/unit/refund/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`refund_status`)
  - `docs/20-domain/11-transaction-snapshot.md` (interface `flagSnapshotRefunded`)
  - `docs/20-domain/12-entitlement.md` (interface `revokeByTransaction`)
  - `docs/20-domain/13-subscription-billing.md` (`cancelSubscription`)
  - `docs/50-business-rules/BR-REFUND.md`
  - `docs/50-business-rules/BR-OFFER-UNIQUENESS.md` (refund libera recompra)
  - `docs/50-business-rules/BR-RBAC.md` (só admin/financial aprova)
- Interfaces públicas expostas:
  - `openRefund(transactionId, userId, amount, reason): Refund`
  - `approveRefund(refundId, approverUserId): Refund`
  - `rejectRefund(refundId, approverUserId, reason): Refund`
  - `markProcessed(refundId, externalRefundId): Refund` (webhook do provedor confirmando estorno)

## 3. Entidades e campos

### 3.1 `refund`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `transaction_id` | uuid | não | — | FK `transaction(id) ON DELETE RESTRICT`; `uq_refund_active_per_transaction` (índice parcial) impede duas solicitações abertas na mesma transação |
| `opened_by_user_id` | uuid | não | — | FK `user_account(id) ON DELETE RESTRICT` |
| `approved_by_user_id` | uuid | sim | — | FK `user_account(id) ON DELETE RESTRICT` |
| `amount` | numeric(12,2) | não | — | `CHECK amount > 0 AND amount <= transaction.amount` (guard app; ver OQ) |
| `reason` | text | não | — | — |
| `status` | `refund_status` | não | `requested` | enum `refund_status` — `requested\|approved\|rejected\|processed\|failed\|cancelled` (ADR-03) |
| `external_refund_id` | text | sim | — | id do estorno no provedor |
| `external_provider` | `integration_provider` | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `approved_at` | timestamptz | sim | — | CHECK coerente com status |
| `rejected_at` | timestamptz | sim | — | — |
| `processed_at` | timestamptz | sim | — | — |
| `updated_at` | timestamptz | não | `now()` | — |

Índice parcial único:
```sql
CREATE UNIQUE INDEX uq_refund_active_per_transaction
  ON refund (transaction_id) WHERE status IN ('requested','approved');
```

### 3.2 `refund_effect_log`

Registra cada efeito colateral executado ao aprovar o refund. Append-only.

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `refund_id` | uuid | não | — | FK `refund(id) ON DELETE RESTRICT` |
| `effect_kind` | text | não | — | CHECK `IN ('snapshot_flagged','entitlement_revoked','contact_reclassified','opportunity_reverted','subscription_cancelled','timeline_emitted')` |
| `ref_id` | uuid | sim | — | id do objeto afetado (entitlement, subscription, funnel_entry...) |
| `detail` | jsonb | não | `'{}'` | contexto do efeito |
| `executed_at` | timestamptz | não | `now()` | — |

### 3.3 `refund_status_history`

Padrão append-only.

### 3.4 DDL copiável

```sql
CREATE TABLE refund (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES transaction(id) ON DELETE RESTRICT,
  opened_by_user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES user_account(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  external_refund_id text,
  external_provider integration_provider,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  processed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_refund_amount CHECK (amount > 0),
  CONSTRAINT ck_refund_status CHECK (status IN ('requested','approved','rejected','processed','cancelled')),
  CONSTRAINT ck_refund_approved_coherence CHECK (
    (status = 'approved' AND approved_at IS NOT NULL AND approved_by_user_id IS NOT NULL)
    OR (status NOT IN ('approved','processed'))
    OR (status = 'processed' AND approved_at IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_refund_active_per_transaction
  ON refund (transaction_id) WHERE status IN ('requested','approved');

CREATE TABLE refund_effect_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id uuid NOT NULL REFERENCES refund(id) ON DELETE RESTRICT,
  effect_kind text NOT NULL,
  ref_id uuid,
  detail jsonb NOT NULL DEFAULT '{}',
  executed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_refund_effect_kind CHECK (effect_kind IN (
    'snapshot_flagged','entitlement_revoked','contact_reclassified',
    'opportunity_reverted','subscription_cancelled','timeline_emitted'
  ))
);
```

## 4. Relações (ASCII)

```
transaction ──< refund >── user (opened_by, approved_by)
                 │
                 └─< refund_effect_log ──? referências lógicas a:
                        transaction_snapshot
                        customer_entitlement
                        subscription
                        funnel_entry
                        contact
```

## 5. Invariantes

- `INV-REFUND-01`: no máximo **1** `refund` em status `requested` ou `approved` por `transaction_id` (índice parcial único).
- `INV-REFUND-02`: aprovação requer `approved_by_user_id` com papel `admin` **ou** `financial` (guard em Server Action; ver `BR-RBAC`).
- `INV-REFUND-03`: `amount <= transaction.amount` (guard; implementável via trigger).
- `INV-REFUND-04`: **transação atômica**: aprovação + todos os efeitos colaterais rodam numa única transação SQL. Falha em qualquer passo ⇒ rollback total e `refund.status` permanece `requested`.
- `INV-REFUND-05`: `refund_effect_log` é append-only (trigger).
- `INV-REFUND-06`: refund aprovado **não altera** `transaction_snapshot.payload` — escreve em `transaction_snapshot_flag_history` (ver `BR-SNAPSHOT-IMMUTABILITY`).
- `INV-REFUND-07`: após refund aprovado, contato pode recomprar a mesma oferta (BR-OFFER-UNIQUENESS é relaxado pela presença de flag `refunded`).

## 6. Estados e transições (`refund.status`)

| De | Evento | Para | Guard |
|---|---|---|---|
| — | `openRefund` | `requested` | usuário tem papel `support`/`financial`/`admin` (abrir) |
| `requested` | admin/financial aprova | `approved` | RBAC; executa efeitos atomicamente |
| `requested` | admin/financial rejeita | `rejected` | RBAC |
| `requested` | solicitante cancela | `cancelled` | antes de aprovação |
| `approved` | webhook do provedor confirma estorno | `processed` | `external_refund_id` presente |

## 7. Efeitos colaterais ao aprovar (ordem canônica)

Tudo em **uma transação SQL**. Referência canônica em [`BR-REFUND`](../50-business-rules/BR-REFUND.md).

1. `UPDATE refund SET status='approved', approved_by_user_id=$u, approved_at=now()`. Grava `refund_status_history`.
2. Flag snapshot: INSERT em `transaction_snapshot_flag_history (snapshot_id, to_flag='refunded', reason, caused_by_refund_id)`. Registrar `refund_effect_log` kind `snapshot_flagged`.
3. Para cada `customer_entitlement` com `origin_transaction_id = transaction.id` e `status='active'`: `UPDATE status='revoked'`, registrar `entitlement_history` + `entitlement_status_history`. Registrar `refund_effect_log` kind `entitlement_revoked` por direito.
4. `UPDATE transaction SET status='refunded'` e registrar `transaction_status_history`.
5. Reclassificar contato: chamar `MOD-CONTACT.reclassify(contactId)` — pode voltar de `customer`/`student` para `lead` se esta era a única compra ativa. Registrar `refund_effect_log` kind `contact_reclassified`.
6. Reverter oportunidade no funil: para cada `funnel_entry` com `label='won'` e `won_transaction_id = transaction.id`, setar `label='reopened'` (ou `lost`, conforme política de MOD-FUNNEL) e registrar `refund_effect_log` kind `opportunity_reverted`.
7. Cancelar assinatura se houver: `subscription` com `origin_transaction_id = transaction.id` e `status IN ('trial','active','past_due')` → `cancelSubscription(..., reason='refund')`. Registrar `refund_effect_log` kind `subscription_cancelled`.
8. Emitir eventos de timeline: `TE-SALE-REFUNDED`, `TE-ENTITLEMENT-REVOKED` (por direito), `TE-CONTACT-CLASSIFICATION-CHANGED` (se aplicável), `TE-OPPORTUNITY-LABEL-CHANGED` (se aplicável), `TE-SUBSCRIPTION-CANCELLED` (se aplicável). Registrar `refund_effect_log` kind `timeline_emitted` com lista de eventos.

Qualquer falha ⇒ ROLLBACK. `refund.status` volta para `requested`; operador pode retentar.

## 8. Regras de negócio referenciadas

- [`BR-REFUND`](../50-business-rules/BR-REFUND.md) — ordem e atomicidade.
- [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md) — forma canônica de flagar snapshot.
- [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md) — exceção pós-refund.
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md) — aprovação restrita.
- [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md) — reclassificação.
- [`BR-SUBSCRIPTION`](../50-business-rules/BR-SUBSCRIPTION.md) — cancelamento.

## 9. Eventos de timeline emitidos

- `TE-SALE-REFUNDED` — ao aprovar (payload: `{ transaction_id, refund_id, reason }`).
- `TE-ENTITLEMENT-REVOKED` (delegado via MOD-ENTITLEMENT) — por direito.
- `TE-CONTACT-CLASSIFICATION-CHANGED` (delegado via MOD-CONTACT) — quando rebaixa.
- `TE-OPPORTUNITY-LABEL-CHANGED` (delegado via MOD-FUNNEL).
- `TE-SUBSCRIPTION-CANCELLED` (delegado via MOD-BILLING).

## 10. Fluxos relacionados

- `FLOW-07-REFUND-END-TO-END` — fluxo canônico, referenciar este módulo.
- `FLOW-REFUND-WEBHOOK-RECONCILE` — webhook do provedor → `markProcessed`.

## 11. Casos de teste obrigatórios

- `refund.open.happy` — suporte abre refund; status `requested`.
- `refund.open.rejects-second-active-per-transaction` — índice parcial único impede concorrência.
- `refund.approve.requires-admin-or-financial` — commercial tentando aprovar retorna 403.
- `refund.approve.cascades-all-effects-atomically`.
- `refund.approve.entitlements-revoked` — todos os direitos com `origin_transaction_id` viram `revoked`.
- `refund.approve.snapshot-payload-unchanged` — UPDATE no payload continuaria falhando.
- `refund.approve.flag-history-row-written`.
- `refund.approve.allows-repurchase-of-same-offer` — após refund, contato compra a mesma oferta e passa BR-OFFER-UNIQUENESS.
- `refund.approve.rollback-on-sub-effect-failure` — simular falha em `cancelSubscription`; refund fica `requested`, snapshot sem flag, entitlements ativos.
- `refund.processed.on-provider-webhook` — `external_refund_id` marca status `processed`.

## 12. Open Questions

- `OQ-REFUND-01` — **Resolvido (ADR-17, 2026-04-25)**: enum `refund_status` tem ambos `failed` (falha técnica) e `cancelled` (cancelamento pelo solicitante). Migration `0012_colorful_odin.sql` gerada.
- `OQ-REFUND-02` — reembolso **parcial** (`amount < transaction.amount`) afeta direitos proporcionalmente? Proposta Fase 1: refund parcial **não** revoga direitos (apenas financial). Validar com negócio.
- `OQ-REFUND-03` — quem pode abrir (`openRefund`)? Hoje suporte/financial/admin. Confirmar.
- `OQ-REFUND-04` — chargeback do provedor também abre refund automaticamente? Ou é fluxo separado que resulta em `transaction.status='chargeback'`?
- `OQ-REFUND-05` — tag aplicada por benefício (`auto_tag`) é removida ao refundar? Hoje permanece; decidir com negócio.
