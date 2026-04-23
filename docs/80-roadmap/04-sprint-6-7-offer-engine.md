# Sprint 6-7 — Offer Engine  (duração: 4 semanas)

## Objetivo

Entregar o **coração comercial do sistema**: catálogo (MOD-CATALOG) e motor de ofertas (MOD-OFFER). O motor modela ofertas com múltiplas condições (AND/OR com nesting), itens (produto/benefício), opções de pagamento, prioridade + score + timestamp para desempate e contador atômico de vendas. Entrega a função `selectCondition(offerId, ctx)` que decide a condição aplicada a uma venda, a função `evaluateEligibility` recursiva, e o `offer_sales_counter` com incremento atômico (aceitando excesso conforme ADR-07). UI do offer builder permite criar ofertas complexas com preview/simulador e editor visual de regras. E2E `FLOW-04-offer-condition-decision` verde com todos os casos de desempate e conflito.

Este sprint estabelece a forma do módulo mais crítico do produto — nenhum outro depende dele, mas MOD-TRANSACTION (Sprint 8) consome todas as interfaces públicas aqui definidas.

## Entregáveis (outcomes)

- Schemas `product`, `product_category`, `commercial_benefit` (MOD-CATALOG).
- CRUD UI de produtos, categorias e benefícios com arquivamento preservando histórico.
- Schemas `offer`, `offer_condition`, `offer_condition_rule_group`, `offer_condition_rule`, `offer_condition_item`, `offer_payment_option`, `offer_sales_counter`, `offer_status_history`, `offer_condition_priority_history` aplicados.
- Função pura `selectCondition` com algoritmo priority → score → timestamp → conflict.
- Função pura `evaluateEligibility` com suporte a AND/OR e nesting.
- Contador atômico `incrementSalesCounter` (UPDATE RETURNING) aceitando excesso por ADR-07.
- UI `/offers` com offer builder visual: condições, editor de regras (drag-drop de grupos), itens, payment options.
- Preview/simulador: dado um contexto (data, campaign, canal), retorna qual condição seria selecionada e por quê.
- Triggers append-only para `offer_status_history` e `offer_condition_priority_history`.
- E2E `flow-04-offer-condition-decision.spec.ts` com 6 cenários.
- Guard de imutabilidade de `issuing_legal_entity_id` após primeira venda (ativado só após Sprint 8; schema pronto).

## Pré-requisitos (sprints anteriores concluídos)

