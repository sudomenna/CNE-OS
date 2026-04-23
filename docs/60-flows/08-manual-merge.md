# FLOW-08: Merge manual de contatos

## Gatilho / pré-condições

Operador identifica dois `contact` que representam a mesma pessoa (origem: busca manual, pendência `email_duplicate`/`phone_conflict`, relatório de duplicatas). Invoca via UI de contatos ou via [`FLOW-09`](./09-identity-pending-resolution.md).

Pré-condições:
- ambos contatos vivos (`merged_into_id IS NULL`, `deleted_at IS NULL`);
- `principal.id <> secondary.id`;
- operador com papel interno qualquer (Fase 1 todos podem mergear); undo exige `admin`/`financial` — [`BR-RBAC`](../50-business-rules/BR-RBAC.md).

## Atores

- humano: operador (merge); admin/financial (undo).
- sistema: `MOD-MERGE` (`mergeContacts`, `undoMerge`); demais módulos reapontados.
- integração: não participa.

## Passos

### Merge

1. Operador abre tela "Mergear contatos", seleciona `principal` e `secondary`.
2. UI exibe **diff** lado-a-lado: nome, CPF, telefones, e-mails, documentos, tags, transações, direitos, conversas, tickets. Operador decide qual é o principal.
3. Operador preenche `reason` (obrigatório) e opcionalmente vincula `contact_issue.id` a ser resolvida.
4. Confirmação com dupla verificação (checkbox "entendo que esta operação reaponta 15+ tabelas").
5. Server Action `mergeContacts(input)` — [`BR-MERGE`](../50-business-rules/BR-MERGE.md):
   1. Guard — `can(user, 'contact.merge')`.
   2. Abre transação SQL `SERIALIZABLE`.
   3. `SELECT FOR UPDATE` ambos contatos; valida tabela de decisão (casos 2, 3, 4 rejeitam).
   4. **Capturar snapshot "antes"** — serializar estado completo de `principal` e `secondary` (campos escalares + `contact_phone[]`, `contact_email[]`, `contact_document[]`, `contact_tag[]`) em JSON.
   5. INSERT `contact_merge(principal_contact_id, secondary_contact_id, reason, principal_snapshot, secondary_snapshot, issue_id?, actor_user_id)`.
   6. **Reapontar FKs** nas tabelas listadas em `BR-MERGE §contrato` (`contact_phone`, `contact_email`, `contact_document`, `contact_tag`, `contact_custom_field`, `contact_note`, `contact_status_history`, `transaction`, `transaction_snapshot`, `customer_entitlement`, `subscription`, `installment`, `conversation`, `message`, `ticket`, `funnel_entry`): `UPDATE ... SET contact_id = principal.id WHERE contact_id = secondary.id`. Contar linhas por tabela para `reassignedTables`.
   7. **NÃO reapontar `timeline_event.contact_id`** — consolidação ocorre na leitura via `contact.merged_into_id` (`INV-TIMELINE-07`).
   8. `UPDATE contact SET merged_into_id = principal.id WHERE id = secondary.id`.
   9. Se `issueId` fornecido ⇒ `UPDATE contact_issue SET status='resolved', resolved_by_user_id, resolved_at=now(), resolution='merge' WHERE id=$issueId`; `TE-CONTACT-ISSUE-RESOLVED`.
   10. Emitir `TE-CONTACT-MERGED` **para ambos** `contact_id` (principal e secundário), payload `{ merged_into, merged_from, reason }`.
   11. Commit.
   12. Retorna `{ mergeId, reassignedTables }`.

### Undo

1. Admin/financial abre registro de merge em `/contacts/merges/:id`.
2. Server Action `undoMerge({ mergeId, reason, actorUserId })`:
   1. Guard — `can(user, 'contact.unmerge')` + 2FA.
   2. Transação SQL.
   3. Lê `contact_merge`; rejeita se `undone_at IS NOT NULL` ou se `contact_merge_undo` já existe (`uq_contact_merge_undo_merge`).
   4. Para cada tabela da lista, `UPDATE ... SET contact_id = secondary.id WHERE contact_id = principal.id AND <id da linha estava no snapshot secundário>` — a comparação usa `secondary_snapshot.<tabela>[].id` capturado no merge.
   5. `UPDATE contact SET merged_into_id=NULL WHERE id = secondary.id`.
   6. INSERT `contact_merge_undo(merge_id, reason, actor_user_id)`.
   7. `UPDATE contact_merge SET undone_at=now(), undone_by_user_id=actor`.
   8. Emitir `TE-CONTACT-UNMERGED` em ambos contatos.

## Pós-condições

### Após merge

- `secondary.merged_into_id = principal.id`.
- Nenhuma FK (exceto `timeline_event.contact_id`) aponta para `secondary` nos domínios reapontados.
- `contact_merge` tem snapshots completos do antes.
- Eventos emitidos; `contact_issue` resolvida (se houver).

