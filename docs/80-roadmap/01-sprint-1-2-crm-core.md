# Sprint 1-2 — CRM Core  (duração: 4 semanas)

## Objetivo

Entregar o núcleo do CRM: contato global com resolução determinística de identidade (CPF > telefone > e-mail), classificação operacional (lead/cliente/aluno/lead pago), tags, campos personalizados, notas, histórico de status, pendências de identidade, merge não-destrutivo com undo e timeline consolidada de leitura. Ao final do sprint, atendente humano enxerga um contato unificado com toda a jornada, abre/merge duplicatas e as marcas controlam visibilidade via RLS.

## Entregáveis (outcomes)

- Agregado `contact` completo com 8 tabelas e invariantes enforçadas por DB + guard.
- Função pura `resolveContactIdentity` implementando a tabela de decisão de `BR-IDENTITY` com ≥8 casos testados.
- Função pura `classifyContact` implementando `BR-CONTACT-CLASSIFICATION`.
- `mergeContacts` + `undoMerge` atômicos com reapontamento de FKs e emissão de TE.
- UI `/contacts` (lista + busca + filtros por classificação/tag) e `/contacts/[id]` (detalhe + timeline + issues + merge).
- Tela `/contacts/[id]/issues` para resolução de pendência.
- E2E `identity-resolution` e `merge-manual` verdes.
- Timeline de leitura consolidada que une eventos do principal e dos mergeados.

## Pré-requisitos (sprints anteriores concluídos)

