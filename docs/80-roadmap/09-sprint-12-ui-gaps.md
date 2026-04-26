# Sprint 12 — Completar UI (gaps identificados em auditoria 2026-04-25)

## Objetivo

Fechar os gaps de interface levantados na auditoria pós-Sprint-11. O produto tem lógica de domínio, schemas e server actions implementados em todos os módulos, mas a camada visual ficou incompleta: shell sem brand-switcher/notificações/atalhos globais, detalhe de contato com 3 das 8 tabs previstas, funnel sem sheet lateral/modais won-lost/métricas, settings sem account/integrations/audit, analytics com filtros hardcoded. Este sprint entrega a experiência completa prevista na documentação de UX.

## Entregáveis (outcomes)

- Shell completo: brand switcher multi-marca, avatar dropdown, centro de notificações, breadcrumbs automáticos, atalhos globais (chord `g i / g c / g f / g o / g a / ?`), banners (impersonação, offline, sessão expirada), sidebar com todos os módulos + badges.
- Detalhe contato com 8 tabs: Timeline, Conversas, Tickets, Oportunidades, Transações, Direitos, Notas (CRUD), Histórico; header rico com avatar/tags/menu `...`; form `/contacts/new`.
- Funnel board com sheet lateral de oportunidade (4 tabs), modais Won/Lost com validação, toggle Board/Lista, header com métricas, criar funil.
- Settings: `/settings/account` (perfil + 2FA + tema), `/settings/integrations` (status + logs), `/settings/funnels` (config + score rules), `/settings/audit` (trilha auditoria + CSV); CRUDs completos no catálogo.
- Analytics com filtros globais persistidos em `user_preferences`, `/analytics/atendimento` completo (heatmap, SLA, top atendentes), export CSV universal.
- Tickets: tabs detalhe (Descrição, Atividade, Notas, Histórico), edição inline, reatribuição, filtros completos.
- Transactions: tabs faltantes (Parcelas/Assinatura, Direitos, Auditoria, Timeline), ações NF-e, reprocessar webhook.
- Polimento transversal: AlertDialog com confirmação textual em ações destrutivas; skeleton/empty states consistentes.

## Pré-requisitos

- Sprints 1–11 concluídos (todos os server actions, schemas e domain functions já existem).
- Baseline: 1163 testes Vitest verdes; typecheck limpo.

## Referências de UX (ler antes de implementar cada módulo)

- `docs/70-ux/01-design-system-tokens.md`
- `docs/70-ux/02-information-architecture.md`
- `docs/70-ux/05-funnel-board.md`
- `docs/70-ux/06-offer-editor.md`
- `docs/70-ux/07-transaction-detail.md`
- `docs/70-ux/08-analytics-dashboards.md`
- `docs/70-ux/09-interaction-patterns.md`

---

## Tarefas

