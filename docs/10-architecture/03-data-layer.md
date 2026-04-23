# 03 — Data layer

Drizzle, migrations, RLS, audit tables, soft-delete e jsonb snapshots. Complementa [`30-contracts/02-db-schema-conventions.md`](../30-contracts/02-db-schema-conventions.md) (convenções fixas) e [ADR-05](../90-meta/04-decision-log.md).

Para estratégia de rollback de banco, down migrations, PITR e Supabase Branching, ver [`11-migration-rollback.md`](./11-migration-rollback.md).

---

## 1. Drizzle — organização

```
/lib/db
  client.ts                    # singleton + tipo DbTx
  schema/
    _helpers.ts                # set_updated_at, withoutDeleted, commonColumns
    _relations/                # relations de cada agregado (anti-circular)
    index.ts                   # export barril
    organization.ts
    contact.ts
    contact_merge.ts
    timeline_event.ts          # append-only
    conversation.ts
    message.ts
    ticket.ts
    campaign.ts
    creative.ts
    funnel.ts
    catalog.ts
    offer.ts
    offer_condition.ts
    transaction.ts
    transaction_snapshot.ts    # append-only, jsonb
    entitlement.ts
    subscription.ts
    installment.ts
    refund.ts
    automation.ts
    webhook_log.ts             # append-only (payload)
    audit_log.ts               # append-only (trigger)
    role.ts
    permission.ts
    user_account.ts
    user_role.ts
  migrations/
    0001_init.sql
    0002_contact.sql
    ...
  soft-delete.ts
```

Regras:

1. **Um arquivo por agregado.** Escrita exclusiva do módulo dono.
2. **Export central** em `schema/index.ts` (barril) — único import nos consumidores: `import * as s from '@/lib/db/schema'`.
3. **Relations** em `_relations/<agregado>.ts` separadas para evitar ciclos de import.
4. **Helpers comuns** em `_helpers.ts`:

```ts
// lib/db/schema/_helpers.ts
import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const commonColumns = {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const softDeleteColumn = {
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
};
```

5. **Cliente Drizzle** (`client.ts`):

```ts
// lib/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!, { max: 10, idle_timeout: 20 });
export const db = drizzle(client, { schema, logger: process.env.NODE_ENV !== 'production' });

export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
```

`DbTx` é o tipo aceito por toda função de domínio que muta estado.

---

## 2. Migrations

Convenções (ver também [`30-contracts/02-db-schema-conventions.md §13`](../30-contracts/02-db-schema-conventions.md)):

- Naming: `NNNN_<kebab-case>.sql` (ex.: `0042_add-contact-consent.sql`). Zero-padded 4 dígitos.
- Geradas por `pnpm db:generate` a partir de mudanças em `schema/*.ts`.
- **Revisão obrigatória** do SQL gerado antes de commitar. Drizzle pode gerar DDL subótimo; editar quando necessário.
- **Proibido editar** migration já mergeada em `main`. Correção = nova migration.
- `DROP TABLE`, `DROP COLUMN`, `ALTER TYPE ... DROP VALUE` exigem ADR aprovado ([BR-DDL](../50-business-rules/README.md) futura).

Fluxo:

```bash
# 1. Editar schema em lib/db/schema/<agregado>.ts
# 2. Gerar migration
pnpm db:generate

# 3. Revisar SQL gerado em lib/db/migrations/
# 4. Aplicar em dev
pnpm db:migrate

# 5. Commit do schema + migration juntos
```

Ambiente de produção: migrations rodam via pipeline Supabase antes de promover o deploy Vercel.

---

## 3. RLS (Row-Level Security)

### 3.1. Fase 1 — policy permissiva com auth obrigatório

Toda tabela tem RLS **habilitada**, com policy simples: acesso exige sessão autenticada, sem filtro de marca.

```sql
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;

CREATE POLICY contact_auth_all ON contact
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
```

Acesso via `service_role_key` (somente back-end, Inngest workers e scripts de migração) bypassa RLS como esperado.

Motivação: operadores veem todas as marcas na Fase 1 ([BR-RBAC §6](../50-business-rules/BR-RBAC.md)). RBAC por ação fica em Server Actions, não em RLS.