- Sprint 0 verde (schemas ORG, `timeline_event`, `audit_log`, RLS, helpers de auth).

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-1-01 | Schema `contact` (tabela principal) + índices parciais | MOD-CONTACT | schema | no | — | `20-domain/02-contact-identity.md` §3.1, §3.9; `BR-IDENTITY` | `lib/db/schema/contact.ts` (inicial), `lib/db/schema/index.ts` | Migration aplicada; `uq_contact_cpf` parcial funciona; CHECK `ck_contact_cpf_length` barra CPF com 10 dígitos; teste `contact.cpf.unique-across-live-contacts` verde |
| T-1-02 | Schema `contact_phone` + índices primary/e164 | MOD-CONTACT | schema | yes | T-1-01 | `20-domain/02-contact-identity.md` §3.2 | `lib/db/schema/contact.ts` (adicional) | Nota: mesmo arquivo de T-1-01 — **na prática, merge sequencial**. Executar após T-1-01. Teste `contact.phone.primary.unique-per-contact` verde |
| T-1-03 | Schema `contact_email` + índices primary/email | MOD-CONTACT | schema | yes | T-1-01 | `20-domain/02-contact-identity.md` §3.3 | `lib/db/schema/contact.ts` (adicional) | Idem T-1-02: serializar em `contact.ts`. Teste `contact.email.primary.unique-per-contact` verde |
| T-1-04 | Schema `contact_document` + `contact_tag` + `contact_custom_field` | MOD-CONTACT | schema | yes | T-1-01 | `20-domain/02-contact-identity.md` §3.4-§3.6 | `lib/db/schema/contact.ts` (adicional) | `uq_contact_tag` barra tag duplicada; `uq_contact_custom_field` permite chave repetida em marcas distintas |
| T-1-05 | Schema `contact_note` + `contact_status_history` + trigger append-only | MOD-CONTACT | schema | yes | T-1-01 | `20-domain/02-contact-identity.md` §3.7-§3.8 | `lib/db/schema/contact.ts` (adicional), `supabase/migrations/0010_contact_history_triggers.sql` | UPDATE em `contact_status_history` é recusado; teste `contact.status.change.creates-history` verde |
| T-1-06 | Normalizadores puros: CPF, telefone E.164, e-mail | MOD-CONTACT | domain | yes | — | `20-domain/02-contact-identity.md` §2, §INV-08 | `lib/domain/contact/normalize.ts`, `tests/unit/contact/normalize.test.ts` | `normalizePhone('(11) 98888-7777')` → `+5511988887777`; `normalizeEmail('JOE@x.COM ')` → `joe@x.com`; 12 testes verdes |
| T-1-07 | Schema `contact_issue` + `contact_merge` + `contact_merge_undo` | MOD-MERGE | schema | yes | T-1-01 | `20-domain/03-contact-merge-issues.md` §3, §3.4 | `lib/db/schema/contact_merge.ts`, `lib/db/schema/index.ts` | Tabelas aplicadas; CHECK `ck_contact_merge_distinct` barra merge consigo; `uq_contact_merge_undo_merge` impede 2º undo |
| T-1-08 | Função pura `resolveContactIdentity` (8 casos da tabela) | MOD-CONTACT | domain | no | T-1-01 a T-1-06 | `BR-IDENTITY.md`; `20-domain/02-contact-identity.md` §2 interface | `lib/domain/contact/identity.ts`, `tests/unit/contact/identity.test.ts` | 8 testes Given/When/Then (todos os ramos da tabela) verdes; retorna `{ action, contactId, issue? }` |
| T-1-09 | Função pura `classifyContact` | MOD-CONTACT | domain | yes | T-1-01, T-1-04 | `BR-CONTACT-CLASSIFICATION.md` | `lib/domain/contact/classify.ts`, `tests/unit/contact/classify.test.ts` | Lead→customer ao aprovar; customer→student ao comprar curso; 5 testes verdes |
| T-1-10 | Função pura `consolidate` + helper `applyMerge` (reapontar FKs) | MOD-MERGE | domain | no | T-1-07, T-1-08 | `BR-MERGE.md`; `20-domain/03-contact-merge-issues.md` §6 | `lib/domain/merge/apply.ts`, `lib/domain/merge/undo.ts`, `tests/unit/merge/apply.test.ts` | `mergeContacts` move transações, conversas, tickets; `undoMerge` restaura; testes `merge.happy-path`, `undo.restores-fks` verdes |
| T-1-11 | Server Actions: `upsertContact`, `addTag`, `removeTag`, `changeStatus`, `addNote` | MOD-CONTACT | api | no | T-1-06, T-1-08, T-1-09 | AGENTS.md §3.3; `BR-TIMELINE` | `app/(app)/contacts/actions.ts` | Cada action valida com zod; emite `TE-*` correspondente; ação sem permissão retorna 403 |
| T-1-12 | Server Actions: `openIssue`, `resolveIssue`, `mergeContacts`, `undoMerge` | MOD-MERGE | api | yes | T-1-10 | `20-domain/03-contact-merge-issues.md` §2; `BR-RBAC` | `app/(app)/contacts/merge/actions.ts`, `app/(app)/contacts/[id]/issues/actions.ts` | `undoMerge` exige papel admin/financial; rejeição 403 em commercial; emite `TE-CONTACT-MERGED`/`UNMERGED` |
| T-1-13 | `listTimelineEvents` com consolidação pós-merge | MOD-TIMELINE | domain | yes | T-1-10 | `20-domain/04-timeline.md` §2 interfaces, §INV-07 | `lib/timeline/read.ts`, `tests/unit/timeline/read.test.ts` | Query consolida eventos do principal + `merged_into_id`; paginação keyset por `(occurred_at, id)`; teste `timeline.read.merged-contact.consolidates` verde |
| T-1-14 | UI `/contacts` lista + busca + filtros | MOD-CONTACT | ui | yes | T-1-11 | `70-ux` (se existir); shadcn `data-table` | `app/(app)/contacts/page.tsx`, `components/contact/contact-list.tsx`, `components/contact/contact-filters.tsx` | Lista pagina 50/pág; busca por nome/cpf/telefone/email; filtro por classificação funciona |
| T-1-15 | UI `/contacts/[id]` detalhe + abas (timeline, entitlements placeholder, transações placeholder) | MOD-CONTACT | ui | yes | T-1-11, T-1-13 | `70-ux`; `20-domain/04-timeline.md` §2 | `app/(app)/contacts/[id]/page.tsx`, `app/(app)/contacts/[id]/timeline/page.tsx`, `components/contact/contact-header.tsx` | Header mostra classificação + status; timeline pagina e filtra por `kind` |
| T-1-16 | UI `/contacts/[id]/issues` resolução de pendência | MOD-MERGE | ui | yes | T-1-12 | `20-domain/03-contact-merge-issues.md` §FLOW | `app/(app)/contacts/[id]/issues/page.tsx`, `components/merge/issue-card.tsx`, `components/merge/resolve-dialog.tsx` | Atendente resolve issue `email_duplicate` em 3 cliques; issue vira `resolved`; emite TE |
| T-1-17 | UI `/contacts/merge` seletor + confirmação + diff antes/depois | MOD-MERGE | ui | yes | T-1-12 | `20-domain/03-contact-merge-issues.md` §2 | `app/(app)/contacts/merge/page.tsx`, `components/merge/merge-wizard.tsx` | Wizard mostra snapshot antes/depois; botão undo só para admin/financial |
| T-1-18 | E2E `identity-resolution.spec.ts` (ingestão → pendência → merge) | MOD-MERGE | test | yes | T-1-16, T-1-17 | `FLOW-09`; `BR-IDENTITY`; `BR-MERGE` | `tests/e2e/identity-resolution.spec.ts` | Ingesta 2 contatos ambíguos, abre issue, atendente escolhe merge; principal herda transações stub; verde |
| T-1-19 | E2E `merge-manual.spec.ts` + teste undo | MOD-MERGE | test | yes | T-1-17 | `FLOW-08`; `BR-MERGE` | `tests/e2e/merge-manual.spec.ts` | Admin executa merge manual; undo restaura estado; duas timelines ficam consolidadas |
| T-1-20 | Testes integração reclassificação + histórico | MOD-CONTACT | test | yes | T-1-09, T-1-11 | `BR-CONTACT-CLASSIFICATION` | `tests/integration/contact/classify.test.ts` | Compra stub aprovada muda lead→customer e grava linha em `contact_status_history`; emite `TE-CONTACT-CLASSIFICATION-CHANGED` |