| ID | Título | Módulo | Tipo | Subagent | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|---|
| T-12-01 | Sidebar — itens Funis/Transações/Tickets/Dashboards + separador operacional/config + badge inbox unread | SHELL | ui | cne-ui-author | yes | — | `70-ux/02-information-architecture.md §Sidebar` | `components/layout/sidebar.tsx` | Sidebar lista todos os 8 módulos; separador visual entre operacional e config; badge numérico no Inbox |
| T-12-02 | Brand Switcher — dropdown multi-marca na topbar com persistência em cookie | SHELL | ui | cne-ui-author | yes | — | `70-ux/02-information-architecture.md §Topbar` | `components/layout/brand-switcher.tsx` (new), `app/(app)/brands/actions.ts` (new) | Dropdown lista marcas visíveis ao usuário; seleção persiste em cookie `brand_id`; "Todas" é opção padrão |
| T-12-03 | Avatar Dropdown — perfil, preferências de tema (light/dark/system), logout, logout todas sessões | SHELL | ui | cne-ui-author | yes | — | `70-ux/09-interaction-patterns.md §Impersonação` | `components/layout/avatar-dropdown.tsx` (new) | Menu abre com nome + email; toggle de tema muda `data-theme` imediatamente; logout chama `signOut`; logout todas sessões chama `signOut({ scope: 'global' })` |
| T-12-04 | Centro de Notificações — popover topbar, últimas 20, badge unread, marcar como lida | SHELL | ui | cne-ui-author | yes | — | `70-ux/09-interaction-patterns.md §Notificação desktop` | `components/layout/notification-center.tsx` (new), `app/(app)/notifications/actions.ts` (new) | Popover abre com lista de notificações; badge some ao marcar todas lidas; "Ver todas" navega para lista completa |
| T-12-05 | Breadcrumbs automáticos baseados em `usePathname` com labels de segmento | SHELL | ui | cne-ui-author | yes | — | `70-ux/02-information-architecture.md §Breadcrumbs` | `components/layout/breadcrumbs.tsx` (new) | Renderiza `Raiz > Seção > Subseção`; último segmento não é link; segmentos intermediários são links; suporta label override via prop |
| T-12-06 | Atalhos globais — chord `g i/c/f/o/a/t`, `?` (help overlay), `n` (novo contextual), `/` (busca) via hook | SHELL | ui | cne-ui-author | yes | — | `70-ux/09-interaction-patterns.md §Atalhos de Teclado` | `hooks/use-global-hotkeys.ts` (new), `components/layout/hotkeys-provider.tsx` (new), `components/layout/hotkeys-help-dialog.tsx` (new) | `g i` navega para /inbox; `?` abre dialog de ajuda com tabela de atalhos; atalhos inibidos quando foco em input |
| T-12-07 | Banners globais — impersonação (sticky vermelho), offline, sessão expirada | SHELL | ui | cne-ui-author | yes | — | `70-ux/09-interaction-patterns.md §Impersonação §Estados Globais` | `components/layout/global-banners.tsx` (new) | Banner impersonação exibe nome impersonado + botão sair; banner offline via `navigator.onLine + 'offline' event`; sessão expirada via Supabase `onAuthStateChange` |
| T-12-08 | Shell wiring — integrar brand-switcher, avatar-dropdown, notification-center em topbar; breadcrumbs + hotkeys-provider + banners em layout | SHELL | ui | cne-ui-author | no | T-12-01..07 | — | `components/layout/topbar.tsx`, `app/(app)/layout.tsx` | Topbar renderiza os 3 componentes novos na ordem correta; layout envolve conteúdo com HotkeysProvider + GlobalBanners + Breadcrumbs |
| T-12-09 | Contact — Tab Conversas (lista conversas do contato, colunas: canal, preview, responsável, status, updated_at, link abrir inbox) | MOD-CONTACT | ui | cne-ui-author | yes | — | `70-ux/09-interaction-patterns.md`, `20-domain/02-contact-identity.md §T-1-15 Tab Conversas` | `components/contact/tab-conversations.tsx` (new) | Lista paginada de conversas; clique abre `/inbox` com conversa selecionada; empty state com CTA |
| T-12-10 | Contact — Tab Tickets (lista tickets do contato, colunas: ID curto, título, categoria, prioridade, status, responsável) + CTA "Abrir ticket" | MOD-CONTACT | ui | cne-ui-author | yes | — | `70-ux/09-interaction-patterns.md`, `20-domain/02-contact-identity.md §T-1-15 Tab Tickets` | `components/contact/tab-tickets.tsx` (new) | Lista tickets do contato; badge de prioridade colorido; CTA invoca OpenTicketButton existente |
| T-12-11 | Contact — Tab Oportunidades (lista funnel_entry: funil, estágio, label won/lost/open, score, campanha, criativo, data entrada) + CTA "Adicionar ao funil" | MOD-CONTACT | ui | cne-ui-author | yes | — | `20-domain/02-contact-identity.md §T-1-15 Tab Oportunidades` | `components/contact/tab-opportunities.tsx` (new) | Lista oportunidades com label badge; empty state com CTA |
| T-12-12 | Contact — Tab Transações (lista transactions: ID curto, oferta, condição, amount, status, provedor, approved_at, link para /transactions/[id]) | MOD-CONTACT | ui | cne-ui-author | yes | — | `20-domain/02-contact-identity.md §T-1-15 Tab Transações` | `components/contact/tab-transactions.tsx` (new) | Status badge com cores semânticas; valores em BRL; link para detalhe da transação |
| T-12-13 | Contact — Tab Direitos (lista customer_entitlement: kind, nome ref, ends_at, status, origem transaction) | MOD-CONTACT | ui | cne-ui-author | yes | — | `20-domain/02-contact-identity.md §T-1-15 Tab Direitos` | `components/contact/tab-entitlements.tsx` (new) | Separa direitos ativos de histórico; badge por kind; ends_at com `date-fns` relativo |
| T-12-14 | Contact — Tab Notas CRUD (criar/editar/excluir nota interna com markdown básico; server actions) | MOD-CONTACT | ui | cne-ui-author | yes | — | `20-domain/02-contact-identity.md §T-1-15 Tab Notas` | `components/contact/tab-notes.tsx` (new), `app/(app)/contacts/[id]/notes/actions.ts` (new) | CRUD funcional; textarea com preview markdown; excluir pede AlertDialog; otimistic update |
| T-12-15 | Contact — Tab Histórico (audit_log filtrado por resource_kind='contact', resource_id=contactId; quem mudou o quê, quando, diff) | MOD-CONTACT | ui | cne-ui-author | yes | — | `20-domain/02-contact-identity.md §T-1-15 Tab Histórico` | `components/contact/tab-audit.tsx` (new) | Timeline reversa; diff JSON expansível; filtros: ator, período |
| T-12-16 | Contact — Header rico + wiring das 8 tabs em page.tsx (avatar, classification badge, marcas chips, identificação mascarada + copiar, tags com +/x, menu `...`) | MOD-CONTACT | ui | cne-ui-author | no | T-12-09..15 | `20-domain/02-contact-identity.md §T-1-15 Header` | `app/(app)/contacts/[id]/page.tsx`, `components/contact/contact-header.tsx` | page.tsx monta 8 tabs; header exibe todas as info previstas; menu `...` com RBAC |
| T-12-17 | Contact — Form `/contacts/new` (campos: nome, CPF, telefone, email, classificação, tags, marcas, notas) com validação zod | MOD-CONTACT | ui | cne-ui-author | yes | — | `20-domain/02-contact-identity.md T-1-14` | `app/(app)/contacts/new/page.tsx` (new), `components/contact/contact-form.tsx` (new) | Form salva via server action existente; máscaras CPF/telefone; redireciona para `/contacts/[id]` ao salvar |
| T-12-18 | Funnel — EntrySheet lateral (480px) ao clicar card — tabs: Atividade, Notas, Contato, Detalhes | MOD-FUNNEL | ui | cne-ui-author | yes | — | `70-ux/05-funnel-board.md §Sheet Lateral` | `components/funnel/entry-sheet.tsx` (new) | Sheet abre sem perder o board; tab Atividade exibe timeline do contato (reusa componente); tab Detalhes mostra responsável, valor est., campanha |
| T-12-19 | Funnel — Modais Won e Lost (Won: pede transaction_id ou confirma venda manual; Lost: pede reason obrigatório) + server actions `markWon`, `markLost` | MOD-FUNNEL | ui | cne-ui-author | yes | — | `70-ux/05-funnel-board.md §Drag-and-Drop`, `20-domain/05-funnel-opportunity.md` | `components/funnel/won-lost-modals.tsx` (new), `app/(app)/funnels/actions.ts` (adiciona markWon, markLost) | Arrastar para coluna won/lost abre modal obrigatório; sem preencher não fecha; emite TE após confirmar |
| T-12-20 | Funnel — layout [id]: Toggle Board/Lista + Header com métricas (abertas, conversão 30d, ticket médio) + filtros completos + wiring entry-sheet e modais | MOD-FUNNEL | ui | cne-ui-author | no | T-12-18, T-12-19 | `70-ux/05-funnel-board.md §Filtros §Métricas §Toggle` | `app/(app)/funnels/[id]/page.tsx`, `components/funnel/funnel-metrics.tsx` (new), `components/funnel/funnel-list-view.tsx` (new) | Toggle Board/Lista persiste em `user_preferences`; métricas buscadas via query agregada; filtros atualizam URL params |
| T-12-21 | Funnel — Dialog "Criar funil" (campos: nome, marca, estágios iniciais) + server action `createFunnel` | MOD-FUNNEL | ui | cne-ui-author | yes | — | `20-domain/05-funnel-opportunity.md` | `components/funnel/create-funnel-dialog.tsx` (new), `app/(app)/funnels/actions.ts` (adiciona createFunnel) | Dialog abre da lista `/funnels`; mínimo 1 estágio; redireciona para `/funnels/[id]` ao criar |
| T-12-22 | Settings — `/settings/account` (perfil: nome, telefone; tema light/dark/system; 2FA toggle com QR; logout todas sessões) | MOD-SETTINGS | ui | cne-ui-author | yes | — | `70-ux/02-information-architecture.md §/settings/account` | `app/(app)/settings/account/page.tsx` (new), `components/settings/account-form.tsx` (new) | Salvar nome/telefone via server action; toggle 2FA exibe modal QR (Supabase TOTP); tema salva em cookie e muda `data-theme` |
| T-12-23 | Settings — `/settings/integrations` (status dos provedores: Digital Guru, Brevo, WhatsApp, Notazz; env vars mascaradas; botão "Testar conexão"; logs de falha recentes) | MOD-SETTINGS | ui | cne-ui-author | yes | — | `70-ux/02-information-architecture.md §/settings/integrations` | `app/(app)/settings/integrations/page.tsx` (new), `components/settings/integration-card.tsx` (new) | Card por provedor com status badge; botão testa conexão chama health-check server action; env vars mostram últimos 4 chars |
| T-12-24 | Settings — `/settings/funnels` (lista funis por marca; criar/editar funil; configurar regras de score por evento) | MOD-SETTINGS | ui | cne-ui-author | yes | — | `70-ux/02-information-architecture.md §/settings/funnels`, `20-domain/05-funnel-opportunity.md §Score` | `app/(app)/settings/funnels/page.tsx` (new), `components/settings/funnel-config-form.tsx` (new), `components/settings/score-rule-list.tsx` (new) | CRUD de funis; form de score rule: event_kind + delta + ativo; salva via server actions existentes |
| T-12-25 | Settings — `/settings/audit` (audit_log com filtros: usuário, ação, período, resource_kind, resource_id; download CSV; diff JSON expansível) | MOD-SETTINGS | ui | cne-ui-author | yes | — | `70-ux/02-information-architecture.md §/settings/audit` | `app/(app)/settings/audit/page.tsx` (new), `components/settings/audit-log-table.tsx` (new), `app/(app)/settings/audit/export/route.ts` (new) | Tabela paginada filtrada; diff JSON usa `<pre>` com syntax; export CSV respeita filtros |
| T-12-26 | Settings — Catalog CRUDs completos (forms criar/editar produto, categoria, benefício com validação; deletar com confirmação) | MOD-SETTINGS | ui | cne-ui-author | yes | — | `20-domain/06-catalog.md`, `70-ux/02-information-architecture.md §/settings/catalog` | `app/(app)/settings/catalog/products/page.tsx`, `app/(app)/settings/catalog/categories/page.tsx`, `app/(app)/settings/catalog/benefits/page.tsx`, `components/settings/catalog-*-form.tsx` (new ×3) | Formulários validados com zod; arquivar preserva histórico; deletar rejeita se referenciado em oferta ativa |
| T-12-27 | Analytics — Filtros globais persistidos em `user_preferences.analytics_filters` (marca + período); revalidar todas as páginas ao mudar | MOD-ANALYTICS | ui | cne-ui-author | no | — | `70-ux/08-analytics-dashboards.md §Filtros globais` | `components/analytics/global-filters.tsx`, `app/(app)/analytics/*/page.tsx` (todos), `app/(app)/analytics/actions.ts` (new) | GlobalFilters carrega marcas reais via server action; seleção persiste via `user_preferences`; todas as páginas passam filtros para suas queries |
| T-12-28 | Analytics — `/analytics/atendimento` completo (heatmap volume hora×dia, SLA primeira resposta ≤15min %, tempo resolução médio, top atendentes, volume por canal) | MOD-ANALYTICS | ui | cne-ui-author | yes | T-12-27 | `70-ux/08-analytics-dashboards.md §/analytics/atendimento` | `app/(app)/analytics/atendimento/page.tsx` (ou renomear inbox), `components/analytics/heatmap-chart.tsx` (new), `components/analytics/sla-card.tsx` (new) | Heatmap usa Recharts; SLA calcula % conversas ≤15min via query sobre `conversation` + `message`; top atendentes tabela ordenável |
| T-12-29 | Analytics — Export CSV universal em todos os dashboards + drill-down por clique em card (modal ou rota com filtro pré-aplicado) | MOD-ANALYTICS | ui | cne-ui-author | yes | T-12-27 | `70-ux/08-analytics-dashboards.md §Padrões Comuns` | `app/(app)/analytics/*/export/route.ts` (new ×4), `components/analytics/metric-card.tsx` | Botão "Exportar CSV" em todos os dashboards; clique em card de métrica abre Sheet com tabela detalhada filtrada |
| T-12-30 | Tickets — Tabs detalhe (Descrição/Atividade/Notas/Histórico) + edição inline de título/categoria/prioridade + reatribuição de responsável + filtros completos na lista (/categoria/prioridade/responsável/período) | MOD-TICKET | ui | cne-ui-author | yes | — | `20-domain/03-inbox-ticket.md §T-3-14, T-3-15` | `app/(app)/tickets/[id]/page.tsx`, `app/(app)/tickets/page.tsx`, `components/ticket/ticket-detail-tabs.tsx` (new), `components/ticket/ticket-edit-form.tsx` (new) | Tabs renderizam conteúdo correto; edição inline usa Server Action; reatribuição via dropdown; filtros atualizam URL params |
| T-12-31 | Transactions — Tabs faltantes em `/transactions/[id]` (Parcelas/Assinatura, Direitos, Auditoria, Timeline) + ações menu: reemitir NF-e, cancelar NF-e, reprocessar webhook | MOD-TRANSACTION | ui | cne-ui-author | yes | — | `70-ux/07-transaction-detail.md §Tabs §Ações` | `app/(app)/transactions/[id]/page.tsx`, `components/transaction/tab-installments.tsx` (new), `components/transaction/tab-entitlements.tsx` (new), `components/transaction/tab-audit-log.tsx` (new), `components/transaction/tab-timeline.tsx` (new) | 6 tabs completas; menu dropdown com ações NF-e (chama Inngest job via server action); reprocessar webhook via FLOW-12 |
| T-12-32 | Polimento — AlertDialog com confirmação textual (digitar `CONFIRMAR`) em ações destrutivas: refund, blacklist, excluir produto/categoria, cancelar assinatura | TRANSVERSAL | ui | cne-ui-author | no | T-12-16, T-12-26, T-12-30, T-12-31 | `70-ux/09-interaction-patterns.md §Confirmações Críticas` | `components/ui/confirm-action-dialog.tsx` (new), wiring em componentes relevantes | Componente genérico `ConfirmActionDialog` recebe `requiredText`; botão destrutivo só habilita após match; aplicado em todas as ações destrutivas |
| T-12-33 | Polimento — Skeleton loading e empty states consistentes em todas as listas (contacts, tickets, funnels, transactions, analytics, billing) | TRANSVERSAL | ui | cne-ui-author | no | T-12-32 | `70-ux/09-interaction-patterns.md §Estados de Conteúdo` | `components/contact/contact-list-skeleton.tsx` (new), idem por módulo | Cada lista tem skeleton com mesmo nº de colunas; empty state com ícone + título + CTA; sem flash de conteúdo em branco |

