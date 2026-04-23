# BR-TIMELINE: emissão e imutabilidade de eventos de timeline

## Enunciado

Toda mudança de estado relevante ao contato **deve** gerar exatamente um `timeline_event` emitido pelo módulo dono do evento (coluna `source`), dentro da mesma transação SQL do efeito que o motivou, com `kind` pertencente ao catálogo `30-contracts/03-timeline-event-catalog.md`, `payload` validado pelo schema registrado, e contendo `actor_user_id` **ou** `actor_system`. `timeline_event` é **append-only**: `UPDATE` e `DELETE` são proibidos por trigger Postgres.

## Motivação

Timeline é a fonte única de leitura da jornada do contato. Se qualquer módulo pudesse emitir eventos alheios, reescrever eventos existentes ou apagá-los, perderíamos a confiabilidade de relatórios, a reconstrução do histórico e a base de automação. Append-only + ownership por `source` preservam rastreabilidade e previnem regressões silenciosas.

## Escopo

- Módulos afetados: **todos** que tocam estado do contato (`MOD-CONTACT`, `MOD-MERGE`, `MOD-INBOX`, `MOD-TICKET`, `MOD-FUNNEL`, `MOD-TRANSACTION`, `MOD-REFUND`, `MOD-ENTITLEMENT`, `MOD-BILLING`, `MOD-CAMPAIGN`, `MOD-INTEGRATION`, `MOD-AUTOMATION`).
- Entidades: `timeline_event`.

## Enforcement

- [x] Função de domínio pura (TS signature) — `emitTimelineEvent` é o **único** ponto de escrita
- [x] DB constraint (SQL) — `ck_timeline_actor_present`, `ck_timeline_kind_snake`
- [x] DB trigger — append-only (bloqueia UPDATE/DELETE)
- [x] Guard em Server Action — validação zod por `kind`
- [ ] Guard em UI

## Contrato TS

```ts
import type { DbTx } from '@/lib/db/client';

export type TimelineEventKind = /* union literal gerado do enum `timeline_event_kind` */;
export type ModuleSource =
  | 'MOD-CONTACT' | 'MOD-MERGE' | 'MOD-INBOX' | 'MOD-TICKET'
  | 'MOD-FUNNEL'  | 'MOD-CAMPAIGN' | 'MOD-TRANSACTION' | 'MOD-REFUND'
  | 'MOD-ENTITLEMENT' | 'MOD-BILLING' | 'MOD-INTEGRATION' | 'MOD-AUTOMATION';

export type TimelineEventInput = {
  contactId: string;
  brandId?: string | null;
  kind: TimelineEventKind;
  source: ModuleSource;
  actorUserId?: string | null;    // XOR com actorSystem
  actorSystem?: string | null;
  subjectKind?: string | null;
  subjectId?: string | null;
  payload: Record<string, unknown>;
  occurredAt?: Date;              // default = now()
};

export async function emitTimelineEvent(
  input: TimelineEventInput,
  tx?: DbTx,
): Promise<TimelineEvent>;
```

Regras do contrato:

1. **Ownership por `source`.** Cada `kind` tem um `source` esperado declarado no catálogo; o runtime rejeita com `WrongEmitterError` se não bate.
2. **Atomicidade.** Quando `tx` é passado, o evento participa da transação externa: rollback do efeito implica rollback do evento.
3. **Ator obrigatório.** Se `actorUserId` e `actorSystem` ambos ausentes, falha antes do DB (zod) e também pelo CHECK.
4. **Payload tipado.** Cada `kind` tem um zod schema em `lib/timeline/schemas/<kind>.ts`; shape diferente = erro explícito.
5. **`occurredAt` não-futuro.** `occurredAt <= new Date()`; validado no código.

## DDL / constraint SQL

```sql
-- Declarada em MOD-TIMELINE (arquivo 20-domain/04-timeline.md).
ALTER TABLE timeline_event
  ADD CONSTRAINT ck_timeline_actor_present
    CHECK (actor_user_id IS NOT NULL OR actor_system IS NOT NULL),
  ADD CONSTRAINT ck_timeline_kind_snake
    CHECK (kind ~ '^[a-z][a-z0-9_]*$');

CREATE OR REPLACE FUNCTION timeline_event_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'timeline_event is append-only: % not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_timeline_event_no_update
  BEFORE UPDATE ON timeline_event FOR EACH ROW EXECUTE FUNCTION timeline_event_append_only();

CREATE TRIGGER trg_timeline_event_no_delete
  BEFORE DELETE ON timeline_event FOR EACH ROW EXECUTE FUNCTION timeline_event_append_only();
```

## Tabela de decisão (emissão)

