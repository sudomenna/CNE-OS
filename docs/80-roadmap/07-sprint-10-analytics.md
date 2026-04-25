# Sprint 10 — Analytics  (duração: 2 semanas)

## Objetivo

Entregar visão consolidada de **métricas por marca** sem vazamento entre marcas: dashboards de vendas (conversão, ticket médio, inadimplência), inbox (volume, tempo de resposta), funis (entrada/conversão/cycle time), reembolsos (taxa, motivos), campanhas (UTM → conversão). Materializa views e materialized views de agregação refrescadas via Inngest, com filtros globais (marca, período, funil, campanha) respeitando RLS.

## Entregáveis (outcomes)

- Views SQL canônicas de domínio (`v_transaction_approved`, `v_funnel_conversion`, `v_inbox_sla`, `v_delinquency_aging`, `v_campaign_roi`).
- Materialized views refrescadas a cada hora via Inngest cron (`mv_sales_by_brand_day`, `mv_funnel_stage_conversion`, `mv_inbox_daily`, `mv_campaign_attribution`).
- Dashboards `/analytics/sales`, `/analytics/inbox`, `/analytics/funnels`, `/analytics/refunds`, `/analytics/campaigns`, `/analytics/overview`.
- Componente `<GlobalFilters />` (marca, período, funil, campanha) persistindo em URL.
- Export CSV/XLSX por dashboard.
- RLS respeitado em todas as views: usuário de marca A não vê agregados de marca B.

## Pré-requisitos (sprints anteriores concluídos)

- Sprints 0-9 (todos os agregados com dados).

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-10-01 | Views SQL `v_transaction_approved`, `v_refund`, `v_delinquency_aging` com RLS | analytics | schema | yes | — | `20-domain/11,14,13`; RLS Fase 1 | `supabase/migrations/0070_analytics_views_sales.sql` | View filtra por `auth.jwt() -> brand_ids`; teste integração com 2 JWTs valida isolamento |
| T-10-02 | Views SQL `v_funnel_conversion`, `v_inbox_sla`, `v_campaign_roi` | analytics | schema | yes | — | `20-domain/05,08,07` | `supabase/migrations/0071_analytics_views_ops.sql` | Mesmos testes de RLS |
| T-10-03 | Materialized view `mv_sales_by_brand_day` + índices | analytics | schema | yes | T-10-01 | — | `supabase/migrations/0072_mv_sales.sql` | MV criada; REFRESH MATERIALIZED VIEW CONCURRENTLY funciona |
| T-10-04 | Materialized views `mv_funnel_stage_conversion`, `mv_inbox_daily`, `mv_campaign_attribution` | analytics | schema | yes | T-10-02 | — | `supabase/migrations/0073_mv_ops.sql` | 3 MVs com índices; REFRESH CONCURRENTLY verde |
| T-10-05 | Cron Inngest `analytics-refresh-hourly` | analytics | integration | yes | T-10-03, T-10-04 | — | `inngest/functions/analytics-refresh.ts`, `tests/integration/analytics/refresh.test.ts` | Roda 1x/h; logs duração; falha não bloqueia UI (lê view base como fallback) |
| T-10-06 | Queries de leitura + adapter TS tipado | analytics | domain | yes | T-10-03, T-10-04 | — | `lib/analytics/queries/**`, `lib/analytics/types.ts`, `tests/unit/analytics/**` | Funções puras recebem filtros, retornam shape estável |
| T-10-07 | Componente `<GlobalFilters />` persistido em URL + hook `useAnalyticsFilters` | analytics | ui | yes | — | — | `components/analytics/global-filters.tsx`, `lib/hooks/use-analytics-filters.ts` | Filtros refletem em URL; navegação preserva estado |
| T-10-08 | Dashboard `/analytics/overview` | analytics | ui | yes | T-10-06, T-10-07 | — | `app/(app)/analytics/page.tsx`, `components/analytics/overview-cards.tsx` | Top-level KPIs: receita, conversão, inadimplência, SLA |
| T-10-09 | Dashboard `/analytics/sales` + export | analytics | ui | yes | T-10-06, T-10-07 | — | `app/(app)/analytics/sales/page.tsx`, `app/(app)/analytics/sales/export/route.ts`, `components/analytics/sales-charts.tsx` | Série temporal + breakdown por oferta; export CSV |
| T-10-10 | Dashboard `/analytics/funnels` | analytics | ui | yes | T-10-06, T-10-07 | — | `app/(app)/analytics/funnels/page.tsx`, `components/analytics/funnel-conversion.tsx` | Funil visual por estágio; cycle time médio |
| T-10-11 | Dashboard `/analytics/inbox` | analytics | ui | yes | T-10-06, T-10-07 | — | `app/(app)/analytics/inbox/page.tsx`, `components/analytics/inbox-heatmap.tsx` | Volume por canal; tempo médio de resposta; heatmap por hora |
| T-10-12 | Dashboard `/analytics/campaigns` | analytics | ui | yes | T-10-06, T-10-07 | — | `app/(app)/analytics/campaigns/page.tsx`, `components/analytics/campaign-roi.tsx` | Conversão por UTM; custo por conversão (placeholder se sem custo) |
| T-10-13 | Dashboard `/analytics/refunds` | analytics | ui | yes | T-10-06, T-10-07 | — | `app/(app)/analytics/refunds/page.tsx`, `components/analytics/refund-reasons.tsx` | Taxa de refund; top motivos; por oferta |
| T-10-14 | Teste integração isolamento multi-marca em TODAS as views | analytics | test | yes | T-10-01, T-10-02 | RLS | `tests/integration/analytics/multi-brand-isolation.test.ts` | Seed 2 marcas; JWT A não vê dados de marca B em nenhuma view/MV |
| T-10-15 | E2E `analytics-smoke.spec.ts` | analytics | test | yes | T-10-13 | — | `tests/e2e/analytics-smoke.spec.ts` | Cada dashboard carrega <3s com seed de 500 transações |

