# Sprint 13 — RLS Fase 1 + Flows P0/P1 (iniciado 2026-04-26)

## Objetivo

Fechar os bloqueadores de produção identificados na auditoria pós-Sprint-12: ativar RLS nas 5 tabelas sensíveis que estavam sem proteção, implementar os 2 flows completamente ausentes (FLOW-10 Renewal e FLOW-14 Campaign Attribution) e completar os gaps dos flows parciais prioritários (FLOW-07 Refund revert, FLOW-12 Webhook DLQ). Ao final do sprint as tabelas financeiras estão protegidas por RLS, renovação via oferta dedicada está funcional e o sistema de atribuição de campanha opera end-to-end (clique → funil → conversão).

## Entregáveis (outcomes)

- RLS Fase 1 ativada em todas as tabelas sensíveis: `transaction/*`, `entitlement/*`, `refund/*`, `billing/*`, `automation/*` — 22 tabelas, 7 migrations aplicadas ao Supabase remoto.
- FLOW-10 completo: `assertRenewalEligibility` com grace period 30d, erros `OfferNotRenewal`/`RenewalWithoutActiveEntitlement`, guard integrado em `createPendingTransaction` e `approveTransaction`.
- FLOW-14 MVP completo: schema `trackable_link_click_anonymous`, auto-discovery em `enterFunnel`/`markWon`, Inngest handler `campaign/link.clicked` (identificado → TE, anônimo → tabela), redirector `/go/[slug]` extrai `cne_cid`/`cne_sid`.
- FLOW-07 fechado: `revertFunnelEntryAfterRefund` substituindo stub no-op — label `won → reopened` + `TE-OPPORTUNITY-LABEL-CHANGED`.
- FLOW-12 completado: coluna `operator_notes` (jsonb append-only), `ignoreWebhookAction`, `addOperatorNoteAction`, `IgnoreButton`, `AddOperatorNoteForm`, seção de notas na página de detalhe do webhook.

## Pré-requisitos

- Sprint 12 verde (1163 testes Vitest, typecheck limpo, deploy READY em cne-os.vercel.app). ✅ concluído em 2026-04-25.

## Status atual

> Última atualização: 2026-04-26 — Sprint 13 em andamento (ondas A–D concluídas).

| T-ID | Título curto | Onda | Status |
|---|---|---|---|
| T-13-01 | RLS Fase 1 — transaction (5 tabelas) | A | ✅ completed |
| T-13-02 | RLS Fase 1 — entitlement (3 tabelas) | A | ✅ completed |
| T-13-03 | RLS Fase 1 — refund (3 tabelas) | A | ✅ completed |
| T-13-04 | RLS Fase 1 — billing (4 tabelas) | A | ✅ completed |
| T-13-05 | RLS Fase 1 — automation (7 tabelas) | A | ✅ completed |
| T-13-06 | FLOW-10 — assertRenewalEligibility + erros + guard | B | ✅ completed |
| T-13-07 | FLOW-14 — schema trackable_link_click_anonymous | B | ✅ completed |
| T-13-08 | FLOW-14 — auto-discovery enterFunnel + markWon | B | ✅ completed |
| T-13-09 | FLOW-14 — Inngest handler campaign/link.clicked | C | ✅ completed |
| T-13-10 | FLOW-14 — redirector /go/[slug] extrai contact_id + session_id | C | ✅ completed |
| T-13-11 | FLOW-07 — revertFunnelEntryAfterRefund (stub → impl real) | D | ✅ completed |
| T-13-12 | FLOW-12 — coluna operator_notes (schema + migration) | D | ✅ completed |
| T-13-13 | FLOW-12 — ignoreWebhookAction + addOperatorNoteAction | D | ✅ completed |
| T-13-14 | FLOW-12 — IgnoreButton + AddOperatorNoteForm + page detalhe | D | ✅ completed |
| T-13-15 | Inbox UX — painel resizable + filtros inline + tabs de conversa | E | ✅ completed |
| T-13-16 | Inbox UX — compositor com tabs Mensagem/Template/Nota | E | ✅ completed |
| T-13-17 | Offer builder — editor visual AND/OR com validação em tempo real | E | ✅ completed |
| T-13-18 | Analytics — rota /analytics/inadimplencia | E | ✅ completed |
| T-13-19 | Analytics — export CSV universal (todas as rotas) | E | ✅ completed |
| T-13-20 | FLOW-08 — timeline de consolidação pós-merge | F | ✅ completed |
| T-13-21 | A11y — skip link + axe-core em CI + aria-sort | G | ✅ completed |
| T-13-22 | Design tokens — paleta --chart-* (8 cores categóricas) | G | ✅ completed |
| T-13-23 | Realtime — timeline contact + push de mensagens inbox | G | ✅ completed |
| T-13-24 | FLOW-13 — SLA + automation_trigger para tickets | G | ✅ completed |

