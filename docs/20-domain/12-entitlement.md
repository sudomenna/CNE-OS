# Direitos adquiridos (Módulo MOD-ENTITLEMENT)

## 1. Finalidade

Materializar **o que o contato tem direito a consumir** em função de compras aprovadas: acesso a produtos (cursos, ebooks, treinamentos, mentorias) e benefícios comerciais (grupo VIP, certificado, etc.). Cada compra aprovada em [`MOD-TRANSACTION`](./11-transaction-snapshot.md) gera ou atualiza `customer_entitlement`. Quando há sobreposição (mesmo produto já possuído), aplica-se [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md) para estender/substituir — nunca criar duplicata.

Este módulo **não** controla acesso técnico ao curso (LMS é Fase 2). Ele é a **fonte canônica** do que foi concedido; integrações externas (LMS atual) leem este registro.

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/entitlement.ts`
  - `lib/db/schema/_relations/entitlement.ts`
  - `lib/domain/entitlement/` (grant, revoke, consolidação pura)
  - `lib/domain/entitlement/consolidate.ts` (`consolidate` — função pura)
  - `lib/domain/entitlement/grant.ts` (`grantFromTransaction`)
  - `lib/domain/entitlement/revoke.ts` (chamado por MOD-REFUND)
  - `app/(app)/contacts/[id]/entitlements/` (visualização)
  - `tests/unit/entitlement/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`entitlement_kind`, `entitlement_status`)
  - `docs/20-domain/11-transaction-snapshot.md` (snapshot → grants)
  - `docs/50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md`
  - `docs/50-business-rules/BR-REFUND.md`
  - `docs/50-business-rules/BR-RENEWAL.md`
- Interfaces públicas expostas:
  - `grantFromTransaction(transactionId): Entitlement[]` — consome snapshot, emite `TE-ENTITLEMENT-GRANTED`/`EXTENDED`
  - `revokeByTransaction(transactionId, reason): Entitlement[]` — chamado por MOD-REFUND
  - `listByContact(contactId): Entitlement[]`
  - `consolidate(existing, incoming): ConsolidationResult` — **função pura**, testável

## 3. Entidades e campos

### 3.1 `customer_entitlement`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE RESTRICT` |
| `brand_id` | uuid | não | — | FK `brand(id) ON DELETE RESTRICT` |
| `kind` | `entitlement_kind` | não | — | `product_access`, `benefit`, `other` |
| `ref_kind` | text | não | — | CHECK `IN ('product','benefit')` |
| `ref_id` | uuid | não | — | FK lógica (para `product.id` ou `commercial_benefit.id`) — validada pela aplicação |
| `quantity` | int | não | `1` | `CHECK quantity > 0` |
| `started_at` | timestamptz | não | `now()` | — |
| `ends_at` | timestamptz | sim | — | NULL = perpetuous (vitalício) |
| `status` | `entitlement_status` | não | `active` | — |
| `origin_transaction_id` | uuid | não | — | FK `transaction(id) ON DELETE RESTRICT`. Transação que originou (primeira concessão). |
| `last_update_transaction_id` | uuid | não | — | FK `transaction(id) ON DELETE RESTRICT`. Última transação que tocou o direito (pode ser == origin). |
| `access_rule` | jsonb | não | `'{}'` | cópia da regra de acesso efetiva |
| `created_at` | timestamptz | não | `now()` | — |
| `updated_at` | timestamptz | não | `now()` | — |

**Unicidade efetiva:** um contato **não deve ter** dois `customer_entitlement` com o mesmo `(contact_id, brand_id, ref_kind, ref_id)` em status `active`. Índice parcial único garante isto; consolidação sempre fundir em uma única linha ativa:

```sql
CREATE UNIQUE INDEX uq_customer_entitlement_active_per_ref
  ON customer_entitlement (contact_id, brand_id, ref_kind, ref_id)
  WHERE status = 'active';
```

### 3.2 `entitlement_history`

Append-only. Cada transição de estado (grant, extend, revoke, expire, consolidate) gera linha.

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `entitlement_id` | uuid | não | — | FK `customer_entitlement(id)` |
| `from` | jsonb | sim | — | snapshot do estado anterior (`{started_at, ends_at, quantity, status}`) |
| `to` | jsonb | não | — | snapshot do estado novo |
| `reason` | text | não | — | p.ex. `'initial_grant'`, `'consolidate_extend'`, `'consolidate_promote_perpetuous'`, `'refund_revoke'` |
| `caused_by_transaction_id` | uuid | sim | — | FK `transaction(id)`; NULL quando por expiração automática |
| `created_at` | timestamptz | não | `now()` | — |