## Ondas de paralelização sugeridas

**Onda A (serial):** T-1-01 estabelece `lib/db/schema/contact.ts`.

**Onda B (serial, mesmo arquivo):** T-1-02 → T-1-03 → T-1-04 → T-1-05 (apêndices em `contact.ts`). Executar em sequência, 1 PR por tarefa para evitar conflito.

**Onda C (paralelo, 3 subagents, depende de A):** T-1-06, T-1-07, T-1-13
→ Arquivos distintos: `normalize.ts`, `schema/contact_merge.ts`, `timeline/read.ts`.

**Onda D (serial, depende de B+C):** T-1-08 — `identity.ts` é concentrador.

**Onda E (paralelo, 2 subagents, depende de D):** T-1-09, T-1-10
→ `classify.ts` e `merge/apply.ts` disjuntos.

**Onda F (paralelo, 2 subagents, depende de E):** T-1-11, T-1-12
→ Server actions em paths distintos (`contacts/actions.ts` vs `contacts/merge/actions.ts`).

**Onda G (paralelo, 4 subagents, depende de F):** T-1-14, T-1-15, T-1-16, T-1-17
→ UIs em diretórios disjuntos.

**Onda H (paralelo, 3 subagents, depende de G):** T-1-18, T-1-19, T-1-20.

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] `pnpm test:e2e -- identity-resolution merge-manual` verde.
- [ ] 8 casos de `BR-IDENTITY` cobertos com teste nomeado correspondente.
- [ ] Nenhuma OQ bloqueante nova além de `OQ-CONTACT-01..03`, `OQ-MERGE-01..03`.
- [ ] RLS: atendente de marca A não vê custom_field de marca B.
- [ ] Deploy em staging verde.

## Riscos e mitigação

- **Tabela de decisão ambígua em casos sem CPF.** Mitigação: T-1-08 parte da tabela de `BR-IDENTITY` como fonte autoritativa e rejeita qualquer interpretação livre.
- **Merge concorrente corrompendo FKs.** Mitigação: T-1-10 abre `SELECT ... FOR UPDATE` nos dois contatos antes de reapontar.
- **Timeline consolidada pesada com muitos mergeados encadeados.** Mitigação: recursive CTE com limite de profundidade documentado em `OQ-TIMELINE-02`.
- **RLS bloquear leitura de tag aplicada em outra marca.** Mitigação: T-1-04 usa `brand_id` NULL para tag global; testes em T-1-20 validam.

## Open Questions

- `OQ-SPRINT1-01` — merge automático por similaridade entra aqui ou fica para Fase 2? Hoje só manual.
- `OQ-SPRINT1-02` — busca fulltext por nome aceita acentos — configurar `unaccent` extension agora ou depois?
