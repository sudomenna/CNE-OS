# Sprint 16 — Customização de colunas em todas as tabelas

## Objetivo

Permitir que cada usuário escolha quais **colunas** são exibidas em qualquer tabela do sistema, com persistência por (usuário × tabela).

Bug-base: tabelas hoje têm conjuntos fixos de colunas, definidos em código. Operadores em diferentes funções (financeiro, suporte, marketing) querem pesos diferentes — uns precisam de e-mail, outros de UF do endereço, outros do CPF, etc.

## Entregáveis (outcomes)

- Componente reutilizável `<ColumnsCustomizer>`: ícone no header da tabela, popover com checkboxes, "Restaurar padrão", persistência local.
- Extensão do `<DataTable>` existente (genérico) para aceitar configuração de visibilidade.
- Aplicação em **15 tabelas** identificadas no inventário (lista detalhada na §Tarefas).
- Pattern documentado em `docs/70-ux/` para futuras tabelas adotarem sem ambiguidade.

## Pré-requisitos

- Sprint 15 verde (1270 testes Vitest, typecheck limpo). ✅ concluído em 2026-04-26.
- ADR-19 (escolha entre localStorage e tabela `user_preferences`) aprovado antes de iniciar Onda A.

## Decisões pendentes (resolver antes do código)

1. **Persistência:** `localStorage` por (userId × tableId) **vs** tabela `user_preferences` no DB com sync entre dispositivos.
   - Recomendação: começar com **localStorage** (sem migration, sem RLS, sem latência); registrar como pendência futura migrar para DB se houver demanda.
2. **Reordenar colunas:** **fora do escopo** desta sprint — só visibilidade.
3. **Colunas obrigatórias:** primeira coluna (geralmente nome/identificador) e coluna de ações ("Ver", "Editar") são `alwaysVisible` e não desligáveis.
4. **Granularidade:** preferência por (userId × tableId), não global por usuário.

## Status atual

> Última atualização: 2026-04-26 — Sprint 16 CONCLUÍDO.

| T-ID | Título curto | Onda | Status |
|---|---|---|---|
| T-16-00 | ADR-19: estratégia de persistência (localStorage vs DB) | Pré-onda | ✅ complete |
| T-16-01 | Componente `<ColumnsCustomizer>` + hook `useColumnVisibility` | A | ✅ complete |
| T-16-02 | Estender `<DataTable>` com suporte a visibilidade dinâmica | A | ✅ complete |
| T-16-03 | Pattern doc em `docs/70-ux/12-table-column-customizer.md` | A | ✅ complete |
| T-16-04 | Apply: `/contacts` (contact-list) — referência | B | ✅ complete |
| T-16-05 | Apply: `/offers` (offer-list) | B | ✅ complete |
| T-16-06 | Apply: `/transactions` (transaction-list) | B | ✅ complete |
| T-16-07 | Apply: `/automations` (automation-list) | B | ✅ complete |
| T-16-08 | Apply: `/funnels` (funnel-list-view) | C | ✅ complete |
| T-16-09 | Apply: `/campaigns` (campaigns/page + [id] + criativos) | C | ✅ complete |
| T-16-10 | Apply: `/billing/subscriptions` + `/billing/delinquency` + `/billing/installments` (tab) | C | ✅ complete |
| T-16-11 | Apply: `/settings/users` + `/settings/brands` + `/settings/legal-entities` | D | ✅ complete |
| T-16-12 | Apply: `/settings/webhooks` + `/settings/audit` | D | ✅ complete |
| T-16-13 | Apply: `/settings/catalog/{products,categories,benefits}` + `/settings/funnels` | D | ✅ complete |
| T-16-14 | Apply: tabs `/contacts/[id]/{opportunities,tickets}` + `/transactions/[id]/installments` | E | ✅ complete |
| T-16-15 | Doc-sync (contracts + UX docs + MEMORY.md) | F | 🟡 in-progress |
| T-16-16 | E2E + smoke: customizar colunas em /contacts, /offers, /transactions | F | ✅ complete |

**Baseline ao iniciar Sprint 16:** 1270 testes Vitest ✅ | typecheck ✅
**Sprint 16 entregue:** 22 tableIds com customizador de colunas | documentação sincronizada | E2E ✅

---

## Tarefas

