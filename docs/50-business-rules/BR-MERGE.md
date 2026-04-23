# BR-MERGE: merge não-destrutivo de contatos com undo

## Enunciado

Ao unificar dois contatos, o sistema **deve** preservar integralmente o histórico de ambos, marcar o contato secundário com `merged_into_id = principal.id` (sem deletá-lo), reapontar todas as FKs relevantes para o principal e registrar o evento em `contact_merge` com snapshots "antes" de ambos os lados. A operação **deve** ser reversível via `contact_merge_undo`, restrita a papéis `admin` e `financial`.

## Motivação

Merges destrutivos corrompem auditoria, comprometem conciliação financeira (transações, entitlements) e impedem reversão após engano humano. Merge não-destrutivo garante que toda operação é reversível dentro da janela de retenção do banco, sem perda de dado.

## Escopo

- Módulos afetados: `MOD-MERGE` (autoridade), `MOD-CONTACT` (expõe `merged_into_id`), todos os módulos com FK para `contact.id` (transação, conversa, ticket, oportunidade, nota, tag, timeline).
- Entidades: `contact`, `contact_merge`, `contact_merge_undo`, `contact_issue` (quando origem).

## Enforcement

- [x] Função de domínio pura (TS signature)
- [x] DB constraint (SQL) — `ck_contact_merge_distinct`, `uq_contact_merge_undo_merge`
- [ ] DB trigger
- [x] Guard em Server Action — `mergeContacts` e `undoMerge`
- [x] Guard em UI — undo aparece apenas para papéis permitidos

## Contrato TS

```ts
export type MergeInput = {
  principalContactId: string;
  secondaryContactId: string;
  reason: string;                // obrigatório
  issueId?: string;              // vincula à pendência resolvendo-a
  actorUserId: string;           // qualquer papel interno pode mergear (Fase 1)
};

export type MergeResult = {
  mergeId: string;
  reassignedTables: Record<string, number>; // { transaction: 3, conversation: 2, ... }
};

export async function mergeContacts(input: MergeInput, tx?: DbTx): Promise<MergeResult>;

export type UndoInput = {
  mergeId: string;
  reason: string;
  actorUserId: string;           // exige papel 'admin' ou 'financial'
};

export async function undoMerge(input: UndoInput, tx?: DbTx): Promise<void>;
```

Tabelas com FK para `contact.id` que são reapontadas no merge (lista autoritativa):

- `contact_phone.contact_id`, `contact_email.contact_id`, `contact_document.contact_id`, `contact_tag.contact_id`, `contact_custom_field.contact_id`, `contact_note.contact_id`, `contact_status_history.contact_id`
- `transaction.contact_id`, `transaction_snapshot.contact_id`
- `customer_entitlement.contact_id`
- `subscription.contact_id`, `installment.contact_id`
- `conversation.contact_id`, `message.contact_id`, `ticket.contact_id`
- `funnel_entry.contact_id`
- `timeline_event.contact_id` **não** é reapontado — a leitura consolida via `merged_into_id` (ver `INV-TIMELINE-07`).

## DDL / constraint SQL

```sql
ALTER TABLE contact_merge
  ADD CONSTRAINT ck_contact_merge_distinct CHECK (principal_contact_id <> secondary_contact_id);

ALTER TABLE contact_merge_undo
  ADD CONSTRAINT uq_contact_merge_undo_merge UNIQUE (merge_id);

-- Principal nunca pode ser um contato já mergeado (guard em Server Action; também validável via trigger):
-- principal.merged_into_id IS NULL
-- secondary.merged_into_id IS NULL (não mergeado ainda)
```

## Tabela de decisão (quando o merge pode rodar)

| # | Principal | Secundário | Mesmo contato? | Papel do ator | Ação |
|---|---|---|---|---|---|
| 1 | vivo, `merged_into_id IS NULL` | vivo, `merged_into_id IS NULL` | não | qualquer interno | executa merge |
| 2 | vivo | já mergeado | não | qualquer | rejeita: `SecondaryAlreadyMergedError` |
| 3 | já mergeado | vivo | não | qualquer | rejeita: `PrincipalAlreadyMergedError` |
| 4 | = secundário | — | sim | qualquer | rejeita: `SameContactError` (CHECK) |
| 5 | vivo | vivo | não | — | undo: só `admin`/`financial`; outros papéis recebem `ForbiddenError` |
| 6 | — | — | — | undo em merge já desfeito | rejeita: violação de `uq_contact_merge_undo_merge` |