- Sprint 0 (schemas ORG, legal_entity, brand).
- Sprint 5 (campaign, creative — referenciados por regras `campaign`/`creative`).
- Sprint 1-2 (contact para `ctx.contactId`).

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-6-01 | Schema `product_category` + `product` | MOD-CATALOG | schema | no | — | `20-domain/09-catalog.md` §3 | `lib/db/schema/catalog.ts`, `lib/db/schema/index.ts` | `uq_product_brand_slug` barra duplicado; CHECK `ck_product_slug_kebab` barra camelCase |
| T-6-02 | Schema `commercial_benefit` | MOD-CATALOG | schema | yes | T-6-01 | `20-domain/09-catalog.md` §3.3 | `lib/db/schema/catalog.ts` (adicional) | Tabela aplicada; `uq_commercial_benefit_brand_slug` funciona |
| T-6-03 | Domínio catálogo: normalização slug + helpers + resolveAutoTag | MOD-CATALOG | domain | yes | T-6-01, T-6-02 | `20-domain/09-catalog.md` §2 interfaces | `lib/domain/catalog/normalize.ts`, `lib/domain/catalog/auto-tag.ts`, `tests/unit/catalog/**` | Kebab-case enforçado; `resolveAutoTag` retorna tag do benefício ou null |
| T-6-04 | Server Actions + UI catálogo (produtos, categorias, benefícios) | MOD-CATALOG | ui | yes | T-6-03 | `20-domain/09-catalog.md` §2 Ownership | `app/(app)/settings/catalog/products/**`, `app/(app)/settings/catalog/categories/**`, `app/(app)/settings/catalog/benefits/**`, `app/(app)/settings/catalog/*/actions.ts` | CRUD completo; arquivar produto com referência ativa rejeitado |
| T-6-05 | Schema `offer` + CHECK renewal + FK legal_entity | MOD-OFFER | schema | no | — | `20-domain/10-offer-engine.md` §3.1, §3.9; ADR-02 | `lib/db/schema/offer.ts`, `lib/db/schema/index.ts` | CHECK `ck_offer_renewal_requires_ref` barra inconsistência; migration verde |
| T-6-06 | Schema `offer_condition` + índice único default por oferta ativa | MOD-OFFER | schema | no | T-6-05 | `20-domain/10-offer-engine.md` §3.2, INV-OFFER-01 | `lib/db/schema/offer.ts` (adicional) | `uq_offer_condition_default_per_offer` impede 2 defaults ativos |
| T-6-07 | Schema `offer_condition_rule_group` (+ auto-ref) + grupo raiz único | MOD-OFFER | schema | yes | T-6-06 | `20-domain/10-offer-engine.md` §3.3, INV-OFFER-05 | `lib/db/schema/offer.ts` (adicional) | `uq_offer_rule_group_root` barra 2º root por condição |
| T-6-08 | Schema `offer_condition_rule` + validação params por kind (runtime) | MOD-OFFER | schema | yes | T-6-07 | `20-domain/10-offer-engine.md` §3.4, §3.4.1 | `lib/db/schema/offer.ts` (adicional), `lib/domain/offer/rule-params-schema.ts` | Server Action valida `params` vs zod por `kind`; rule sem grupo rejeita |
| T-6-09 | Schema `offer_condition_item` + CHECK ref exclusive | MOD-OFFER | schema | yes | T-6-06, T-6-02 | `20-domain/10-offer-engine.md` §3.5, INV-OFFER-07 | `lib/db/schema/offer.ts` (adicional) | CHECK `ck_offer_condition_item_ref_exclusive` funciona; item `commercial_benefit` sem benefit_id rejeitado |
| T-6-10 | Schema `offer_payment_option` + CHECK installments > 1 | MOD-OFFER | schema | yes | T-6-06 | `20-domain/10-offer-engine.md` §3.6, INV-OFFER-08 | `lib/db/schema/offer.ts` (adicional) | CHECK barra `method='installments' AND installments=1` |
| T-6-11 | Schema `offer_sales_counter` + seed por oferta na criação | MOD-OFFER | schema | yes | T-6-05 | `20-domain/10-offer-engine.md` §3.7, INV-OFFER-09 | `lib/db/schema/offer.ts` (adicional) | Trigger on INSERT de `offer` cria linha em `offer_sales_counter` com `approved_count=0` |
| T-6-12 | Schema `offer_status_history` + `offer_condition_priority_history` + triggers | MOD-OFFER | schema | yes | T-6-06 | `20-domain/10-offer-engine.md` §3.8 | `lib/db/schema/offer.ts` (adicional), `supabase/migrations/0040_offer_triggers.sql` | UPDATE/DELETE bloqueados |
| T-6-13 | Função pura `evaluateEligibility` (árvore AND/OR com nesting) | MOD-OFFER | domain | no | T-6-08 | `BR-OFFER-ELIGIBILITY`; `20-domain/10-offer-engine.md` §11 | `lib/domain/offer/eligibility.ts`, `tests/unit/offer/eligibility.test.ts` | 10 testes cobrindo AND/OR aninhados, date_range, sales_count_reached, campaign, channel, creative, internal_use |
| T-6-14 | Função pura `selectCondition` (priority → score → timestamp → conflict) | MOD-OFFER | domain | no | T-6-13 | `BR-OFFER-DECISION`; `20-domain/10-offer-engine.md` §11 | `lib/domain/offer/decision.ts`, `tests/unit/offer/decision.test.ts` | 8 testes: fallback default, priority wins, score tiebreak, timestamp tiebreak, conflict, `kind='conflict'` retorna lista |
| T-6-15 | Função `incrementSalesCounter` (atomic UPDATE RETURNING) | MOD-OFFER | domain | yes | T-6-11 | ADR-07; `20-domain/10-offer-engine.md` §3.7 concurrency | `lib/domain/offer/sales-counter.ts`, `tests/integration/offer/sales-counter.test.ts` | Teste concorrência 10 conexões simultâneas → monotônico, excesso aceito; nunca decresce |
| T-6-16 | Server Actions oferta: CRUD offer + condições + regras + itens + payment options | MOD-OFFER | api | no | T-6-13, T-6-14 | `20-domain/10-offer-engine.md` §2 | `app/(app)/offers/actions.ts` | Publicar oferta sem default ativa rejeita com mensagem clara; mudança de `issuing_legal_entity_id` após venda bloqueada (guard — stub até Sprint 8) |
| T-6-17 | UI `/offers` lista + criação | MOD-OFFER | ui | yes | T-6-16 | `70-ux`; shadcn | `app/(app)/offers/page.tsx`, `app/(app)/offers/new/page.tsx`, `components/offer/offer-list.tsx` | Lista filtra por marca + status |
| T-6-18 | UI `/offers/[id]` detail tabs: condições, regras, itens, payment options | MOD-OFFER | ui | no | T-6-17 | `70-ux` | `app/(app)/offers/[id]/page.tsx`, `components/offer/condition-tabs.tsx`, `components/offer/payment-options-editor.tsx` | Cada aba edita sua seção isoladamente |
| T-6-19 | UI editor visual de regras (drag-drop AND/OR nesting) | MOD-OFFER | ui | yes | T-6-18 | `OQ-OFFER-01`; `@dnd-kit/core` | `components/offer/rule-group-editor.tsx`, `components/offer/rule-node.tsx`, `components/offer/rule-param-form.tsx` | Usuário cria grupo `OR` contendo 2 sub-grupos `AND`; persiste árvore válida |
| T-6-20 | UI editor visual de itens (produto vs benefício + vigência + quantidade) | MOD-OFFER | ui | yes | T-6-18 | `20-domain/10-offer-engine.md` §3.5 | `components/offer/item-editor.tsx`, `components/offer/item-row.tsx` | Seletor `kind` troca entre produto/benefício; CHECK exclusive refletido na UI |
| T-6-21 | Preview/simulador: dado DecisionContext, mostra qual condição seria selecionada e por quê | MOD-OFFER | ui | yes | T-6-14, T-6-18 | `20-domain/10-offer-engine.md` §11 | `app/(app)/offers/[id]/preview/page.tsx`, `components/offer/decision-preview.tsx`, `app/(app)/offers/[id]/preview/actions.ts` | Formulário de contexto → chama `selectCondition` → mostra árvore de avaliação; mostra conflict com lista |
| T-6-22 | Guard de imutabilidade `issuing_legal_entity_id` (trigger + guard app) | MOD-OFFER | schema | yes | T-6-05 | INV-OFFER-03 | `supabase/migrations/0041_offer_legal_entity_guard.sql`, `lib/domain/offer/guards.ts` | UPDATE em `issuing_legal_entity_id` com venda approved/pending rejeita (placeholder até Sprint 8 — teste de verificação com fixture) |
| T-6-23 | E2E `flow-04-offer-decision.spec.ts` (6 cenários) | MOD-OFFER | test | yes | T-6-21 | `FLOW-04`; `BR-OFFER-DECISION`; `BR-OFFER-ELIGIBILITY` | `tests/e2e/flow-04-offer-decision.spec.ts` | Cenários: fallback default, priority win, score tiebreak, sales_count_reached, campaign match, conflict |
| T-6-24 | Testes integração: oferta complexa com todos os kinds de regra | MOD-OFFER | test | yes | T-6-14 | `20-domain/10-offer-engine.md` §10 | `tests/integration/offer/complex-offer.test.ts` | Oferta com 5 condições, 3 grupos aninhados, 4 kinds de regra avalia corretamente em 12 contextos |
| T-6-25 | Histórico de mudança de priority/score emite event + blocks update in place | MOD-OFFER | domain | yes | T-6-12 | INV-OFFER-02 | `lib/domain/offer/priority-history.ts`, `tests/integration/offer/priority-history.test.ts` | Mudar priority grava linha em `offer_condition_priority_history` + `audit_log` |

