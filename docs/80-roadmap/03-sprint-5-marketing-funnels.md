# Sprint 5 — Marketing + Funnels  (duração: 3 semanas)

## Objetivo

Entregar os agregados **Campaign/Creative** (MOD-CAMPAIGN) e **Funnel/Opportunity** (MOD-FUNNEL): campanhas por marca apontando para 1 funil, criativos com canais e UTMs deterministas, links rastreáveis com short-URL, funis com estágios ordenados, oportunidades únicas ativas por `(contact, funnel)`, score configurável e metas. UI kanban do funil permite drag-drop entre estágios com histórico append-only. Atribuição de origem de entrada e de conversão (FLOW-14) funciona end-to-end.

## Entregáveis (outcomes)

- Schemas `campaign`, `creative`, `creative_asset`, `trackable_link` aplicados.
- Função pura `generateUtm` determinista com testes.
- Encurtador de URL interno (rota `/go/[slug]` que redireciona + emite `TE-CAMPAIGN-CLICK`).
- Schemas `funnel`, `funnel_stage`, `funnel_entry`, `funnel_entry_stage_history`, `funnel_entry_score_history`, `funnel_score_rule`, `sales_target`, `opportunity_tag`.
- Funções `enterFunnel`, `moveStage`, `setOpportunityLabel`, `markWon`, `markLost`, `recomputeScore`.
- UI `/campaigns` CRUD + `/funnels/[id]` kanban drag-drop.
- UI `/funnels/[id]/targets` gerenciamento de metas.
- E2E `flow-14-campaign-attribution.spec.ts` verde.

## Pré-requisitos (sprints anteriores concluídos)

- Sprint 0 (base + timeline).
- Sprint 1-2 (contact, classificação).
- Sprint 3-4 (inbox para gatilho de score opcional).

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-5-01 | Schema `campaign` + `creative` + `creative_asset` | MOD-CAMPAIGN | schema | no | — | `20-domain/07-campaign-creative.md` §3 | `lib/db/schema/campaign.ts`, `lib/db/schema/index.ts` | `uq_campaign_slug_brand` barra slug duplicado; migration verde |
| T-5-02 | Schema `trackable_link` + `content_library_item` (stub) | MOD-CAMPAIGN | schema | yes | T-5-01 | `20-domain/07-campaign-creative.md` §3 | `lib/db/schema/campaign.ts` (adicional) | `uq_trackable_link_slug` globalmente único |
| T-5-03 | Função pura `generateUtm` (determinista) | MOD-CAMPAIGN | domain | yes | — | `20-domain/07-campaign-creative.md` §9 | `lib/domain/campaign/generate-utm.ts`, `tests/unit/campaign/generate-utm.test.ts` | Mesmos inputs → mesmo output; 6 testes cobrindo overrides e ausências |
| T-5-04 | Server Actions `createCampaign`, `createCreative`, `issueTrackableLink` | MOD-CAMPAIGN | api | yes | T-5-01, T-5-02, T-5-03 | `20-domain/07-campaign-creative.md` §2 | `app/(app)/campaigns/actions.ts` | `issueTrackableLink` persiste UTM snapshot em jsonb |
| T-5-05 | Rota `/go/[slug]` redirect + emit `TE-CAMPAIGN-CLICK` | MOD-CAMPAIGN | api | yes | T-5-04 | `20-domain/07-campaign-creative.md` §8, FLOW-CAMPAIGN-CLICK | `app/go/[slug]/route.ts`, `lib/timeline/schemas/campaign-click.ts` | Clique redireciona 302 + emite TE assíncrono via Inngest; não bloqueia latência |
| T-5-06 | UI `/campaigns` lista + criação + detalhe com criativos e links | MOD-CAMPAIGN | ui | yes | T-5-04 | `70-ux` | `app/(app)/campaigns/page.tsx`, `app/(app)/campaigns/[id]/page.tsx`, `components/campaign/**` | CRUD completo; preview UTM antes de publicar link |
| T-5-07 | Schema `funnel` + `funnel_stage` | MOD-FUNNEL | schema | no | — | `20-domain/08-funnel-opportunity.md` §3 | `lib/db/schema/funnel.ts`, `lib/db/schema/index.ts` | `uq_funnel_stage_position` barra duplicidade de posição |
| T-5-08 | Schema `funnel_entry` + índice único parcial oportunidade ativa | MOD-FUNNEL | schema | yes | T-5-07 | `20-domain/08-funnel-opportunity.md` INV-FUNNEL-01 | `lib/db/schema/funnel.ts` (adicional) | `uq_funnel_entry_active` barra 2ª oportunidade ativa |
| T-5-09 | Schemas `funnel_entry_stage_history`, `funnel_entry_score_history`, `funnel_score_rule`, `sales_target`, `opportunity_tag` + triggers append-only | MOD-FUNNEL | schema | yes | T-5-08 | `20-domain/08-funnel-opportunity.md` §3 | `lib/db/schema/funnel.ts` (adicional), `supabase/migrations/0030_funnel_triggers.sql` | UPDATE/DELETE em history rejeitados |
| T-5-10 | Funções domínio `enterFunnel`, `moveStage`, `setOpportunityLabel` | MOD-FUNNEL | domain | no | T-5-08, T-5-09 | `20-domain/08-funnel-opportunity.md` §2; `BR-FUNNEL-OPPORTUNITY` | `lib/domain/funnel/enter.ts`, `lib/domain/funnel/move-stage.ts`, `lib/domain/funnel/label.ts`, `tests/unit/funnel/**` | `enterFunnel` idempotente (2ª chamada mesma (contact,funnel) retorna a existente); emite `TE-FUNNEL-*` |
| T-5-11 | Funções `markWon`, `markLost`, `recomputeScore` | MOD-FUNNEL | domain | yes | T-5-10 | idem | `lib/domain/funnel/won.ts`, `lib/domain/funnel/lost.ts`, `lib/domain/funnel/score.ts`, `tests/unit/funnel/score.test.ts` | `markWon` exige transaction_id; preenche `conversion_*`; regra de score `+delta` registra em history |
| T-5-12 | Server Actions funnel: CRUD + movimentação + metas | MOD-FUNNEL | api | yes | T-5-10, T-5-11 | `20-domain/08-funnel-opportunity.md` §2 | `app/(app)/funnels/actions.ts`, `app/(app)/funnels/[id]/targets/actions.ts` | Drag-drop chama `moveStage` via optimistic UI |
| T-5-13 | UI `/funnels` lista + `/funnels/[id]` kanban drag-drop | MOD-FUNNEL | ui | yes | T-5-12 | `70-ux`; `@dnd-kit/core` | `app/(app)/funnels/page.tsx`, `app/(app)/funnels/[id]/page.tsx`, `components/funnel/kanban.tsx`, `components/funnel/stage-column.tsx`, `components/funnel/opportunity-card.tsx` | Arrastar card entre colunas atualiza estágio + emite TE; reverte em erro |
| T-5-14 | UI `/funnels/[id]/targets` metas | MOD-FUNNEL | ui | yes | T-5-12 | — | `app/(app)/funnels/[id]/targets/page.tsx`, `components/funnel/target-form.tsx` | Criar meta por período; exibe % atingido (placeholder — analytics Sprint 10) |
| T-5-15 | Schemas zod dos novos TEs (funnel + campaign) | MOD-TIMELINE | domain | yes | T-5-05, T-5-10 | `30-contracts/03-timeline-event-catalog.md` | `lib/timeline/schemas/funnel-*.ts`, `lib/timeline/schemas/opportunity-*.ts` | `emitTimelineEvent` valida; 1 teste por kind |
| T-5-16 | Atribuição de entrada/conversão (FLOW-14) | MOD-FUNNEL | integration | yes | T-5-10, T-5-05 | `FLOW-14`; `20-domain/08-funnel-opportunity.md` §10 cases 3,4 | `lib/domain/funnel/attribution.ts`, `tests/integration/funnel/attribution.test.ts` | Clique com UTM → entrada em funil com `entry_campaign_id`/`entry_creative_id`; `markWon` copia para `conversion_*` |
| T-5-17 | E2E `flow-14-campaign-attribution.spec.ts` | MOD-FUNNEL | test | yes | T-5-13, T-5-16 | `FLOW-14` | `tests/e2e/flow-14-campaign-attribution.spec.ts` | Criar campaign → gerar link → clicar → entrar funil → markWon stub → verificar `conversion_*` preenchidos |

