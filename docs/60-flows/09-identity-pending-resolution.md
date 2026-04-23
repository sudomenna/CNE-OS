# FLOW-09: Resolução de pendência de identidade

## Gatilho / pré-condições

Existe `contact_issue` com `status='open'` geradas por [`FLOW-01`](./01-contact-ingestion.md)/`resolveContactIdentity` ou por [`FLOW-05`](./05-external-sale-ingest.md) em casos como `phone_conflict`, `email_duplicate`, `document_mismatch`, `source_divergence`, `offer_conflict`.

Pré-condição: operador com papel interno; Issues listadas em fila priorizada por `kind` e `created_at`.

## Atores

- humano: operador (suporte / comercial / marketing / financial / admin).
- sistema: `MOD-CONTACT` (issue + actions); `MOD-MERGE` (quando ação escolhida for merge); `MOD-TIMELINE`.
- integração: nenhuma.

## Passos

1. **Listar pendências** — UI `/contacts/issues?status=open` mostra fila com `kind`, `detail`, contato afetado, `relatedContactId` (quando aplicável), data de criação, origem (`origin`/`sourceRef`).
2. **Abrir detalhe** — operador seleciona uma `contact_issue`. UI carrega:
   - dado do payload original (em `contact_issue.payload`);
   - estado atual dos contatos envolvidos (principal + `relatedContactId`);
   - sugestão de ação baseada no `kind`.
3. **Oferecer opções** conforme `kind`:
   - `email_duplicate` ⇒ [`merge`](./08-manual-merge.md), [`ignore`], `keep-alternative` (manter e-mail como alternativo no contato existente), `create-new` (confirmar que é pessoa diferente).
   - `phone_conflict` ⇒ `promote-new-primary` (já aplicado em caso #4 — apenas confirma), `keep-original-primary`, `merge`, `ignore`.
   - `document_mismatch` ⇒ `accept-update` (CPF manda; aceita dados divergentes), `flag-fraud` (bloqueia contato), `merge`.
   - `source_divergence` ⇒ `accept-update`, `ignore`.
   - `offer_conflict` (quando caller FLOW-05 deixa transação `pending`) ⇒ `select-condition` (operador escolhe manualmente entre `candidateConditionIds`), `cancel-transaction`.
   - `other` ⇒ `ignore` + nota livre.
4. **Executar ação** via Server Action correspondente (todas gravam `resolution` na issue):
   - `merge` ⇒ delega a [`FLOW-08`](./08-manual-merge.md) com `issueId`.
   - `create-new` ⇒ no-op sobre contatos (pendência só é fechada); registra decisão em `resolution`.
   - `keep-alternative` ⇒ INSERT `contact_email` com `status='alternative'` no contato principal.
   - `promote-new-primary` ⇒ UPDATE `contact_phone` status (se ainda não feito).
   - `flag-fraud` ⇒ UPDATE `contact SET status='blocked'`; INSERT `contact_status_history`; `TE-CONTACT-BLACKLISTED`.
   - `select-condition` ⇒ atualiza `transaction.offer_condition_id` (se ainda `pending`), prossegue para aprovação manual via FLOW-05 (passo 8 em diante).
   - `ignore` ⇒ apenas fecha issue com `resolution='ignored'`.
5. **Fechar pendência**:
   - `UPDATE contact_issue SET status='resolved'` (ou `ignored`), `resolved_by_user_id`, `resolved_at=now()`, `resolution=<opção escolhida>`.
   - Emitir `TE-CONTACT-ISSUE-RESOLVED` com `payload.resolution`.
6. **Auditoria** — registrar ação crítica (`flag-fraud`, `merge`) em `audit_log` ([`BR-AUDIT`](../50-business-rules/BR-AUDIT.md)).

## Pós-condições

- `contact_issue.status IN ('resolved','ignored')`.
- Quando ação foi mutativa, estado do(s) contato(s) reflete a decisão.
- Evento `TE-CONTACT-ISSUE-RESOLVED` na timeline.
- Possivelmente `TE-CONTACT-MERGED`, `TE-CONTACT-UPDATED`, `TE-CONTACT-BLACKLISTED` conforme ação.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | issue já resolvida por outro operador (corrida) | 409 `IssueAlreadyResolved` | recarregar lista |
| E-02 | `relatedContactId` não existe (foi deletado) | ação `merge` desabilitada; operador escolhe outra | — |
| E-03 | `select-condition` com `conditionId` fora dos candidatos | rejeitar com `InvalidConditionChoice` | UI restringe opções |
| E-04 | `flag-fraud` sem papel admin/financial | 403 | escalar |
| E-05 | merge via issue tenta reusar issue já vinculada a outro merge | `uq_contact_merge_issue` (se existir) bloqueia | revisar |

## Regras referenciadas

- [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md)
- [`BR-MERGE`](../50-business-rules/BR-MERGE.md)
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md)
- [`BR-OFFER-DECISION`](../50-business-rules/BR-OFFER-DECISION.md) (caso `offer_conflict`)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)