---

## Ondas de paralelização

> Máximo 5 subagents por onda. Verde (`pnpm typecheck && pnpm test`) obrigatório entre ondas.

### Onda A — Shell: components novos (paralelo, 5 subagents)
`T-12-02`, `T-12-03`, `T-12-04`, `T-12-05`, `T-12-06`
→ Todos criam arquivos novos; sem conflito de arquivo.

### Onda B — Shell: restante dos components (paralelo, 2 subagents)
`T-12-07`, `T-12-01`
→ T-12-07 cria `global-banners.tsx`; T-12-01 edita apenas `sidebar.tsx`.

### Onda C — Shell: wiring (serial, 1 subagent)
`T-12-08`
→ Integra todos em `topbar.tsx` + `layout.tsx`. Depende de Onda B.

### Onda D — Contact: tab components (paralelo, 5 subagents)
`T-12-09`, `T-12-10`, `T-12-11`, `T-12-12`, `T-12-13`
→ Todos criam componentes novos em `components/contact/`; sem conflito.

### Onda E — Contact: notas + histórico + form novo (paralelo, 3 subagents)
`T-12-14`, `T-12-15`, `T-12-17`
→ T-12-14 e T-12-15 criam componentes; T-12-17 cria rota nova `/contacts/new`.

### Onda F — Contact: header rico + wiring (serial, 1 subagent)
`T-12-16`
→ Integra 8 tabs em `page.tsx`; edita `contact-header.tsx`. Depende de Ondas D+E.