## Ondas de paralelização sugeridas

**Onda A (paralelo, 3 subagents):** T-5-01, T-5-03, T-5-07
→ 2 schemas distintos + função pura.

**Onda B (serial em cada arquivo):** T-5-02 (após T-5-01), T-5-08 → T-5-09 (após T-5-07).

**Onda C (paralelo, 2 subagents, depende de B):** T-5-04, T-5-10
→ Server actions campaign + domínio funnel. Arquivos disjuntos.

**Onda D (paralelo, 3 subagents, depende de C):** T-5-05, T-5-11, T-5-15
→ Route `/go`, domínio won/lost/score, schemas zod.

**Onda E (paralelo, 2 subagents, depende de D):** T-5-06, T-5-12
→ UI campaigns + server actions funnel.

**Onda F (paralelo, 3 subagents, depende de E):** T-5-13, T-5-14, T-5-16
→ Kanban, metas, attribution.

**Onda G (serial, depende de F):** T-5-17.

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] E2E `flow-14-campaign-attribution` verde.
- [ ] `generateUtm` 100% coberto por testes.
- [ ] Drag-drop kanban não perde estado em erro de rede (rollback UI).
- [ ] Índice `uq_funnel_entry_active` testado com teste de integração.
- [ ] Deploy em staging verde.

## Riscos e mitigação

- **Drag-drop concorrente corrompe `current_stage_id`.** Mitigação: T-5-12 usa server action com `SELECT ... FOR UPDATE`.
- **Encurtador de URL gera colisão de slug.** Mitigação: `uq_trackable_link_slug`; gerador usa hash de entropia suficiente.
- **Regra de score acoplada demais ao kind do evento.** Mitigação: `funnel_score_rule.event_kind` aceita wildcards; OQ-FUNNEL-03 documenta limites.
- **Oportunidade duplicada por race.** Mitigação: T-5-10 `enterFunnel` idempotente sob advisory lock por (contact,funnel).

## Open Questions

- `OQ-SPRINT5-01` — encurtador in-house vs Bitly (decisão em `OQ-CAMPAIGN-01`). Fase 1 in-house.
- `OQ-SPRINT5-02` — % meta é calculado em UI ou materializado? Hoje calculado em query; review no Sprint 10.