## Ondas de paralelização sugeridas

**Onda A (paralelo, 2 subagents):** T-6-01, T-6-05
→ Arquivos distintos (`catalog.ts`, `offer.ts`).

**Onda B (paralelo em arquivos distintos, serial por arquivo):**
- `catalog.ts`: T-6-02 após T-6-01.
- `offer.ts`: T-6-06 após T-6-05.
→ 2 subagents.

**Onda C (serial em `offer.ts`):** T-6-07 → T-6-08 → T-6-09 → T-6-10 → T-6-11 → T-6-12.
→ Todos tocam `offer.ts` — executar em sequência (1 tarefa por PR).
→ **Paralelo em arquivo separado:** T-6-03 (catálogo domain) durante esta onda.

**Onda D (paralelo, 3 subagents, depende de C):** T-6-04, T-6-13, T-6-15
→ UI catálogo + `eligibility.ts` + `sales-counter.ts`, arquivos disjuntos.

**Onda E (serial, depende de D):** T-6-14 (depende de `evaluateEligibility`).

**Onda F (paralelo, 2 subagents, depende de E):** T-6-16, T-6-22
→ Server actions + guard.

**Onda G (serial, depende de F):** T-6-17 estabelece shell da UI.

**Onda H (paralelo, 3 subagents, depende de G):** T-6-18, T-6-19, T-6-20
→ Detail tabs + rule editor + item editor (arquivos disjuntos em `components/offer/`).