| Situação | Quem emite | Comportamento |
|---|---|---|
| Efeito de domínio ocorre dentro de Server Action | módulo autor da action | chama `emitTimelineEvent(..., tx)` na **mesma** transação |
| Webhook externo mapeado para efeito interno | módulo destino | emissão ocorre após o `UPDATE/INSERT` canônico; mesma transação |
| Automação dispara ação que altera contato | `MOD-AUTOMATION` para o evento de execução + módulo alvo para o efeito | dois eventos distintos (`TE-AUTOMATION-EXECUTED` + `TE-*` do efeito) |
| Merge de contatos | `MOD-MERGE` | `TE-CONTACT-MERGED` emitido **para ambos** `contact_id` (principal e secundário) |
| Leitura de timeline de contato mergeado | — | consolidação na leitura via `contact.merged_into_id` (não há UPDATE no evento) |

## Casos de teste (Given/When/Then)

1. **emit.happy-path**
   Given: contato C1, Server Action de MOD-CONTACT atualizando `full_name`.
   When: `emitTimelineEvent({ contactId: C1.id, kind: 'contact_updated', source: 'MOD-CONTACT', actorUserId: U, payload: { field: 'full_name', from: 'A', to: 'B' } }, tx)`.
   Then: 1 linha em `timeline_event`; `occurred_at ≈ now()`; `payload` bate com schema.

2. **emit.rejects-unknown-kind**
   Given: mesmo contexto.
   When: `kind: 'contato_renomeou_de_novo'` (não existe no enum).
   Then: erro zod `UnknownTimelineKindError` **antes** do DB; nenhum INSERT.

3. **emit.rejects-wrong-source**
   Given: `kind: 'sale_approved'` (emissor esperado: `MOD-TRANSACTION`).
   When: chamada feita por `source: 'MOD-INBOX'`.
   Then: `WrongEmitterError`.

4. **emit.rejects-missing-actor**
   Given: payload válido, mas `actorUserId` e `actorSystem` ambos `null`.
   When: emitir.
   Then: erro zod; se bypass, CHECK `ck_timeline_actor_present` rejeita.

5. **emit.payload-schema-mismatch**
   Given: `kind: 'contact_tag_added'` (exige `{ tag: string, source: ... }`).
   When: `payload = { foo: 'bar' }`.
   Then: erro zod, nenhum INSERT.

6. **append-only.update-blocked**
   Given: evento existente.
   When: `UPDATE timeline_event SET payload = '{}' WHERE id = ...`.
   Then: exceção `timeline_event is append-only: UPDATE not allowed`.

7. **append-only.delete-blocked**
   Given: evento existente.
   When: `DELETE FROM timeline_event WHERE id = ...`.
   Then: exceção `timeline_event is append-only: DELETE not allowed`.

8. **atomicity.rollback-propagates**
   Given: Server Action começa `tx`, faz `UPDATE contact`, chama `emitTimelineEvent(..., tx)`, depois dá `ROLLBACK`.
   When: transação revertida.
   Then: nem o UPDATE nem o INSERT em `timeline_event` permanecem.

9. **read.consolidates-merged**
   Given: C2 mergeado em C1; eventos emitidos para C2 antes do merge.
   When: `listTimelineEvents(C1.id)`.
   Then: retorna eventos cujo `contact_id IN (C1.id, C2.id)` ordenados por `occurred_at DESC`.

## Rastreabilidade

- Teste esperado: `tests/unit/timeline/emit.*.test.ts`, `tests/integration/timeline/append-only.test.ts`, `tests/integration/timeline/read-consolidates-merged.test.ts`.
- Referenciada em:
  - `docs/20-domain/04-timeline.md`
  - `docs/20-domain/02-contact-identity.md`
  - `docs/20-domain/03-contact-merge-issues.md`
  - `docs/30-contracts/03-timeline-event-catalog.md`
  - `docs/50-business-rules/BR-MERGE.md`, `BR-IDENTITY.md`, `BR-SNAPSHOT-IMMUTABILITY.md`

## Open Questions

- `OQ-TIMELINE-BR-01` — falha de emissão (ex.: schema quebrado por bug) deve derrubar a transação de domínio ou degradar para DLQ? Proposta: derrubar — evento faltante é bug crítico.
- `OQ-TIMELINE-BR-02` — correção de evento historicamente errado (bug que emitiu `payload` inválido) — como corrigir sem UPDATE? Proposta: emitir evento corretivo `TE-INTEGRATION-EVENT` com `payload.correction_of` apontando o `id` original.
- `OQ-TIMELINE-BR-03` — eventos em alto volume (`TE-CAMPAIGN-CLICK`) precisam de agregação ou TTL distinto (ver `OQ-TE-02` no catálogo).