### Onda G — Funnel + Settings: components/rotas novos (paralelo, 5 subagents)
`T-12-18`, `T-12-19`, `T-12-21`, `T-12-22`, `T-12-23`
→ T-12-18/19/21 criam componentes de funil; T-12-22/23 criam rotas de settings; todos disjuntos.

### Onda H — Funnel + Settings: restante paralelo (paralelo, 4 subagents)
`T-12-24`, `T-12-25`, `T-12-26`, `T-12-30`
→ Settings: rotas novas; T-12-30 edita apenas `/tickets/[id]/page.tsx` + `components/ticket/`.

### Onda I — Funnel: wiring + Analytics: filtros globais (paralelo, 2 subagents)
`T-12-20`, `T-12-27`
→ T-12-20 edita `funnels/[id]/page.tsx`; T-12-27 edita `analytics/*/page.tsx` + `components/analytics/global-filters.tsx`. Arquivos disjuntos.

### Onda J — Analytics: dashboards + Transactions (paralelo, 3 subagents)
`T-12-28`, `T-12-29`, `T-12-31`
→ T-12-28 edita `/analytics/atendimento/`; T-12-29 cria rotas de export; T-12-31 edita `/transactions/[id]/`. Disjuntos.

### Onda K — Polimento serial (serial, 2 tarefas sequenciais)
`T-12-32` → `T-12-33`
→ T-12-32 cria `ConfirmActionDialog` e faz wiring em múltiplos arquivos; T-12-33 adiciona skeletons/empty states. Serial por tocar muitos arquivos.

