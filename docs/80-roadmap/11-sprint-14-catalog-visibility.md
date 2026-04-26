# Sprint 14 — Catálogo acessível + visibilidade produto↔oferta (iniciado 2026-04-26)

## Objetivo

Expor o módulo de catálogo na navegação de settings e tornar bidirecional a relação produto↔oferta: produtos sabem em quais ofertas aparecem, e a UI reflete isso com badge clicável e página de detalhe.

## Entregáveis (outcomes)

- Card "Catálogo" visível em `/settings` + hub page `/settings/catalog` com 3 seções (Produtos, Categorias, Benefícios).
- Coluna "Ofertas" na lista de produtos mostrando contagem clicável.
- Página `/settings/catalog/products/[id]` com detalhe do produto e tabela de ofertas que o contêm.

## Pré-requisitos

- Sprint 13 verde (1200 testes Vitest, typecheck limpo). ✅ concluído em 2026-04-26.

## Status atual

> Última atualização: 2026-04-26 — Sprint 14 iniciado.

| T-ID | Título curto | Onda | Status |
|---|---|---|---|
| T-14-01 | Settings: card "Catálogo" + hub `/settings/catalog` | A | ✅ completed |
| T-14-02 | Actions: `getProductOfferCountsAction` + `listProductOfferUsageAction` | A | ✅ completed |
| T-14-03 | Lista de produtos: coluna "Ofertas" com badge clicável | B | ✅ completed |
| T-14-04 | Página de detalhe `/settings/catalog/products/[id]` | B | ✅ completed |

**Baseline ao iniciar Sprint 14:** 1200 testes Vitest ✅ | typecheck ✅
**Sprint 14 CONCLUÍDO (2026-04-26):** 1200 testes Vitest ✅ | typecheck ✅ | 4/4 T-IDs

---

## Tarefas

| ID | Título | Módulo | Tipo | Subagent | Parallel-safe | Depends-on | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-14-01 | Settings: card "Catálogo" + hub page | MOD-CATALOG | ui | cne-ui-author | yes | — | `app/(app)/settings/page.tsx`, `app/(app)/settings/catalog/page.tsx` (novo) | Card "Catálogo" visível em /settings; hub com 3 cards (Produtos/Categorias/Benefícios) |
| T-14-02 | Actions: getProductOfferCountsAction + listProductOfferUsageAction | MOD-CATALOG | api | cne-ui-author | yes | — | `app/(app)/settings/catalog/products/actions.ts` | Contagem retorna `Record<productId, count>`; uso retorna `{ offerId, offerName, offerStatus, offerSlug, kinds }[]` agrupado por oferta |
| T-14-03 | Lista de produtos: coluna "Ofertas" | MOD-CATALOG | ui | cne-ui-author | yes | T-14-02 | `app/(app)/settings/catalog/products/page.tsx` | Coluna "Ofertas" exibe badge clicável "X oferta(s)" ou "—"; link vai para /settings/catalog/products/[id] |
| T-14-04 | Página de detalhe /settings/catalog/products/[id] | MOD-CATALOG | ui | cne-ui-author | yes | T-14-02 | `app/(app)/settings/catalog/products/[id]/page.tsx` (novo) | Cabeçalho do produto + tabela de ofertas com status colorido, kinds e link para /offers/[id]; empty state se sem ofertas |

---

## Ondas de paralelização

### Onda A — Settings + Actions (paralelo, 2 subagents) ⬜ próxima
`T-14-01`, `T-14-02`
→ Arquivos completamente disjuntos.

### Onda B — UI de lista + detalhe (paralelo, 2 subagents) ⬜
`T-14-03`, `T-14-04`
→ Dependem de T-14-02 (actions prontas). Arquivos disjuntos entre si.
