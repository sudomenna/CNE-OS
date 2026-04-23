# Convenções de schema de banco

Fonte única de convenções Postgres + Drizzle. Todo schema novo deve seguir isto.

## 1. Naming

- **Tabelas:** `snake_case` singular (`contact`, `offer_condition`, `transaction_snapshot`).
- **Colunas:** `snake_case` (`created_at`, `is_active`).
- **Foreign keys:** `<referenced>_id` (`contact_id`, `offer_condition_id`).
- **Índices:** `idx_<tabela>_<colunas>` (`idx_contact_cpf`). Únicos: `uq_<tabela>_<colunas>`.
- **Enums Postgres:** `snake_case` (`contact_status`) — sempre declarados em [`01-enums.md`](./01-enums.md).
- **Constraints:** `ck_<tabela>_<regra>` (`ck_contact_cpf_valid`).

## 2. Chaves primárias

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` em **todas** as tabelas.
- Usar UUID v7 quando possível (ordenado por tempo) via `uuid_generate_v7()` (função custom) ou fallback `gen_random_uuid()`.
- Nunca usar `SERIAL`/`BIGSERIAL` — dificulta multi-tenancy e cópia entre ambientes.

## 3. Timestamps (obrigatórios em toda tabela de domínio)

```sql
created_at timestamptz NOT NULL DEFAULT now(),
updated_at timestamptz NOT NULL DEFAULT now()
```

Trigger padrão `set_updated_at()` atualiza `updated_at` em cada UPDATE. Helper Drizzle em `/lib/db/schema/_helpers.ts`.

## 4. Soft-delete

- Usar `deleted_at timestamptz NULL` quando deleção lógica for necessária.
- **Não** aplicar a tabelas append-only (audit, webhook_log, transaction_snapshot).
- Queries padrão filtram `deleted_at IS NULL`; helper em `/lib/db/soft-delete.ts`.

## 5. Multi-marca

- Toda entidade que **pertence a marca** tem `brand_id UUID NOT NULL REFERENCES brand(id)`.
- RLS policy: ver [`../10-architecture/03-data-layer.md`](../10-architecture/03-data-layer.md). Fase 1: operadores veem todas marcas (policy permissiva); Fase 2 amplia.

## 6. Auditoria

- Ações críticas (ver [`06-audit-trail-spec.md`](./06-audit-trail-spec.md)) geram linha em `audit_log` (append-only).
- Tabela `audit_log` nunca tem UPDATE/DELETE (regra de trigger).
- Mudanças de campo sensível (status de transação, dados do contato, status de entitlement) registradas em `<entidade>_history` append-only.

## 7. jsonb para snapshots

- Snapshots imutáveis em colunas `jsonb`. Nunca `UPDATE` em campo `jsonb` de snapshot.
- Schema do payload documentado no módulo responsável.
- Para queries frequentes em campo interno do jsonb, criar **índice GIN** ou coluna gerada.

## 8. Trilha de histórico para status

Tabelas `<entidade>_status_history` (`conversation_status_history`, `ticket_status_history`, `entitlement_status_history`):

```sql
id UUID PK,
<entidade>_id UUID NOT NULL,
from_status <enum> NULL,
to_status <enum> NOT NULL,
changed_by UUID NULL REFERENCES user_account(id),
reason text NULL,
created_at timestamptz NOT NULL DEFAULT now()
```

Append-only (trigger bloqueia UPDATE/DELETE).

## 9. Enums

- Todo enum em Postgres + espelho TS gerado pelo Drizzle.
- **Adicionar valor:** `ALTER TYPE ... ADD VALUE 'novo'` via migration.
- **Remover:** não remover (causa incidente em prod). Comentar como `deprecated`.

## 10. Timezone

- Sempre `timestamptz`. **Nunca** `timestamp` sem timezone.
- Entrada de usuário: converter para UTC no servidor.

## 11. Strings

- `text` por padrão. `varchar(n)` **só** quando houver limite de negócio (ex.: CPF 11 dígitos).
- Normalização de telefone/e-mail/CPF: sempre no servidor, antes de persistir.

## 12. Dinheiro

- `numeric(12,2)` para valores monetários. **Nunca** `float` ou `real`.
- Moeda implícita: BRL. Se surgir outra, coluna `currency char(3)`.

## 13. Migrations

- Uma migration por mudança lógica, nomeada `NNNN_<descricao-kebab>.sql`.
- Gerar com `drizzle-kit generate`. Revisar antes de commitar.
- **Nunca** editar migration já mergeada. Correção = nova migration.
- `DROP TABLE`/`DROP COLUMN` em prod exige ADR aprovado.

## 14. Relações

- `ON DELETE`:
  - `CASCADE` só para filhos claramente subordinados (ex.: `contact_phone` → `contact`).
  - `RESTRICT` para referências de histórico (ex.: `transaction.contact_id`).
  - `SET NULL` quando referência é acessória.
- `ON UPDATE`: sempre `CASCADE` (mudança de PK é raríssima — vale a pena).

## 15. Checks de integridade

Preferir `CHECK` no DB a validar só na app:

```sql
ALTER TABLE contact
  ADD CONSTRAINT ck_contact_cpf_length CHECK (cpf IS NULL OR char_length(cpf) = 11);
```

## 16. Drizzle — organização

- Um arquivo por agregado em `/lib/db/schema/<agregado>.ts`.
- Exportar tabelas + tipos inferidos (`InferSelectModel`, `InferInsertModel`).
- Relations declaradas em arquivos `_relations/<agregado>.ts` para evitar circularidades.
- Import central em `/lib/db/schema/index.ts`.

## 17. Exemplo padrão (copiar)

```ts
// lib/db/schema/example.ts
import { pgTable, uuid, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const exampleStatusEnum = pgEnum('example_status', ['draft','active','archived']);

export const example = pgTable('example', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  brandId: uuid('brand_id').notNull(),
  name: text('name').notNull(),
  status: exampleStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
```