Trigger bloqueia UPDATE/DELETE.

### 3.3 `entitlement_status_history`

Versão enxuta focada em mudança de `status` (padrão do repositório). Pode ser unificada com `entitlement_history` ou mantida conforme convenção geral em [`02-db-schema-conventions.md §8`](../30-contracts/02-db-schema-conventions.md). Fase 1 mantém as **duas**:

```sql
CREATE TABLE entitlement_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES customer_entitlement(id),
  from_status entitlement_status,
  to_status entitlement_status NOT NULL,
  changed_by uuid REFERENCES user_account(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 3.4 DDL copiável

```sql
CREATE TABLE customer_entitlement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,
  brand_id uuid NOT NULL REFERENCES brand(id) ON DELETE RESTRICT,
  kind entitlement_kind NOT NULL,
  ref_kind text NOT NULL,
  ref_id uuid NOT NULL,
  quantity int NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status entitlement_status NOT NULL DEFAULT 'active',
  origin_transaction_id uuid NOT NULL REFERENCES transaction(id) ON DELETE RESTRICT,
  last_update_transaction_id uuid NOT NULL REFERENCES transaction(id) ON DELETE RESTRICT,
  access_rule jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_customer_entitlement_quantity CHECK (quantity > 0),
  CONSTRAINT ck_customer_entitlement_ref_kind CHECK (ref_kind IN ('product','benefit')),
  CONSTRAINT ck_customer_entitlement_ends_after_started CHECK (ends_at IS NULL OR ends_at > started_at)
);
CREATE UNIQUE INDEX uq_customer_entitlement_active_per_ref
  ON customer_entitlement (contact_id, brand_id, ref_kind, ref_id) WHERE status = 'active';
CREATE INDEX idx_customer_entitlement_contact ON customer_entitlement (contact_id);

