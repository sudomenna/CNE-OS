# Timeline unificada (Módulo MOD-TIMELINE)

## 1. Finalidade

Agregado **fino e transversal** cuja única responsabilidade é persistir e servir o stream **append-only** de eventos da jornada do contato. Todo módulo que altera estado relevante ao contato emite `TE-*` via a função pública `emitTimelineEvent()` dentro da mesma transação SQL do efeito. Este módulo não detém regra de negócio de outros agregados — apenas o contrato de escrita e a invariância de imutabilidade. O catálogo canônico de `kind` vive em [`30-contracts/03-timeline-event-catalog.md`](../30-contracts/03-timeline-event-catalog.md).

## 2. Ownership (paralelização)

- Arquivos que POSSUI (edita):
  - `lib/db/schema/timeline.ts` (tabela `timeline_event` + trigger append-only)
  - `lib/db/schema/_relations/timeline.ts`
  - `lib/timeline/emit.ts` — função pura `emitTimelineEvent()`
  - `lib/timeline/read.ts` — queries de leitura paginadas
  - `app/(app)/contacts/[id]/timeline/` — UI de leitura (filtros)
  - `tests/unit/timeline/**`, `tests/integration/timeline/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/03-timeline-event-catalog.md` — catálogo autoritativo de `TE-*`
  - `docs/30-contracts/01-enums.md` — `timeline_event_kind` (lista de valores permitidos)
  - `docs/50-business-rules/BR-TIMELINE.md`
- Interfaces públicas expostas:
  - `emitTimelineEvent(input: TimelineEventInput, tx?: DbTx): Promise<TimelineEvent>` — **único ponto** de escrita. Consumida por MOD-CONTACT, MOD-MERGE, MOD-INBOX, MOD-TICKET, MOD-FUNNEL, MOD-TRANSACTION, MOD-REFUND, MOD-ENTITLEMENT, MOD-BILLING, MOD-CAMPAIGN, MOD-INTEGRATION, MOD-AUTOMATION.
  - `listTimelineEvents(contactId, filters): TimelineEventPage` — leitura com filtros por `brand`, `kind`, canal, período.

## 3. Entidades e campos

### 3.1 `timeline_event`

| Campo | Tipo | Null | Default | Constraint |
|---|---|---|---|---|
| `id` | uuid | não | `gen_random_uuid()` | PK |
| `contact_id` | uuid | não | — | FK `contact(id) ON DELETE RESTRICT` — **Sprint 0: sem FK** (contact criado em Sprint 1, T-1-xx) |
| `brand_id` | uuid | sim | — | FK `brand(id) ON DELETE SET NULL` |
| `kind` | text | não | — | valor do enum `timeline_event_kind`; CHECK valida prefixação `snake_case` |
| `source` | text | não | — | módulo emissor: `'MOD-CONTACT'`, `'MOD-MERGE'`, etc. |
| `actor_user_id` | uuid | sim | — | FK `user_account(id) ON DELETE SET NULL` |
| `actor_system` | text | sim | — | ex.: `'digital_guru'`, `'automation'` |
| `subject_kind` | text | sim | — | `'transaction'`, `'conversation'`, `'ticket'`, `'issue'` |
| `subject_id` | uuid | sim | — | referência polimórfica sem FK |
| `payload` | jsonb | não | `'{}'` | schema por `kind` — ver catálogo |
| `occurred_at` | timestamptz | não | `now()` | instante real do efeito |
| `created_at` | timestamptz | não | `now()` | instante do INSERT |

### 3.2 DDL

```sql
CREATE TABLE timeline_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK para contact será adicionada em Sprint 1 (T-1-xx) — contact table não existe em Sprint 0
  contact_id uuid NOT NULL,  -- sem REFERENCES contact(id) por ora
  brand_id uuid REFERENCES brand(id) ON DELETE SET NULL,
  kind text NOT NULL,
  source text NOT NULL,
  actor_user_id uuid REFERENCES user_account(id) ON DELETE SET NULL,
  actor_system text,
  subject_kind text,
  subject_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_timeline_actor_present CHECK (actor_user_id IS NOT NULL OR actor_system IS NOT NULL),
  CONSTRAINT ck_timeline_kind_snake CHECK (kind ~ '^[a-z][a-z0-9_]*$')
);
CREATE INDEX idx_timeline_contact_time ON timeline_event (contact_id, occurred_at DESC);
CREATE INDEX idx_timeline_brand ON timeline_event (brand_id);
CREATE INDEX idx_timeline_kind ON timeline_event (kind);
CREATE INDEX idx_timeline_subject ON timeline_event (subject_kind, subject_id);
CREATE INDEX idx_timeline_payload_gin ON timeline_event USING GIN (payload);

-- Append-only: bloqueia UPDATE e DELETE
CREATE OR REPLACE FUNCTION timeline_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'timeline_event is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_timeline_event_no_update
  BEFORE UPDATE ON timeline_event
  FOR EACH ROW EXECUTE FUNCTION timeline_event_append_only();

CREATE TRIGGER trg_timeline_event_no_delete
  BEFORE DELETE ON timeline_event
  FOR EACH ROW EXECUTE FUNCTION timeline_event_append_only();
```

### 3.3 Contrato TS (emit)