## Ondas de paralelização sugeridas

**Onda A (paralelo, 2 subagents):** T-10-01, T-10-02.

**Onda B (paralelo, 2 subagents, depende de A):** T-10-03, T-10-04.

**Onda C (paralelo, 3 subagents, depende de B):** T-10-05, T-10-06, T-10-07.

**Onda D (paralelo, 6 subagents, depende de C):** T-10-08, T-10-09, T-10-10, T-10-11, T-10-12, T-10-13.

**Onda E (paralelo, 2 subagents, depende de D):** T-10-14, T-10-15.

## Critério de aceite do sprint (DoD)

- [x] Todos os T-IDs em `completed`.
- [x] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [x] E2E analytics-smoke verde.
- [x] Teste de isolamento multi-marca verde em todas as views.
- [x] Todos os dashboards carregam <3s em staging.
- [x] Export CSV funciona e respeita RLS.
- [x] Deploy em staging verde.

## Riscos e mitigação

- **MV CONCURRENTLY exige índice único.** Mitigação: T-10-03 e T-10-04 declaram índice único em cada MV.
- **RLS em MV é tricky (SECURITY DEFINER).** Mitigação: alternativa — MV sem RLS + view pública com `WHERE brand_id = ANY (user_brand_ids())`. Documentar escolha em ADR follow-up.
- **Dashboard lento com muitos joins.** Mitigação: MVs são agregadas por (brand, day); queries leem só agregados.
- **Fuso horário em séries temporais.** Mitigação: tudo em UTC no DB; UI aplica timezone do usuário.

## Open Questions

- `OQ-SPRINT10-01` — RLS em MV via SECURITY DEFINER vs view pública com função? Decidir em T-10-01.
- `OQ-SPRINT10-02` — custo/orçamento de campanha (para ROI real) entra na Fase 1 ou 2? Hoje placeholder.
- `OQ-SPRINT10-03` — dashboards precisam de drill-down (clicar no KPI → lista)? Fase 1 só leitura.