**Onda I (paralelo, 2 subagents, depende de H):** T-6-21, T-6-25.

**Onda J (paralelo, 2 subagents, depende de I):** T-6-23, T-6-24.

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] `pnpm test:e2e flow-04-offer-decision` verde (6 cenários).
- [ ] `selectCondition` e `evaluateEligibility` com >95% coverage.
- [ ] Teste de concorrência do counter passa com 10 conexões simultâneas.
- [ ] Offer builder cria oferta com 5 condições + 3 grupos aninhados + 4 kinds de regra sem reload.
- [ ] Simulador mostra resultado correto para todos os 12 contextos canônicos em `BR-OFFER-DECISION`.
- [ ] Nenhuma OQ nova bloqueante além de `OQ-OFFER-01..05`.
- [ ] Deploy em staging verde.

## Riscos e mitigação

- **Algoritmo `selectCondition` com bug sutil em desempate.** Mitigação: T-6-14 tem 8 testes Given/When/Then cobrindo cada ramo; T-6-23 E2E com DB real.
- **Editor visual de regras cria árvore inválida (grupo órfão, sem raiz).** Mitigação: T-6-19 valida antes de persistir; T-6-08 bloqueia no DB via FK NOT NULL e `uq_offer_rule_group_root`.
- **Contador com excesso gerando frustração em suporte.** Mitigação: ADR-07 documenta; UI do counter mostra "N/30 (pode exceder)".
- **Muitas tarefas no mesmo arquivo `schema/offer.ts`.** Mitigação: executar serialmente em `offer.ts`; Onda C é sequencial intencional.
- **`sales_count_reached` avaliado antes do counter → condições atômicas desalinhadas.** Mitigação: T-6-14 documenta que avaliação de elegibilidade lê counter dentro da transação SQL que aprova a venda; MOD-TRANSACTION (Sprint 8) orquestra.
- **Guard de `issuing_legal_entity_id` precisa de MOD-TRANSACTION.** Mitigação: T-6-22 entrega trigger SQL, verificação completa só no Sprint 8.

## Open Questions

- `OQ-SPRINT67-01` — editor visual usa JSON canônico para regras ou forma tabelar? Hoje JSON-tree (mais flexível).
- `OQ-SPRINT67-02` — simulador deveria permitir criar contexto a partir de um contato real (auto-fill)? Fase 1 não; campo manual.
- `OQ-SPRINT67-03` — counter tem "reset" manual para reuso em próxima campanha? Hoje não, cria oferta nova.