CREATE TABLE entitlement_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES customer_entitlement(id),
  "from" jsonb,
  "to" jsonb NOT NULL,
  reason text NOT NULL,
  caused_by_transaction_id uuid REFERENCES transaction(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_entitlement_history_ent ON entitlement_history (entitlement_id, created_at DESC);
```

## 4. Relações (ASCII)

```
contact ──< customer_entitlement >── (product | commercial_benefit)
                │
                ├─ origin_transaction_id ──> transaction
                ├─ last_update_transaction_id ──> transaction
                └─< entitlement_history
```

## 5. Invariantes

- `INV-ENT-01`: no máximo **1** `customer_entitlement` com `status='active'` por `(contact_id, brand_id, ref_kind, ref_id)`. Índice parcial único garante; consolidação atualiza a linha existente, nunca duplica.
- `INV-ENT-02`: `ends_at IS NULL` representa direito **perpetuous**; `ends_at NOT NULL` exige `ends_at > started_at` (CHECK).
- `INV-ENT-03`: `entitlement_history` é append-only (trigger bloqueia UPDATE/DELETE).
- `INV-ENT-04`: `origin_transaction_id` **nunca** muda após criação. Guard em camada de domínio; trigger bloqueia UPDATE da coluna.
- `INV-ENT-05`: `quantity > 0` (CHECK). Para "não possui mais", use `status='revoked'`.
- `INV-ENT-06`: mudança de `status` gera linha em `entitlement_status_history`.
- `INV-ENT-07`: revogação (via MOD-REFUND) nunca apaga registro; marca `status='revoked'` e registra em `entitlement_history`.

## 6. Estados e transições (`entitlement_status`)

| De | Evento | Para | Efeitos |
|---|---|---|---|
| — | `grantFromTransaction` | `active` | INSERT; `TE-ENTITLEMENT-GRANTED` |
| `active` | nova compra → consolida | `active` (estendido) | UPDATE `ends_at`/`quantity`/`access_rule`; history; `TE-ENTITLEMENT-EXTENDED` |
| `active` | `ends_at` passou (job) | `expired` | job noturno; `TE-ENTITLEMENT-REVOKED`? (hoje não emite; ver OQ) |
| `active` | admin suspende | `suspended` | guard: RBAC admin |
| `suspended` | admin reativa | `active` | — |
| `active` \| `suspended` | MOD-REFUND revoga | `revoked` | history; `TE-ENTITLEMENT-REVOKED` |
| `revoked` | nova compra do mesmo ref | `active` | "reativa" via consolidate (clone do fluxo grant, reason `reactivate_after_revoke`) |

## 7. Regras de negócio referenciadas

- [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md) — fonte da função `consolidate`.
- [`BR-REFUND`](../50-business-rules/BR-REFUND.md) — revogação em cascata.
- [`BR-RENEWAL`](../50-business-rules/BR-RENEWAL.md) — renovação sempre estende, nunca cria paralelo.

## 8. Eventos de timeline emitidos

- `TE-ENTITLEMENT-GRANTED` — ao INSERT inicial.
- `TE-ENTITLEMENT-EXTENDED` — ao UPDATE que altera `ends_at` para frente ou promove a perpetuous.
- `TE-ENTITLEMENT-REVOKED` — quando `status` vai para `revoked` (via refund).

Payload conforme [`03-timeline-event-catalog.md`](../30-contracts/03-timeline-event-catalog.md).

## 9. Fluxos relacionados

- `FLOW-04-SALE-INGESTION` — venda aprovada → grants.
- `FLOW-06-ENTITLEMENT-CONSOLIDATION` — exemplo de segunda compra estendendo.
- `FLOW-07-REFUND-END-TO-END` — revogação.

## 10. Fluxo principal: `grantFromTransaction`

Input: `transactionId`. Chamado dentro da mesma transação SQL de `approveTransaction` (ver MOD-TRANSACTION §10).

```
1. Ler snapshot.payload da transaction.
2. Para cada item de snapshot.items:
     target_ref = item.product?.id || item.commercial_benefit?.id
     ref_kind   = item.product ? 'product' : 'benefit'
     incoming = {
       contact_id, brand_id, kind: (ref_kind=='product'?'product_access':'benefit'),
       ref_kind, ref_id: target_ref, quantity: item.quantity,
       started_at: now, ends_at: item.vigency_months ? addMonths(now, item.vigency_months) : null,
       origin_transaction_id: transactionId,
       access_rule: item.access_rule,
     }
     existing = SELECT ... WHERE contact_id=? AND brand_id=? AND ref_kind=? AND ref_id=? AND status='active' FOR UPDATE
     result = consolidate(existing, incoming)
     apply result:
       if 'create': INSERT customer_entitlement; emit TE-ENTITLEMENT-GRANTED
       if 'extend_expiration' | 'promote_perpetuous' | 'merge_quantity' | 'reactivate': UPDATE; emit TE-ENTITLEMENT-EXTENDED
       if 'noop': apenas log history
     record entitlement_history(from, to, reason, caused_by_transaction_id)
3. Retornar lista de direitos afetados.
```

## 11. Casos de teste obrigatórios

- `entitlement.grant.new-contact-gets-one-row-per-item`.
- `entitlement.grant.timeline-event-emitted`.
- `entitlement.consolidate.both-perpetuous-is-noop`.
- `entitlement.consolidate.incoming-perpetuous-promotes-existing`.
- `entitlement.consolidate.both-finite-extends-to-max-or-sum` (ver BR para política exata).
- `entitlement.consolidate.existing-revoked-reactivates-with-new-params`.
- `entitlement.revoke.by-transaction-cascades-history`.
- `entitlement.unique-active-per-ref` — tentativa de criar duplicata ativa viola índice.
- `entitlement.origin-transaction-id-immutable`.

## 12. Open Questions

- `OQ-ENT-01` — expiração automática (`active` → `expired`) emite `TE-ENTITLEMENT-REVOKED` ou evento dedicado? Hoje catálogo não tem `TE-ENTITLEMENT-EXPIRED`.
- `OQ-ENT-02` — `quantity` é somada em consolidação? BR-ENTITLEMENT-CONSOLIDATION define; confirmar.
- `OQ-ENT-03` — `ref_id` sem FK física (produto e benefício estão em tabelas distintas). Alternativa: `product_ref_id` e `benefit_ref_id` exclusivos com CHECK. Decidir no Pass 2.
- `OQ-ENT-04` — suspensão manual (`active` → `suspended`) está no escopo da Fase 1? Hoje só admin.