---

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde (baseline ≥ 1163 testes).
- [ ] `pnpm test:e2e` verde (specs existentes não regridem).
- [ ] Shell smoke: sidebar mostra 8 módulos; brand switcher funciona; cmd+K abre palette; `g i` navega para /inbox; `?` exibe dialog de atalhos.
- [ ] Detalhe contato: 8 tabs presentes; header com avatar/tags/menu; `/contacts/new` abre e salva.
- [ ] Funnel: arrastar para "ganho" abre modal pedindo transaction_id; toggle Board/Lista funciona; sheet lateral abre ao clicar card.
- [ ] Settings: `/settings/account`, `/settings/integrations`, `/settings/funnels`, `/settings/audit` acessíveis e funcionais.
- [ ] Analytics: GlobalFilters carrega marcas reais; `/analytics/atendimento` exibe heatmap; botão CSV funciona em ≥ 2 dashboards.
- [ ] Deploy preview verde (sem 500 em rotas novas).

## Riscos e mitigação

- **Wiring do shell pode quebrar rotas existentes.** Mitigação: Onda C executa depois de todas as Ondas A+B; subagent faz smoke em 3 rotas antes de retornar.
- **Tabs do contato fazem N+1 queries.** Mitigação: cada tab é renderizada sob demanda (lazy); queries são server-side com `db.select` direto, sem waterfall.
- **brand-switcher precisa propagar `brand_id` para todas as server actions.** Mitigação: T-12-02 persiste em cookie `cne_brand_id`; server actions leem cookie via `cookies()` do Next.js (já presente em alguns módulos — verificar padrão existente).
- **`/analytics/atendimento` sem views materializadas dedicadas.** Mitigação: T-12-28 usa queries simples sobre `conversation` + `message` com índices existentes; MV dedicada é Fase 2 via OQ-SPRINT12-01.
- **Onda K toca muitos arquivos (`T-12-32`).** Mitigação: subagent lista explicitamente cada ponto de wiring antes de editar; usa grep para localizar chamadas de refund/blacklist/delete.

## Open Questions

- `OQ-SPRINT12-01` — `/analytics/atendimento` deve usar MV dedicada ou query direta? Fase 1: query direta; MV fica para Sprint 13 se performance ruim.
- `OQ-SPRINT12-02` — brand-switcher persiste em cookie ou em `user_preferences` (banco)? Decisão: cookie `cne_brand_id` (leitura mais rápida, sem round-trip ao banco).
- `OQ-SPRINT12-03` — editor de oferta permanece como tabs ou deve migrar para wizard 3-passos como a doc descreve? Pendente decisão do usuário (ver plano de auditoria 2026-04-25, seção F).
- `OQ-SPRINT12-04` — `/billing/invoices` e `/billing/plans` estão no escopo da Fase 1? Não incluídos neste sprint; confirmar antes de Sprint 13.