## Eventos emitidos

- `TE-CONTACT-ISSUE-RESOLVED` — sempre.
- `TE-CONTACT-MERGED` — quando ação é merge (via FLOW-08).
- `TE-CONTACT-UPDATED` — quando ação modifica campos críticos.
- `TE-CONTACT-BLACKLISTED` — quando `flag-fraud`.
- `TE-SALE-APPROVED` — quando `select-condition` leva à aprovação da transação pendente (delegado a FLOW-05).

## Observabilidade

- Métricas:
  - `contact_issue_open_total{kind}` (gauge);
  - `contact_issue_resolved_total{kind, resolution}`;
  - `contact_issue_age_hours{kind}` (histograma);
  - `offer_conflict_resolved_total`.
- Logs (`correlation_id`, `issue_id`, `kind`, `resolution`, `actor_user_id`, `flow='FLOW-09'`).
- Alertas:
  - Axiom: `contact_issue_open_total` > 100 por 24h (backlog crítico).
  - Sentry: pendência com `age_hours > 72h` em quantidade anormal.

## Casos de teste E2E obrigatórios

1. **resolve-via-merge**
   - Given: issue `email_duplicate` ligando C1↔C2; operador escolhe `merge`.
   - When: confirma.
   - Then: FLOW-08 executa merge; issue `resolved`; `TE-CONTACT-ISSUE-RESOLVED` emitido; `TE-CONTACT-MERGED` emitido.

2. **resolve-keep-alternative**
   - Given: issue `email_duplicate` sem `relatedContactId` (e-mail novo não pertence a ninguém, só divergente).
   - When: `keep-alternative`.
   - Then: `contact_email(status='alternative')` inserido; issue resolved.

3. **resolve-flag-fraud**
   - Given: issue `document_mismatch`; user admin 2FA fresh.
   - When: `flag-fraud`.
   - Then: `contact.status='blocked'`; `TE-CONTACT-BLACKLISTED`; `audit_log` registra.

4. **resolve-offer-conflict-escolhe-condicao**
   - Given: transação T em `pending` por `offer_conflict` entre A/B.
   - When: operador escolhe A.
   - Then: `T.offer_condition_id=A.id`; issue resolved; FLOW-05 retoma aprovação.

5. **ignore-fecha-sem-efeito**
   - When: operador escolhe `ignore`.
   - Then: `issue.status='ignored', resolution='ignored'`; contato inalterado.

6. **corrida-dois-operadores**
   - Given: issue aberta; 2 operadores abrem tela.
   - When: ambos confirmam simultaneamente.
   - Then: primeiro resolve; segundo recebe `IssueAlreadyResolved`.

## Open Questions

- `OQ-FLOW-09-01` — priorização da fila deve considerar valor financeiro do contato (ex.: customer com ticket alto primeiro)? Fase 1: FIFO por `kind`.
- `OQ-FLOW-09-02` — `flag-fraud` envia notificação automática ao contato (ex.: bloqueio de acesso)? Decisão de comunicação — fora do escopo Fase 1.
- `OQ-FLOW-09-03` — issues `offer_conflict` devem ter tempo máximo antes de auto-cancelar a transação pendente? Proposta: 48h.