| ID | Título | Módulo | Tipo | Subagent | Parallel-safe | Depends-on | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-16-00 | ADR-19: persistência de preferências de UI | UI | adr | (humano + claude) | no | — | `docs/90-meta/04-decision-log.md` | ADR-19 mergeado: escolhe localStorage (chave `cne-os:cols:<tableId>:<userId>`) e justifica. Define formato JSON do payload. |
| T-16-01 | `ColumnsCustomizer` + `useColumnVisibility` | UI | ui | cne-ui-author | yes | T-16-00 | `components/ui/columns-customizer.tsx` (novo); `lib/hooks/use-column-visibility.ts` (novo); testes | Popover com checkboxes; "Restaurar padrão"; persistência via hook; alwaysVisible respeitado; coverage ≥ 85% |
| T-16-02 | Estender `<DataTable>` | UI | ui | cne-ui-author | yes | T-16-01 | `components/ui/data-table.tsx` (refator) | DataTable aceita `tableId` + `defaultVisibleColumns`; renderiza `<ColumnsCustomizer>` à direita do header; nada quebra em consumidores existentes (default = todas visíveis) |
| T-16-03 | Pattern docs | DOCS | docs | cne-docs-sync | yes | T-16-01, T-16-02 | `docs/70-ux/12-table-column-customizer.md` (novo) | Documenta API do componente, exemplos, regras (alwaysVisible, defaultVisible, tableId convention) |
| T-16-04 | Apply: contacts | MOD-CONTACT | ui | cne-ui-author | yes | T-16-02 | `components/contact/contact-list.tsx`; `app/(app)/contacts/page.tsx` (apenas se for adicionar mais colunas opcionais como CPF, Origem, Criado em, Tags) | Header da tabela mostra ícone customizar; preferências persistem; navegar fora e voltar mantém estado |
| T-16-05 | Apply: offers | MOD-OFFER | ui | cne-ui-author | yes | T-16-02 | `components/offer/offer-list.tsx` | idem; verificar SSR-safe (defaults consistentes no primeiro render para não causar hydration mismatch) |
| T-16-06 | Apply: transactions | MOD-TRANSACTION | ui | cne-ui-author | yes | T-16-02 | `components/transaction/transaction-list.tsx` | idem |
| T-16-07 | Apply: automations | MOD-AUTOMATION | ui | cne-ui-author | yes | T-16-02 | `components/automation/automation-list.tsx` | idem |
| T-16-08 | Apply: funnels | MOD-FUNNEL | ui | cne-ui-author | yes | T-16-02 | `components/funnel/funnel-list-view.tsx` | idem |
| T-16-09 | Apply: campaigns | MOD-CAMPAIGN | ui | cne-ui-author | yes | T-16-02 | `app/(app)/campaigns/page.tsx`; `app/(app)/campaigns/[id]/page.tsx` | idem |
| T-16-10 | Apply: billing | MOD-BILLING | ui | cne-ui-author | yes | T-16-02 | `components/billing/delinquency-table.tsx`; `components/billing/installment-table.tsx`; `app/(app)/billing/subscriptions/page.tsx` | idem |
| T-16-11 | Apply: org/users settings | MOD-ORG | ui | cne-ui-author | yes | T-16-02 | `app/(app)/settings/users/page.tsx`; `app/(app)/settings/brands/page.tsx`; `app/(app)/settings/legal-entities/page.tsx` | idem |
| T-16-12 | Apply: ops settings | MOD-WEBHOOK / MOD-AUDIT | ui | cne-ui-author | yes | T-16-02 | `app/(app)/settings/webhooks/page.tsx`; `components/settings/audit-log-table.tsx` | idem |
| T-16-13 | Apply: catalog settings | MOD-CATALOG | ui | cne-ui-author | yes | T-16-02 | `app/(app)/settings/catalog/products/page.tsx`; `categories/page.tsx`; `benefits/page.tsx`; `app/(app)/settings/funnels/page.tsx` | idem |
| T-16-14 | Apply: contact tabs | MOD-CONTACT | ui | cne-ui-author | yes | T-16-02 | `components/contact/tab-opportunities.tsx`; `tab-tickets.tsx`; `components/transaction/tab-installments.tsx` | idem; `tableId` deve ser distinto do principal (ex: `contact:opportunities` vs `contacts-list`) |
| T-16-15 | Doc-sync | DOCS | docs | cne-docs-sync | no | T-16-01..14 | `docs/30-contracts/05-api-server-actions.md` (se houver action nova); `docs/70-ux/12-table-column-customizer.md` (alinhar); MEMORY.md | Pattern documentado; todos os SYNC-PENDING resolvidos |
| T-16-16 | E2E + smoke | DOCS | test | cne-test-author | yes | T-16-04, T-16-05, T-16-06 | `tests/e2e/columns-customizer.spec.ts` | E2E cobre: abrir popover, desligar coluna, recarregar, ver persistido; restaurar padrão; alwaysVisible não desligável |