```ts
export type TimelineEventInput = {
  contactId: string;
  brandId?: string | null;
  kind: TimelineEventKind;          // union literal gerada do enum
  source: ModuleSource;             // 'MOD-CONTACT' | 'MOD-MERGE' | ...
  actorUserId?: string | null;
  actorSystem?: string | null;      // XOR com actorUserId
  subjectKind?: string | null;
  subjectId?: string | null;
  payload: Record<string, unknown>; // validado por zod schema por `kind`
  occurredAt?: Date;
};

export async function emitTimelineEvent(
  input: TimelineEventInput,
  tx?: DbTx,
): Promise<TimelineEvent>;
```

Regras do contrato: (a) `actorUserId` XOR `actorSystem` obrigatório; (b) `kind` ∈ enum `timeline_event_kind`; (c) `payload` validado por schema zod correspondente em `lib/timeline/schemas/<kind>.ts`; (d) chamada feita **dentro** da mesma transação do efeito — se não vier `tx`, a função abre uma própria apenas para o insert, mas callers críticos (venda, merge) passam `tx`.

## 4. Relações (ASCII)

```
contact 1──* timeline_event *──0..1 brand
                │
                ├── emitido-por ──> user_account (actor_user_id)
                └── emitido-por ──> actor_system (string)
```

Referência polimórfica opcional `(subject_kind, subject_id)` não tem FK para evitar acoplamento.

## 5. Invariantes

- `INV-TIMELINE-01`: `timeline_event` nunca sofre `UPDATE` ou `DELETE` (trigger).
- `INV-TIMELINE-02`: exatamente um de `actor_user_id` OU `actor_system` está presente (CHECK).
- `INV-TIMELINE-03`: `kind` respeita padrão `snake_case` e pertence à lista declarada no catálogo (validação em `emitTimelineEvent` + CHECK de formato).
- `INV-TIMELINE-04`: o payload de cada `kind` passa pelo zod schema registrado; falha = rejeita o insert antes do DB.
- `INV-TIMELINE-05`: emissão é feita exclusivamente pelo módulo **dono** do evento (coluna `source`). Convencional — ver §6 de `BR-TIMELINE`.
- `INV-TIMELINE-06`: `occurred_at <= now()` no momento da escrita (não se emite evento no futuro).
- `INV-TIMELINE-07`: merge reaponta `contact_id` via leitura, não via UPDATE — eventos históricos do secundário continuam apontando para o id original; a consolidação da timeline do principal é feita na leitura via `contact.merged_into_id`.

## 6. Estados e transições

Tabela sem state machine (append-only). Existe apenas o evento "criado".

## 7. Regras de negócio referenciadas

- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md) — contrato de emissão, ownership por `source`.
- [`BR-MERGE`](../50-business-rules/BR-MERGE.md) — leitura consolidada pós-merge.
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md) — timeline complementa auditoria mas **não a substitui**.

## 8. Eventos de timeline emitidos

Nenhum de autoria própria. Este módulo é o **receptor**: o catálogo autoritativo de `TE-*` vive em [`30-contracts/03-timeline-event-catalog.md`](../30-contracts/03-timeline-event-catalog.md) e cada `source` é um módulo distinto.

## 9. Fluxos relacionados

- `FLOW-INGEST-CHECKOUT` — venda aprovada emite `TE-SALE-APPROVED` via `emitTimelineEvent` dentro da transação do snapshot.
- `FLOW-MERGE-MANUAL` — MOD-MERGE emite `TE-CONTACT-MERGED`.
- `FLOW-INBOX-INBOUND` — MOD-INBOX emite `TE-MESSAGE-INBOUND`.
- Todos os demais fluxos que tocam contato obrigatoriamente passam por `emitTimelineEvent`.

## 10. Casos de teste obrigatórios

- `timeline.insert.happy` — `emitTimelineEvent` persiste evento com payload validado e retorna `TimelineEvent`.
- `timeline.insert.rejects-unknown-kind` — `kind` fora do enum é recusado no zod antes de tocar o DB.
- `timeline.insert.rejects-invalid-payload` — payload não bate com schema zod do `kind` → erro explícito, nenhum insert.
- `timeline.insert.requires-actor` — sem `actorUserId` e sem `actorSystem` o CHECK barra.
- `timeline.update.blocked` — `UPDATE timeline_event SET ...` dispara exceção pelo trigger.
- `timeline.delete.blocked` — `DELETE FROM timeline_event` é recusado.
- `timeline.read.by-contact.ordered` — `listTimelineEvents` retorna ordenado por `occurred_at DESC`.
- `timeline.read.merged-contact.consolidates` — leitura do principal inclui eventos cujo `contact_id` é o do secundário mergeado (via `merged_into_id`).
- `timeline.transactional.rollback-propagates` — se a transação externa der rollback, o evento não persiste (atomicidade).

## 11. Open Questions

- `OQ-TIMELINE-01` — evento precisa de `tenant_id`/`brand_id` obrigatório para RLS mais restrito? Hoje `brand_id` é opcional.
- `OQ-TIMELINE-02` — pagination por `occurred_at` pode ter empate em alta frequência — usar `(occurred_at, id)` como keyset?
- `OQ-TIMELINE-03` — definir política de retenção / arquivamento frio de eventos muito antigos (ex.: > 5 anos).