**Baseline ao iniciar Sprint 13:** 1163 testes Vitest ✅ | typecheck ✅
**Baseline após Onda D (2026-04-26):** 1185 testes Vitest ✅ | typecheck ✅ (+22 testes)
**Baseline após Onda E (2026-04-26):** 1185 testes Vitest ✅ | typecheck ✅
**Baseline após Onda F (2026-04-26):** 1190 testes Vitest ✅ | typecheck ✅ (+5 testes)
**Baseline após Onda G (2026-04-26):** 1200 testes Vitest ✅ | typecheck ✅ (+10 testes)

---

## Tarefas

| ID | Título | Módulo | Tipo | Subagent | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|---|
| T-13-01 | RLS Fase 1 — tabelas transaction (5) | MOD-TRANSACTION | schema | cne-rls-author | yes | — | `10-architecture/06-auth-rbac-audit.md §2` | `supabase/migrations/20260426000001_transaction_rls.sql` | Migration aplicada; SELECT via cliente anon → 0 linhas; app server (service role) lê normalmente |
| T-13-02 | RLS Fase 1 — tabelas entitlement (3) | MOD-ENTITLEMENT | schema | cne-rls-author | yes | — | `10-architecture/06-auth-rbac-audit.md §2` | `supabase/migrations/20260426000002_entitlement_rls.sql` | Idem T-13-01 |
| T-13-03 | RLS Fase 1 — tabelas refund (3) | MOD-REFUND | schema | cne-rls-author | yes | — | `10-architecture/06-auth-rbac-audit.md §2` | `supabase/migrations/20260426000003_refund_rls.sql` | Idem T-13-01 |
| T-13-04 | RLS Fase 1 — tabelas billing (4) | MOD-BILLING | schema | cne-rls-author | yes | — | `10-architecture/06-auth-rbac-audit.md §2` | `supabase/migrations/20260426000004_billing_rls.sql` | Idem T-13-01 |
| T-13-05 | RLS Fase 1 — tabelas automation (7) | MOD-AUTOMATION | schema | cne-rls-author | yes | — | `10-architecture/06-auth-rbac-audit.md §2` | `supabase/migrations/20260426000005_automation_rls.sql` | Idem T-13-01 |
| T-13-06 | FLOW-10 — `assertRenewalEligibility` + erros + guard em approve/create-pending | MOD-OFFER | domain | cne-domain-author | yes | — | `60-flows/10-renewal-via-new-offer.md`, `50-business-rules/BR-RENEWAL.md` | `lib/domain/offer/renewal.ts` (new), `lib/domain/offer/errors.ts`, `lib/domain/offer/index.ts`, `lib/domain/transaction/approve.ts`, `lib/domain/transaction/create-pending.ts`, `tests/unit/offer/renewal.test.ts` (new) | 9 testes verdes; guard lança `RenewalWithoutActiveEntitlement` quando contato não tem direito; grace period 30d passa |
| T-13-07 | FLOW-14 — schema `trackable_link_click_anonymous` + migration | MOD-CAMPAIGN | schema | cne-schema-author | yes | — | `60-flows/14-campaign-attribution.md §E-03` | `lib/db/schema/campaign.ts`, `supabase/migrations/20260426000006_trackable_link_click_anonymous.sql` | Migration aplicada; unique `(session_id, trackable_link_id)`; RLS SELECT ativada |
| T-13-08 | FLOW-14 — `resolveAttributionForContact` + auto-discovery em `enterFunnel`/`markWon` | MOD-FUNNEL | domain | cne-domain-author | yes | — | `60-flows/14-campaign-attribution.md §3-4`, `50-business-rules/BR-FUNNEL-OPPORTUNITY.md` | `lib/domain/funnel/attribution.ts`, `lib/domain/funnel/enter.ts`, `lib/domain/funnel/won.ts`, `tests/unit/funnel/attribution.test.ts` (new) | Auto-discovery preenche `entry_*` e `conversion_*` quando `campaignId` não fornecido; `conversion_origin='direct'` quando sem clique |
| T-13-09 | FLOW-14 — Inngest handler `campaign/link.clicked` | MOD-CAMPAIGN | integration | cne-integration-author | yes | T-13-07 | `60-flows/14-campaign-attribution.md §1` | `inngest/functions/campaign-link-clicked.ts` (new), `inngest/functions/index.ts` | Clique identificado emite `TE-CAMPAIGN-CLICK`; clique anônimo persiste em `trackable_link_click_anonymous` com idempotência |
| T-13-10 | FLOW-14 — redirector `/go/[slug]` extrai `contact_id` + `session_id` | MOD-CAMPAIGN | ui | cne-ui-author | yes | — | `60-flows/14-campaign-attribution.md §1` | `app/go/[slug]/route.ts`, `lib/timeline/schemas/campaign-click.ts` | Cookie `cne_cid` > `?cid=` param; `cne_sid` gerado e setado; payload Inngest enriquecido |
| T-13-11 | FLOW-07 — `revertFunnelEntryAfterRefund` substituindo stub no-op | MOD-FUNNEL | domain | cne-domain-author | yes | — | `60-flows/07-refund-end-to-end.md §passo-6`, `50-business-rules/BR-RENEWAL.md` | `lib/domain/funnel/revert.ts` (new), `lib/domain/funnel/index.ts`, `lib/domain/refund/approve.ts`, `tests/unit/funnel/revert.test.ts` (new) | Label `won → reopened` após refund; `TE-OPPORTUNITY-LABEL-CHANGED` emitido; sem entry → sem erro |
| T-13-12 | FLOW-12 — coluna `operator_notes` (jsonb, append-only) | MOD-INTEGRATION | schema | cne-schema-author | yes | — | `60-flows/12-webhook-reprocess.md §passo-3` | `lib/db/schema/webhook-log.ts`, `supabase/migrations/20260426000007_webhook_log_operator_notes.sql` | `ALTER TABLE webhook_log ADD COLUMN operator_notes jsonb NOT NULL DEFAULT '[]'`; migration aplicada |
| T-13-13 | FLOW-12 — `ignoreWebhookAction` + `addOperatorNoteAction` | MOD-INTEGRATION | api | cne-ui-author | yes | T-13-12 | `60-flows/12-webhook-reprocess.md §passo-4-7`, `50-business-rules/BR-AUDIT.md` | `app/(app)/settings/webhooks/actions.ts` | ignore: UPDATE status='processed' + append nota + audit_log; addNote: append sem alterar status; ambas requerem `webhook.reprocess` |
| T-13-14 | FLOW-12 — `IgnoreButton` + `AddOperatorNoteForm` + page detalhe atualizada | MOD-INTEGRATION | ui | cne-ui-author | no | T-13-13 | `60-flows/12-webhook-reprocess.md §UI` | `components/webhooks/ignore-button.tsx` (new), `components/webhooks/add-operator-note-form.tsx` (new), `app/(app)/settings/webhooks/[id]/page.tsx` | Dialog com textarea obrigatória antes de confirmar ignore; seção "Notas" lista notas existentes; IgnoreButton visível apenas para status `dead_letter`/`failed` |
| T-13-15 | Inbox UX — painel resizable (25/50/25) + filtros inline (Canal/Responsável/Status) + tabs Todas/Minhas/Não-atribuídas | MOD-INBOX | ui | cne-ui-author | yes | — | `70-ux/04-screen-inbox.md §Filtros §Tabs` | `app/(app)/inbox/page.tsx`, `components/inbox/conversation-list.tsx`, `components/inbox/inbox-filters.tsx` (new) | Painel redimensionável com ResizablePanelGroup; filtros atualizam lista sem reload; tabs filtram por `assigned_to` |
| T-13-16 | Inbox UX — compositor com tabs Mensagem/Template/Nota + suporte a attachments básico | MOD-INBOX | ui | cne-ui-author | yes | — | `70-ux/04-screen-inbox.md §Compositor` | `components/inbox/message-composer.tsx` | 3 tabs no compositor; tab Template lista templates disponíveis; tab Nota marca mensagem como interna; upload de imagem |
| T-13-17 | Offer builder — editor visual AND/OR de condições com drag-drop de nós + validação em tempo real | MOD-OFFER | ui | cne-ui-author | yes | — | `70-ux/06-screen-offer-builder.md §Editor de Condições` | `components/offers/rule-tree-editor.tsx` (new), `components/offers/rule-node.tsx`, `app/(app)/offers/[id]/condition-tabs.tsx` | Drag-drop usando `@dnd-kit`; nó AND/OR expansível; validação mostra erros inline antes de salvar |
| T-13-18 | Analytics — rota `/analytics/inadimplencia` (dunning: MRR em risco, taxa inadimplência, retentativas, by-offer breakdown) | MOD-ANALYTICS | ui | cne-ui-author | yes | — | `70-ux/08-screen-dashboards.md §inadimplencia` | `app/(app)/analytics/inadimplencia/page.tsx` (new), `components/analytics/dunning-metrics.tsx` (new) | Métricas via query sobre `installment` + `subscription`; taxa = overdue/(overdue+active); breakdown por oferta |
| T-13-19 | Analytics — export CSV universal em todos os dashboards (/sales, /funnels, /inbox, /inadimplencia) | MOD-ANALYTICS | ui | cne-ui-author | yes | T-13-18 | `70-ux/08-screen-dashboards.md §Padrões` | `app/(app)/analytics/*/export/route.ts` (new ×4) | Botão "Exportar" em cada dashboard; CSV respeita filtros globais; máx 10k linhas |
| T-13-20 | FLOW-08 — timeline de consolidação pós-merge (listar eventos de ambas identidades unificadas) | MOD-MERGE | domain | cne-domain-author | yes | — | `60-flows/08-manual-merge.md §pós-merge`, `20-domain/03-contact-merge-issues.md` | `lib/timeline/read.ts` | Query consolida timeline do principal + todos os `merged_into_id` recursivamente; `listTimelineEvents` retorna eventos ordenados de todas as identidades |
| T-13-21 | A11y — skip link "Pular para conteúdo" + `aria-sort` em colunas ordenáveis + axe-core em CI | TRANSVERSAL | ui | cne-ui-author | yes | — | `70-ux/10-accessibility.md §Skip §Sorting` | `app/(app)/layout.tsx`, `components/ui/data-table.tsx`, `.github/workflows/` ou `vitest.setup.ts` | Skip link visível ao receber foco; `aria-sort` em `<th>` ordenáveis; axe-core roda em pipeline sem falhar |
| T-13-22 | Design tokens — paleta `--chart-*` (8 cores categóricas WCAG AA) em `globals.css` | TRANSVERSAL | ui | cne-ui-author | yes | — | `70-ux/01-design-system-tokens.md §Chart` | `app/globals.css`, `tailwind.config.ts` | 8 variáveis `--chart-1` a `--chart-8` em light + dark; usadas nos componentes Recharts existentes |
| T-13-23 | Realtime — subscription Supabase em timeline contact + notificações push em inbox | TRANSVERSAL | ui | cne-ui-author | yes | — | `70-ux/09-interaction-patterns.md §Realtime` | `app/(app)/contacts/[id]/timeline/`, `app/(app)/inbox/` | `useEffect` com `supabase.channel().on('postgres_changes')` na timeline; nova mensagem aparece sem reload |
| T-13-24 | FLOW-13 — SLA primeira resposta (≤15min badge) + automation_trigger em abertura/fechamento de ticket | MOD-TICKET | domain | cne-domain-author | yes | — | `60-flows/13-ticket-lifecycle.md §SLA §automation` | `lib/domain/ticket/sla.ts` (new), `lib/domain/ticket/open.ts`, `lib/domain/ticket/set-status.ts` | `computeFirstResponseSla(ticket)` retorna `met/violated/pending`; `dispatchTrigger('ticket_opened')` chamado em `openTicket` |