### Após undo

- `secondary.merged_into_id = NULL`.
- FKs restauradas aos estados pré-merge.
- `contact_merge_undo` existe com referência ao merge.
- `TE-CONTACT-UNMERGED` em ambos.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `SameContactError` (principal = secondary) | rejeitar antes do DB + CHECK | — |
| E-02 | `SecondaryAlreadyMergedError` | rejeitar | escolher outro secondary |
| E-03 | `PrincipalAlreadyMergedError` | rejeitar | escolher outro principal |
| E-04 | `ForbiddenError` (undo sem papel admin/financial) | 403 | escalar |
| E-05 | `AlreadyUndoneError` | rejeitar | — |
| E-06 | falha em reapontamento parcial (bug de nova tabela sem listagem) | ROLLBACK total | adicionar tabela em `reassign-targets.ts` (`OQ-MERGE-01`) |
| E-07 | conflict em `contact_phone`/`contact_email` (ambos têm `primary`) | preservar o do principal; rebaixar o do secondary a `secondary`/`alternative` | revisão manual posterior |

## Regras referenciadas

- [`BR-MERGE`](../50-business-rules/BR-MERGE.md)
- [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md) (origem das pendências)
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md)

## Eventos emitidos

- `TE-CONTACT-MERGED` (em principal e secundário).
- `TE-CONTACT-ISSUE-RESOLVED` (quando `issueId` vinculado).
- `TE-CONTACT-UNMERGED` (no undo, em ambos).

## Observabilidade

- Métricas:
  - `contact_merge_total{reason}`;
  - `contact_merge_reassigned_rows_total{table}`;
  - `contact_unmerge_total`;
  - `contact_merge_latency_ms`.
- Logs (`correlation_id`, `merge_id`, `principal_id`, `secondary_id`, `reassigned`, `flow='FLOW-08'`).
- Alertas:
  - Sentry: qualquer `reassignedTables[t]=0` inesperado (tabela possivelmente esquecida).
  - Axiom: taxa de undo / merge > 5% → qualidade de identificação baixa.

## Casos de teste E2E obrigatórios

1. **merge-happy-path**
   - Given: C1, C2 vivos; C2 tem 2 transações + 1 conversa.
   - When: `mergeContacts(C1, C2, reason='duplicata')`.
   - Then: `C2.merged_into_id=C1.id`; 2 transações + 1 conversa com `contact_id=C1.id`; `TE-CONTACT-MERGED` em ambos; `reassignedTables = { transaction: 2, conversation: 1, ... }`.

2. **merge-snapshots-contem-estado-antes**
   - Given: C1 e C2 com nomes, CPFs distintos.
   - When: merge.
   - Then: `contact_merge.principal_snapshot` e `secondary_snapshot` contêm JSON completo.

3. **merge-resolve-issue-vinculada**
   - Given: pendência `email_duplicate` C1↔C2.
   - When: `mergeContacts(..., issueId)`.
   - Then: `issue.status='resolved'`; `TE-CONTACT-ISSUE-RESOLVED`.

4. **merge-rejeita-contatos-iguais**
   - When: `mergeContacts(C1, C1, ...)`.
   - Then: `SameContactError` (antes do DB).

5. **merge-rejeita-ja-mergeado**
   - Given: C2.merged_into_id=C1.
   - When: merge C3↔C2.
   - Then: `SecondaryAlreadyMergedError`.

6. **undo-admin-only**
   - Given: merge M1; user `commercial`.
   - When: undoMerge.
   - Then: 403 `ForbiddenError`.

7. **undo-restaura-fks**
   - Given: M1 reapontou 2 transações.
   - When: admin undo.
   - Then: transações voltam para `contact_id=C2.id`; `C2.merged_into_id=NULL`; `TE-CONTACT-UNMERGED` em ambos.

8. **undo-idempotente-bloqueado**
   - Given: M1 já desfeito.
   - When: tenta undo de novo.
   - Then: `AlreadyUndoneError`.

9. **timeline-consolidada-na-leitura**
   - Given: C2 mergeado em C1; eventos emitidos para C2 antes do merge.
   - When: `listTimelineEvents(C1.id)`.
   - Then: retorna eventos de `contact_id IN (C1.id, C2.id)`.

## Open Questions

- `OQ-FLOW-08-01` — UI de diff mostra todos os 15+ domínios ou só os principais (nome, contato, financeiro)? Proposta: principais + link para detalhes.
- `OQ-FLOW-08-02` — `contact_tag` durante merge: deduplicar automaticamente (`OQ-MERGE-02`)? Fase 1: preservar duplicatas.
- `OQ-FLOW-08-03` — janela máxima para undo (`OQ-MERGE-03`)? Fase 1: sem janela.