### 3.2. Fase 2 — escopo por marca via claim

Infraestrutura preparada desde já:

1. Ao autenticar, sessão recebe claim JWT `brand_scope: string[]` (lista de `brand_id` visíveis).
2. Helper SQL:

```sql
CREATE OR REPLACE FUNCTION auth.current_brand_scope() RETURNS uuid[] AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::jsonb->'brand_scope')::text[],
    ARRAY[]::uuid[]
  )::uuid[];
$$ LANGUAGE sql STABLE;
```

3. Quando migrar para Fase 2, policy vira:

```sql
CREATE POLICY contact_brand_scope ON contact
  FOR ALL TO authenticated
  USING (brand_id = ANY (auth.current_brand_scope()))
  WITH CHECK (brand_id = ANY (auth.current_brand_scope()));
```

Usuários `admin` recebem claim com todas as marcas.

### 3.3. Testes de RLS

Integration test por tabela com `brand_id`: query com sessão de marca A não retorna linha de marca B (quando policy escopo ativa).

---

## 4. Audit tables (append-only)

Lista canônica de tabelas **append-only** — UPDATE e DELETE bloqueados por trigger:

| Tabela | Escopo |
|---|---|
| `audit_log` | Log de ações administrativas |
| `timeline_event` | Jornada do contato |
| `transaction_snapshot` | Foto imutável da venda |
| `webhook_log` | Recebimento de webhook (payload imutável; status muda) |
| `conversation_status_history` | Mudanças de status de conversa |
| `ticket_status_history` | Mudanças de status de ticket |
| `entitlement_status_history` | Mudanças de status de entitlement |
| `transaction_status_history` | Mudanças de status de transação |
| `contact_status_history` | Mudanças de status de contato |
| `offer_status_history` | Mudanças de status de oferta |
| `offer_condition_status_history` | Mudanças de status de condição |
| `subscription_status_history` | Mudanças de status de assinatura |
| `refund_status_history` | Mudanças de status de pedido de reembolso |
| `automation_execution_log` | Execuções de automação |

### 4.1. Trigger genérico

Declarado uma vez em `0001_init.sql`, reutilizado:

```sql
CREATE OR REPLACE FUNCTION prevent_update_delete()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (op=%)', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;
```

Aplicação por tabela:

```sql
CREATE TRIGGER t_timeline_event_append_only
  BEFORE UPDATE OR DELETE ON timeline_event
  FOR EACH ROW EXECUTE FUNCTION prevent_update_delete();
```

**Exceção:** `webhook_log` permite UPDATE em colunas operacionais (`status`, `attempts`, `last_error`, `processed_at`, `dead_lettered_at`). Variante:

```sql
CREATE OR REPLACE FUNCTION webhook_log_guard()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'webhook_log delete forbidden';
  END IF;
  -- payload imutável
  IF NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'webhook_log.payload is immutable';
  END IF;
  IF NEW.external_event_id <> OLD.external_event_id
     OR NEW.provider <> OLD.provider THEN
    RAISE EXCEPTION 'webhook_log identity columns are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 4.2. Escrita em `audit_log`

Sempre via helper `audit(tx, entry)` ([`30-contracts/06-audit-trail-spec.md §4`](../30-contracts/06-audit-trail-spec.md)). Nunca `INSERT` direto.

### 4.3. Escrita em `timeline_event`

Sempre via `emitTimelineEvent(tx, input)` ([`30-contracts/07-module-interfaces.md#MOD-TIMELINE`](../30-contracts/07-module-interfaces.md)). Nunca `INSERT` direto.

---

## 5. jsonb — convenção de versionamento

Snapshots e payloads ricos usam `jsonb` com chave `_v` no topo:

```jsonc
// transaction_snapshot.payload
{
  "_v": 1,
  "offer": { "id": "...", "name": "..." },
  "condition": { "id": "...", "price_cents": 49700 },
  "contact": { "id": "...", "cpf": "..." },
  "legal_entity": { "id": "...", "cnpj": "..." },
  "benefits": [ { "id": "...", "auto_tag": "..." } ]
}
```