## Casos de teste (Given/When/Then)

1. **merge.happy-path**
   Given: C1 (principal) e C2 (secundário), ambos vivos, C2 tem 2 transações e 1 conversa.
   When: `mergeContacts({ principalContactId: C1.id, secondaryContactId: C2.id, reason: 'duplicata', actorUserId: U })`.
   Then: `contact_merge` criado; `C2.merged_into_id = C1.id`; `transaction.contact_id` das 2 transações = `C1.id`; `conversation.contact_id = C1.id`; `reassignedTables = { transaction: 2, conversation: 1, ... }`; `TE-CONTACT-MERGED` emitido no contato C1 e no C2.

2. **merge.snapshots-before-state**
   Given: C1 e C2 com nomes, CPFs, telefones distintos pré-merge.
   When: merge executado.
   Then: `contact_merge.principal_snapshot` e `secondary_snapshot` contêm JSON completo do estado anterior (nome, cpf, `contact_phone[]`, `contact_email[]`, `contact_document[]`, `contact_tag[]`).

3. **merge.resolves-linked-issue**
   Given: `contact_issue` aberta com `kind = 'email_duplicate'` ligando C1↔C2.
   When: merge executado com `issueId` daquela pendência.
   Then: `contact_issue.status = 'resolved'`, `resolved_by_user_id = actorUserId`, `resolution` preenchida; `TE-CONTACT-ISSUE-RESOLVED` emitido; `contact_merge.issue_id` aponta para ela.

4. **merge.rejects-same-contact**
   Given: C1 vivo.
   When: `mergeContacts({ principalContactId: C1.id, secondaryContactId: C1.id, ... })`.
   Then: erro `SameContactError` (antes do DB) ou violação de `ck_contact_merge_distinct` (defesa em profundidade).

5. **merge.rejects-already-merged**
   Given: C2 já tem `merged_into_id = C1.id`.
   When: tentar merge de C3→C2.
   Then: `SecondaryAlreadyMergedError`.

6. **undo.admin-only**
   Given: merge `M1` concluído; `actor` tem papel `commercial`.
   When: `undoMerge({ mergeId: M1.id, ..., actorUserId: actor })`.
   Then: `ForbiddenError` antes de qualquer DML.

7. **undo.restores-fks**
   Given: merge `M1` concluído reapontando 2 transações de C2 para C1.
   When: admin executa `undoMerge({ mergeId: M1.id })`.
   Then: as 2 transações voltam a ter `contact_id = C2.id`; `C2.merged_into_id = NULL`; `contact_merge.undone_at = now()`; `contact_merge_undo` criado; `TE-CONTACT-UNMERGED` emitido nos dois contatos.

8. **undo.once-per-merge**
   Given: `M1` já desfeito.
   When: tentar `undoMerge({ mergeId: M1.id })` de novo.
   Then: violação de `uq_contact_merge_undo_merge` → `AlreadyUndoneError`.

## Rastreabilidade

- Teste esperado: `tests/unit/merge/merge-contacts.*.test.ts`, `tests/integration/merge/merge-reassigns-fks.test.ts`, `tests/integration/merge/undo-merge.test.ts`.
- Referenciada em:
  - `docs/20-domain/03-contact-merge-issues.md`
  - `docs/50-business-rules/BR-IDENTITY.md`
  - `docs/50-business-rules/BR-RBAC.md`
  - `docs/50-business-rules/BR-TIMELINE.md`
  - `docs/60-flows/FLOW-MERGE-MANUAL.md`, `FLOW-MERGE-UNDO.md`

## Open Questions

- `OQ-MERGE-01` — lista de tabelas reapontadas cresce a cada novo módulo; manter como constante em `lib/domain/merge/reassign-targets.ts` (derivada por reflexão do schema Drizzle) ou declarar manualmente?
- `OQ-MERGE-02` — merge deve consolidar `contact_tag` automaticamente (dedup por `tag`) ou preservar duplicatas até revisão manual?
- `OQ-MERGE-03` — undo tem janela limitada (ex.: 30 dias) ou é permanentemente possível enquanto o merge existir?