---

## Ondas de paralelização

> Máximo 5 subagents por onda. Verde (`pnpm typecheck && pnpm test`) obrigatório entre ondas.

### Onda A — RLS Fase 1 (paralelo, 5 subagents) ✅ concluída 2026-04-26
`T-13-01`, `T-13-02`, `T-13-03`, `T-13-04`, `T-13-05`
→ Arquivos completamente disjuntos (1 migration por módulo). Migrations aplicadas ao Supabase remoto.

### Onda B — FLOW-10 + FLOW-14 base (paralelo, 3 subagents) ✅ concluída 2026-04-26
`T-13-06`, `T-13-07`, `T-13-08`
→ Arquivos disjuntos: offer domain / campaign schema / funnel attribution.

### Onda C — FLOW-14 integração (paralelo, 2 subagents) ✅ concluída 2026-04-26
`T-13-09`, `T-13-10`
→ Inngest handler + redirector são disjuntos.

### Onda D — FLOW-07 + FLOW-12 (paralelo, 4 subagents) ✅ concluída 2026-04-26
`T-13-11`, `T-13-12`, `T-13-13`, `T-13-14` (T-13-14 serial após T-13-13)
→ T-13-11/12 paralelos; T-13-13 paralelo com 11/12; T-13-14 após T-13-13.