Regras:

1. **Nunca alterar o shape do `_v=1`.** Alterações = `_v=2` em novas linhas.
2. **Migração forward-only:** para expor campo novo em todas as versões antigas, criar **view** com `jsonb_build_object` ou **generated column**.
3. **Index GIN** em campos consultados com frequência:

```sql
CREATE INDEX idx_snapshot_payload_cpf
  ON transaction_snapshot USING GIN ((payload -> 'contact' -> 'cpf'));
```

4. **Generated column** para chaves de negócio críticas em queries:

```sql
ALTER TABLE transaction_snapshot
  ADD COLUMN offer_id uuid GENERATED ALWAYS AS ((payload->'offer'->>'id')::uuid) STORED;
```

---

## 6. Soft-delete

Tabelas operacionais (não append-only) podem ter `deleted_at timestamptz NULL`. Helper em `/lib/db/soft-delete.ts`:

```ts
import { isNull, and, type SQL } from 'drizzle-orm';

export function withoutDeleted<T extends { deletedAt: unknown }>(
  table: T,
  extraCondition?: SQL,
): SQL {
  const base = isNull((table as any).deletedAt);
  return extraCondition ? and(base, extraCondition)! : base;
}
```

Uso:

```ts
await db.select().from(s.contact).where(withoutDeleted(s.contact, eq(s.contact.id, id)));
```

**Nunca** usar em tabelas append-only (não têm `deleted_at`).

---

## 7. Transações — padrão obrigatório

Toda mutação que emite timeline + audit **corre em uma única transação**:

```ts
await db.transaction(async (tx) => {
  const updated = await updateSomething(tx, input);

  await emitTimelineEvent(tx, {
    contactId: updated.contactId,
    kind: 'something_changed',
    source: 'MOD-X',
    actorUserId: ctx.user.id,
    payload: {},
  });

  await audit(tx, {
    actorUserId: ctx.user.id,
    actionKind: 'update',
    resourceKind: 'x',
    resourceId: updated.id,
    before, after,
    context: { correlationId: ctx.correlationId },
  });

  return updated;
});
```

Regras:

1. Funções de domínio recebem `tx: DbTx` quando mutam.
2. Funções puras (`consolidateEntitlement`, `generateUtm`) não recebem `tx`.
3. Rollback é atômico: efeito + timeline + audit revertem juntos.
4. **Não** chamar `revalidatePath` dentro da transação.
5. **Não** chamar serviço externo (HTTP) dentro de transação — move-se para Inngest `step.run` pós-commit.

---

## 8. Backups e recuperação

| Mecanismo | Frequência | Retenção |
|---|---|---|
| Supabase PITR | Contínuo (WAL) | 7 dias (Pro) ou 14 dias (Team+) |
| Dump lógico semanal | Domingo 03:00 UTC | 12 semanas |
| Export para bucket cold (Supabase Storage) | Semanal | 2 anos |

Export semanal implementado via Inngest cron que invoca `pg_dump` (função edge Supabase) e grava em bucket privado `backups-cold`. Acesso restrito a `admin` + service role.

RPO/RTO detalhados em [`08-nfr.md`](./08-nfr.md).

---

## 9. Teste de schema

Teste integration por agregado:

1. Subir DB efêmero (Supabase branch ou docker pg).
2. Aplicar todas as migrations.
3. Rodar asserções:
   - Trigger `prevent_update_delete` existe nas tabelas append-only.
   - UPDATE em `audit_log` falha com mensagem esperada.
   - INSERT válido passa.
   - Constraints de CHECK (CPF length, valor > 0) falham com input inválido.

Fixtures em `tests/fixtures/db/`.

---

## 10. Open Questions

- `OQ-DATA-01`: `noUncheckedIndexedAccess` + `postgres-js` retornando arrays — ajustar helpers de select?
- `OQ-DATA-02`: dedicar schema Postgres separado para tabelas append-only (`audit.`, `history.`) por higiene?
- `OQ-DATA-03`: quando migrar para `pg_partman` em `audit_log` — volume de 5M linhas? 10M?