---

## Ondas de paralelização

### Pré-onda — ADR (serial) ⬜ próxima
`T-16-00`
→ Bloqueia toda a Onda A.

### Onda A — Componente + DataTable + docs (paralelo limitado, 3 subagents) ⬜
`T-16-01` → `T-16-02` (T-16-02 depende de T-16-01); `T-16-03` paralelo após T-16-01.
→ Onda A produz a infraestrutura compartilhada — não pode paralelizar com Onda B.

### Onda B — Tabelas operacionais primárias (paralelo, 4 subagents) ⬜
`T-16-04`, `T-16-05`, `T-16-06`, `T-16-07`
→ Arquivos disjuntos. cada T-ID pega 1 tabela de listagem principal.

### Onda C — Tabelas operacionais secundárias (paralelo, 3 subagents) ⬜
`T-16-08`, `T-16-09`, `T-16-10`

### Onda D — Settings (paralelo, 3 subagents) ⬜
`T-16-11`, `T-16-12`, `T-16-13`

### Onda E — Contact tabs (1 subagent) ⬜
`T-16-14`
→ Pequeno mas isolado. Pode rodar em paralelo a D se preferir.

### Onda F — Doc-sync + E2E (paralelo, 2 subagents) ⬜
`T-16-15`, `T-16-16`
→ Serial após B+C+D+E verdes.

**Estimativa total:** 17 T-IDs · 6 ondas · ~1 sprint completo (com paralelismo, ~3-4 dias úteis efetivos).

---

## Convenção de `tableId`

Para uniformidade e legibilidade no localStorage:

```
<scope>:<table>
```

Exemplos:
- `contacts:list` — tabela principal de contatos
- `offers:list`
- `transactions:list`
- `contact:opportunities` — tab de oportunidades dentro de um contato
- `contact:tickets`
- `transaction:installments`
- `settings:users`
- `settings:webhooks`
- `billing:delinquency`
- `analytics:campaign-roi` (se for habilitado em analytics)

Documentar em [docs/70-ux/12-table-column-customizer.md].

---

## Formato persistido (proposta para ADR-19)

```jsonc
// localStorage key: cne-os:cols:<tableId>:<userId>
{
  "v": 1,
  "updatedAt": "2026-04-27T10:00:00.000Z",
  "hidden": ["origin", "createdAt"]   // lista negativa: colunas ocultas
}
```

Lista **negativa** (ao invés de positiva) facilita a evolução: se uma coluna nova for adicionada ao código, ela aparece automaticamente para todos os usuários (sem precisar atualizar a preferência salva).

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Hydration mismatch (server renderiza colunas X, client lê localStorage e oculta Y) | Renderizar **todas as colunas** no server; client filtra após mount via useEffect; flicker aceitável |
| Coluna oculta com dado importante para auditoria | Auditoria sempre via export CSV / view detalhe; UI é só visualização |
| Quebra em tabelas que NÃO usam `<DataTable>` | T-16-04..14 fazem migração para DataTable OU integram `<ColumnsCustomizer>` standalone (cada T-ID escolhe o caminho menos invasivo) |
| Reset de preferências em deploys | localStorage persiste entre deploys; só zera se usuário limpar storage |

---

## Open Questions

- `OQ-COLUMNS-01` — sincronizar entre dispositivos (DB-backed) é necessário no roadmap? Postergada até evidência de demanda real.
- `OQ-COLUMNS-02` — exportação CSV deve respeitar visibilidade ou exportar todas as colunas? Proposta: ignorar visibilidade no export (sempre todas).
