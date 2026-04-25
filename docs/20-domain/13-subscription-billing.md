# Assinaturas e cobrança (Módulo MOD-BILLING)

## 1. Finalidade

Modelar **cobrança recorrente** (assinaturas) e **cobrança parcelada** (installments) associadas a transações/ofertas. Gere visibilidade sobre inadimplência consolidada (ver [`ADR-01`](../90-meta/04-decision-log.md#adr-01)) e suporte dunning automático. Depende do provedor de pagamento (Digital Guru na Fase 1) para eventos de ciclo — ver [`40-integrations/01-digital-guru.md`](../40-integrations/01-digital-guru.md).

**Escopo Fase 1:**
- assinatura com status (trial, active, past_due, cancelled, expired)
- parcela individual com vencimento e status
- dunning simples (retry em D+3, D+7, D+15)
- painel de inadimplência

**Fora do escopo Fase 1:** cobrança própria (tokenização, adquirente direto); cobrança é delegada ao provedor.

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/billing.ts` (`subscription`, `installment`, `subscription_status_history`, `installment_status_history`)
  - `lib/db/schema/_relations/billing.ts`
  - `lib/domain/billing/` (funções públicas: `createSubscriptionFromTransaction`, `handleInstallmentPaid`, `handleInstallmentOverdue`, `advanceSubscription`, `cancelSubscription`)
  - `inngest/billing/*` (jobs de dunning, cron de varredura de parcelas)
  - `app/(app)/billing/` (UI: dashboard de inadimplência, detalhe de assinatura)
  - `tests/unit/billing/**` + `tests/integration/billing/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`subscription_status`, `installment_status`, `offer_payment_method`)
  - `docs/20-domain/11-transaction-snapshot.md` (origem da assinatura)
  - `docs/40-integrations/01-digital-guru.md` (eventos de ciclo)
  - `docs/50-business-rules/BR-SUBSCRIPTION.md`
- Interfaces públicas expostas (ver `docs/30-contracts/07-module-interfaces.md` §MOD-BILLING):
  - `createSubscriptionFromTransaction(tx, transactionId): Promise<Subscription>`
  - `handleInstallmentPaid(tx, installmentId, paidAt?): Promise<Installment>`
  - `handleInstallmentOverdue(tx, installmentId): Promise<Installment>`
  - `advanceSubscription(tx, subscriptionId, now?): Promise<SubscriptionStatus>` (chamado por cron Inngest)
  - `cancelSubscription(tx, subscriptionId, reason): Promise<Subscription>`

## 3. Entidades e campos

### 3.1 `subscription`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE RESTRICT` |
| `brand_id` | uuid | não | — | FK `brand(id) ON DELETE RESTRICT` |
| `offer_id` | uuid | não | — | FK `offer(id) ON DELETE RESTRICT` |
| `offer_condition_id` | uuid | não | — | FK `offer_condition(id) ON DELETE RESTRICT` |
| `offer_payment_option_id` | uuid | não | — | FK `offer_payment_option(id) ON DELETE RESTRICT` |
| `origin_transaction_id` | uuid | não | — | FK `transaction(id) ON DELETE RESTRICT`. Transação fundadora (primeira aprovada). |
| `status` | `subscription_status` | não | `trial` | — |
| `current_period_start` | timestamptz | não | `now()` | — |
| `current_period_end` | timestamptz | não | — | `CHECK current_period_end > current_period_start` |
| `next_billing_at` | timestamptz | sim | — | — |
| `trial_ends_at` | timestamptz | sim | — | quando `status='trial'` é obrigatório (CHECK) |
| `cancelled_at` | timestamptz | sim | — | CHECK coerente com status |
| `cancel_reason` | text | sim | — | — |
| `external_provider` | `integration_provider` | sim | — | — |
| `external_id` | text | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

Índices:
- `idx_subscription_contact ON subscription (contact_id, status)`
- `uq_subscription_external (external_provider, external_id) WHERE external_id IS NOT NULL`

### 3.2 `installment`

Usada tanto para parcelas de parcelamento único (vinculadas a `transaction_id`) quanto de assinatura (vinculadas a `subscription_id`).

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `transaction_id` | uuid | sim | — | FK `transaction(id) ON DELETE RESTRICT` |
| `subscription_id` | uuid | sim | — | FK `subscription(id) ON DELETE RESTRICT` |
| `sequence` | int | não | — | sequencial começa em 1 |
| `due_at` | timestamptz | não | — | — |
| `amount` | numeric(12,2) | não | — | `CHECK amount >= 0` |
| `status` | `installment_status` | não | `scheduled` | — |
| `paid_at` | timestamptz | sim | — | CHECK coerente |
| `external_provider` | `integration_provider` | sim | — | — |
| `external_id` | text | sim | — | id da parcela no provedor |
| `boleto_url` | text | sim | — | quando aplicável |
| `retry_count` | int | não | `0` | contagem de tentativas de dunning |
| `last_retry_at` | timestamptz | sim | — | — |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

**CHECK `ck_installment_parent_exclusive`:**
```
(transaction_id IS NOT NULL AND subscription_id IS NULL)
OR
(transaction_id IS NULL AND subscription_id IS NOT NULL)
```

Índices:
- `uq_installment_external (external_provider, external_id) WHERE external_id IS NOT NULL` — idempotência.
- `uq_installment_sequence_subscription (subscription_id, sequence)` quando `subscription_id IS NOT NULL`.
- `uq_installment_sequence_transaction (transaction_id, sequence)` quando `transaction_id IS NOT NULL`.
- `idx_installment_status_due ON installment (status, due_at)` — usado pelo cron de dunning.

### 3.3 `subscription_status_history` e `installment_status_history`

Append-only. Segue padrão da [`02-db-schema-conventions.md §8`](../30-contracts/02-db-schema-conventions.md).

### 3.4 DDL copiável

```sql
CREATE TABLE subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  offer_id uuid NOT NULL REFERENCES offer(id) ON DELETE RESTRICT,
  offer_condition_id uuid NOT NULL REFERENCES offer_condition(id) ON DELETE RESTRICT,
  offer_payment_option_id uuid NOT NULL REFERENCES offer_payment_option(id) ON DELETE RESTRICT,
  origin_transaction_id uuid NOT NULL REFERENCES transaction(id) ON DELETE RESTRICT,
  status subscription_status NOT NULL DEFAULT 'trial',
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  next_billing_at timestamptz,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  external_provider integration_provider,
  external_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_subscription_period CHECK (current_period_end > current_period_start),
  CONSTRAINT ck_subscription_trial CHECK (
    (status = 'trial' AND trial_ends_at IS NOT NULL)
    OR (status <> 'trial')
  ),
  CONSTRAINT ck_subscription_cancelled CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled')
  )
);
CREATE UNIQUE INDEX uq_subscription_external
  ON subscription (external_provider, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_subscription_contact ON subscription (contact_id, status);

CREATE TABLE installment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES transaction(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES subscription(id) ON DELETE RESTRICT,
  sequence int NOT NULL,
  due_at timestamptz NOT NULL,
  amount numeric(12,2) NOT NULL,
  status installment_status NOT NULL DEFAULT 'scheduled',
  paid_at timestamptz,
  external_provider integration_provider,
  external_id text,
  boleto_url text,
  retry_count int NOT NULL DEFAULT 0,
  last_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_installment_amount CHECK (amount >= 0),
  CONSTRAINT ck_installment_paid_coherence CHECK (
    (status = 'paid' AND paid_at IS NOT NULL) OR (status <> 'paid')
  ),
  CONSTRAINT ck_installment_parent_exclusive CHECK (
    (transaction_id IS NOT NULL AND subscription_id IS NULL)
    OR (transaction_id IS NULL AND subscription_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX uq_installment_external
  ON installment (external_provider, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX uq_installment_seq_sub
  ON installment (subscription_id, sequence) WHERE subscription_id IS NOT NULL;
CREATE UNIQUE INDEX uq_installment_seq_trx
  ON installment (transaction_id, sequence) WHERE transaction_id IS NOT NULL;
CREATE INDEX idx_installment_status_due ON installment (status, due_at);
```

## 4. Relações (ASCII)

```
contact ──< subscription >── offer_condition
              │                ├─ offer_payment_option
              │                └─ origin_transaction
              │
              └─< installment (ou installment vinculada diretamente a transaction)
                     │
                     └─ external_provider/external_id (idempotência)
```

## 5. Invariantes

- `INV-BILL-01`: toda `installment` vincula-se a **exatamente um** pai: `transaction_id` XOR `subscription_id` (CHECK).
- `INV-BILL-02`: `subscription.current_period_end > current_period_start` (CHECK).
- `INV-BILL-03`: `subscription.status='trial'` ⇒ `trial_ends_at IS NOT NULL`.
- `INV-BILL-04`: `subscription.status='cancelled'` ⇒ `cancelled_at IS NOT NULL`.
- `INV-BILL-05`: `installment.external_id` único por `external_provider` (quando presente) — idempotência.
- `INV-BILL-06`: mudança de status de `subscription`/`installment` grava linha em `*_status_history` (append-only).
- `INV-BILL-07`: assinatura cancelada **preserva entitlements ativos até `current_period_end`** (ver [`BR-SUBSCRIPTION`](../50-business-rules/BR-SUBSCRIPTION.md)). Revogação de direito ocorre só em refund (BR-REFUND).
- `INV-BILL-08`: reativação de assinatura `cancelled`/`expired` cria **nova** `subscription`; a antiga permanece imutável.

## 6. Estados e transições

### 6.1 `subscription_status`

| De | Evento | Para | Guard |
|---|---|---|---|
| — | `createSubscriptionFromTransaction` | `trial` ou `active` | trial se `trial_ends_at` presente |
| `trial` | `trial_ends_at` expira + parcela paga | `active` | — |
| `trial` | `trial_ends_at` expira + parcela não paga | `past_due` | — |
| `active` | parcela não paga após vencimento | `past_due` | — |
| `past_due` | parcela paga (retry sucedeu) | `active` | — |
| `past_due` | retry N final falhou | `cancelled` | dunning esgotado |
| `active` \| `past_due` | contato/admin cancela | `cancelled` | RBAC admin/financial ou self-service |
| `active` | `current_period_end` passou sem renovação | `expired` | só quando assinatura sem renovação automática |

### 6.2 `installment_status`

| De | Evento | Para |
|---|---|---|
| — | emissão | `scheduled` |
| `scheduled` | webhook paga | `paid` |
| `scheduled` | passa `due_at` sem pagamento | `overdue` |
| `overdue` | webhook paga (retry) | `paid` |
| `paid` | refund | `refunded` |
| qualquer | admin cancela | `cancelled` |

## 7. Dunning (política padrão Fase 1)

Quando `installment.status` vira `overdue`, cron dispara retries em **D+3, D+7, D+15** (a partir de `due_at`). Cada retry:
1. Incrementa `retry_count`, atualiza `last_retry_at`.
2. Notifica o provedor (ou apenas aguarda webhook de pagamento, dependendo do contrato).
3. Emite `TE-SUBSCRIPTION-PAST-DUE` na primeira entrada em past_due.

Após **D+15 sem pagamento**, `subscription` vai para `cancelled` com `cancel_reason='dunning_exhausted'` e emite `TE-SUBSCRIPTION-CANCELLED`. Entitlements permanecem até `current_period_end` (ver `INV-BILL-07`).

Regras completas em [`BR-SUBSCRIPTION`](../50-business-rules/BR-SUBSCRIPTION.md).

## 8. Regras de negócio referenciadas

- [`BR-SUBSCRIPTION`](../50-business-rules/BR-SUBSCRIPTION.md) — ciclo, dunning, cancelamento.
- [`BR-REFUND`](../50-business-rules/BR-REFUND.md) — refund cancela subscription associada.
- [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md) — `external_id` único.

## 9. Eventos de timeline emitidos

- `TE-SUBSCRIPTION-STARTED` — criação.
- `TE-SUBSCRIPTION-RENEWED` — ciclo avançou (parcela recorrente paga).
- `TE-SUBSCRIPTION-PAST-DUE` — entrou em past_due.
- `TE-SUBSCRIPTION-CANCELLED` — cancelada.
- `TE-INSTALLMENT-PAID` — parcela quitada.
- `TE-INSTALLMENT-OVERDUE` — parcela vencida.

## 10. Fluxos relacionados

- `FLOW-04-SALE-INGESTION` — compra aprovada com plano parcelado cria `subscription` (se recorrente) + `installment`s.
- `FLOW-BILLING-DUNNING` — parcela vence → retry → recuperação ou cancelamento.
- `FLOW-07-REFUND-END-TO-END` — refund cancela subscription.

## 11. Casos de teste obrigatórios

- `subscription.create.from-transaction-happy`.
- `subscription.trial-to-active-after-payment`.
- `subscription.past-due-recovers-to-active-on-paid`.
- `subscription.past-due-exhausted-cancels-and-preserves-entitlement-until-period-end`.
- `subscription.cancel.manual.preserves-entitlement-until-period-end`.
- `subscription.reactivate-creates-new-subscription-record`.
- `installment.exclusive-parent-check` — installment com ambos `transaction_id` e `subscription_id` falha.
- `installment.idempotent-by-external-id`.
- `installment.cron-marks-overdue` — parcela com `due_at < now()` e status scheduled vira overdue.
- `billing.dunning.retry-3-7-15` — sequência respeitada.

## 12. Open Questions

- `OQ-BILL-01` — `subscription_status.paused` existe no enum mas não está na tabela de transições acima. Definir casos (ex.: pausa manual temporária) ou desencorajar uso.
- `OQ-BILL-02` — renovação automática de assinatura cria nova `subscription` ou atualiza `current_period_*`? Proposta: atualiza, emite `TE-SUBSCRIPTION-RENEWED`. Confirmar.
- `OQ-BILL-03` — dunning D+3/D+7/D+15 é configurável por oferta? Fase 1 usa fixo global.
- `OQ-BILL-04` — `installment.boleto_url` é persistido ou apenas lido do provedor sob demanda? Hoje persiste ao criar.
- `OQ-BILL-05` — `trial_ends_at` pode coexistir com `subscription.status='active'`? CHECK atual permite; revisar.