### Onda E — Inbox UX + Offer builder + Analytics (paralelo, 5 subagents) ✅ concluída 2026-04-26
`T-13-15`, `T-13-16`, `T-13-17`, `T-13-18`, `T-13-19`
→ Todos em módulos distintos, arquivos disjuntos. T-13-19 pode ser paralelo com T-13-18 (rotas novas).

### Onda F — FLOW-08 merge timeline (serial, 1 subagent) ✅ concluída 2026-04-26
`T-13-20`
→ Edita `lib/timeline/read.ts`; aguarda Onda E estar verde.

### Onda G — A11y + design tokens + realtime + FLOW-13 (paralelo, 4 subagents) ✅ concluída 2026-04-26
`T-13-21`, `T-13-22`, `T-13-23`, `T-13-24`
→ Todos em arquivos disjuntos; podem rodar juntos.

---

## TODOs conhecidos (não blockers)

- `TE-WEBHOOK-REPROCESSED` e `TE-INTEGRATION-EVENT`: kinds não registrados no `KIND_REGISTRY`. Documentados com comentário `// TODO` em `reprocessWebhook` e `ignoreWebhookAction`. Requerem decisão sobre registrar novos kinds antes de implementar.
- FLOW-14 cliques anônimos retroativos (`inngest/functions/resolve-anonymous-clicks.ts`): não implementado neste sprint — baixa prioridade (E-03 de FLOW-14).
- FLOW-14 attribution manual override (UI para editar `conversion_*`): P2, não implementado.
- OQ-SPRINT12-04: `/billing/invoices` e `/billing/plans` — escopo pendente de decisão.
