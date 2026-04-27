# Sprint 17 — Inbox enriquecido + Pipeline comercial via funnel

## Objetivo

Transformar `/inbox` de "leitor de mensagens" em **centro de comando do atendente**. Quem está conversando com o cliente AGORA precisa, sem sair da tela:

1. Abrir ticket formal direto da conversa.
2. Atribuir a conversa a qualquer outro usuário do sistema (não só "a mim").
3. Inserir o lead num pipeline comercial e mover entre estágios.

## Decisão de produto chave (ADR-20)

**Não criar conceito novo de "pipeline".** O sistema já modela oportunidade comercial em `funnel_entry` (`owner_user_id`, `label`, `current_stage_id`, `score`, `transaction_id`, history append-only).

A diferença entre "jornada de lançamento" e "pipeline comercial" é apenas:
- **Quem move o lead**: automação (jornada) vs humano (pipeline).
- **Como visualizar**: dashboard de drop-off (jornada) vs kanban arrastável (pipeline).

**ADR-20** adiciona enum `funnel_kind = 'launch' | 'sales'` à tabela `funnel`. Mesmo schema, semântica diferente. Reaproveitamento ~90%.

Drag-drop kanban já existe (`components/funnel/kanban.tsx`, T-5-13 do Sprint 5). Não precisa reconstruir.

## Entregáveis (outcomes)

- Atendente abre ticket em 1-click do contact-pane.
- Atendente reatribui conversa para qualquer usuário via popover.
- Atendente cria `funnel_entry` (oportunidade) direto do contact-pane; aparece imediatamente no kanban do funnel correspondente.
- Contact-pane mostra todos os funis ativos do contato (badges com kind + estágio).
- `/funnels` distingue visualmente jornada vs pipeline (badge no card + filtro).
- `/funnels/[id]` adapta default-view ao `kind` (sales→kanban, launch→list/dashboard).

## Pré-requisitos

- Sprint 16 verde (1323 testes Vitest, typecheck limpo). ✅ concluído em 2026-04-26.
- ADR-20 (T-17-00) aprovado antes de iniciar Onda B+.

## Não-objetivos (fora do escopo)

- Forecasting comercial (`expected_value_brl`, `expected_close_at`, win rate, cycle time) — Sprint 18.
- Notificações in-app para usuário atribuído — depende de MOD-NOTIFICATION (não existe) — backlog.
- Tela agregada `/pipelines` (vista cross-funnel) — decidido: usar `/funnels/[id]?view=kanban` por funnel.
- Real-time push browser notification — Sprint 19+.
- Reabertura de oportunidade `lost` (OQ-BR-FUNNEL-02) — backlog.

## Status atual

> Última atualização: 2026-04-26 — Sprint 17 planejado, não iniciado.

| T-ID | Título curto | Onda | Status |
|---|---|---|---|
| T-17-00 | ADR-20: `funnel.kind = 'launch' \| 'sales'` | Pré-onda | ⬜ pending |
| T-17-01 | Schema + migration `funnel.kind` + enum doc | A | ⬜ pending |
| T-17-02 | Atribuir conversa a outro usuário (popover + action) | B | ⬜ pending |
| T-17-03 | Abrir ticket direto do inbox (modal + action) | B | ⬜ pending |
| T-17-04 | Adicionar contato a funnel direto do inbox + lista de funis ativos no contact-pane | B | ⬜ pending |
| T-17-05 | Distinguir kind em `/funnels` (badge + filtro) | C | ⬜ pending |
| T-17-06 | Default view por kind em `/funnels/[id]` | C | ⬜ pending |
| T-17-07 | Doc-sync (BR-FUNNEL + 08-funnel-opportunity + 05-api-server-actions) | D | ⬜ pending |
| T-17-08 | Tests integration + E2E inbox actions | D | ⬜ pending |

**Baseline ao iniciar Sprint 17:** 1323 testes Vitest ✅ | typecheck ✅
**Sprint 17 esperado:** ~1345 testes (estimativa: +22 testes)

---

## Tarefas

| ID | Título | Módulo | Tipo | Subagent | Parallel-safe | Depends-on | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-17-00 | ADR-20: `funnel.kind = 'launch' \| 'sales'` | DOCS | adr | (humano + claude) | no | — | `docs/90-meta/04-decision-log.md` | ADR-20 mergeado: justifica reaproveitamento de funnel; define enum + default `'launch'`; especifica UX por kind. |
| T-17-01 | Schema + migration `funnel.kind` | MOD-FUNNEL | schema | cne-schema-author | no | T-17-00 | `lib/db/schema/funnel.ts`; `supabase/migrations/<ts>_funnel_kind.sql`; `lib/db/migrations/00XX_*.sql` + meta; `docs/30-contracts/01-enums.md`; `docs/20-domain/08-funnel-opportunity.md` (§3.1) | Enum criado; backfill: todos os funnels existentes recebem `kind='launch'`; teste de schema valida default. |
| T-17-02 | Atribuir conversa a outro usuário | MOD-INBOX | ui | cne-ui-author | yes | T-17-04 (depois do refator do contact-pane) | `app/(app)/inbox/actions.ts`; `components/inbox/assign-to-user-popover.tsx` (novo) | Popover lista usuários ativos; click reatribui via `assignConversation`; histórico em `conversation_assignment_history`; `TE-CONVERSATION-ASSIGNED` emitido. Botão "Atribuir a mim" mantido como atalho. |
| T-17-03 | Abrir ticket direto do inbox | MOD-TICKET | ui | cne-ui-author | yes | T-17-04 | `app/(app)/inbox/actions.ts`; `components/inbox/open-ticket-dialog.tsx` (novo) | Modal com title/category/priority/description/assigned_user; submit chama `openTicket({origin_conversation_id, ...})`; toast com link para ticket criado; `TE-TICKET-OPENED`. |
| T-17-04 | Adicionar a funnel + lista de funnels no contact-pane | MOD-INBOX, MOD-FUNNEL | ui | cne-ui-author | no (refator de contact-pane é serial) | T-17-01 | `components/inbox/contact-pane.tsx` (refator com 3 slots); `components/inbox/contact-funnels-section.tsx` (novo); `components/inbox/add-to-funnel-dialog.tsx` (novo); `app/(app)/inbox/actions.ts` (3ª action) | Modal com dropdown funnels da brand (filtra `kind='sales'` por default, toggle "ver todos"); estágio inicial; owner default = current user; `entry_origin='manual_inbox'`; respeita `INV-FUNNEL-01` (mostra existente se já houver entry ativa). Lista no contact-pane mostra funis ativos com badges. |
| T-17-05 | Kind em `/funnels` (badge + filtro) | MOD-FUNNEL | ui | cne-ui-author | yes | T-17-01 | `app/(app)/funnels/page.tsx`; `components/funnel/funnel-card.tsx` ou similar; `components/funnel/funnel-columns.ts` (Sprint 16 — adicionar coluna kind opcional) | Card mostra badge "Jornada" / "Pipeline"; filtro por kind (tabs ou dropdown); customizer de colunas inclui `kind` (defaultVisible). |
| T-17-06 | Default view por kind em `/funnels/[id]` | MOD-FUNNEL | ui | cne-ui-author | yes | T-17-01 | `app/(app)/funnels/[id]/page.tsx`; `components/funnel/funnel-board-client.tsx` (se preciso) | `kind='sales'` abre default em `?view=kanban`; `kind='launch'` mantém default em list/dashboard. Toggle continua disponível em ambos. |
| T-17-07 | Doc-sync | DOCS | docs | cne-docs-sync | no | T-17-02..06 | `docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md`; `docs/20-domain/08-funnel-opportunity.md`; `docs/30-contracts/05-api-server-actions.md`; `MEMORY.md` user-level | BR-FUNNEL-OPPORTUNITY descreve semântica de kind; 3 novas server actions documentadas; sem `[SYNC-PENDING]` aberto. |
| T-17-08 | Tests integration + E2E | MULTI | test | cne-test-author | yes | T-17-02..06 | `tests/unit/funnel/kind.test.ts`; `tests/integration/inbox/open-ticket-from-conversation.test.ts`; `tests/integration/inbox/assign-conversation-to-user.test.ts`; `tests/integration/inbox/enter-funnel-from-conversation.test.ts`; `tests/e2e/inbox-actions.spec.ts` | Cobertura: schema invariants do kind; 3 fluxos integration; E2E completo cobrindo abertura de ticket, atribuição, criação de oportunidade. ≥1345 testes verdes. |

---

## Ondas de paralelização

### Pré-onda — ADR (serial) ⬜ próxima
`T-17-00`
→ Bloqueia toda Onda A.

### Onda A — Schema (serial) ⬜
`T-17-01`
→ Adiciona enum + migration. Bloqueia toda Onda B+.

### Onda B — Inbox actions (serial-then-parallel) ⬜
1. **Serial primeiro:** `T-17-04` (refator do contact-pane com 3 slots).
2. **Paralelo depois:** `T-17-02` + `T-17-03` (cada um implementa um slot).

→ Estrutura: 1 subagent → barrier → 2 subagents.

### Onda C — Funnel kind UI (paralelo, 2 subagents) ⬜
`T-17-05`, `T-17-06` — arquivos disjuntos (`page.tsx` vs `[id]/page.tsx`).

### Onda D — Doc-sync + tests (paralelo, 2 subagents) ⬜
`T-17-07`, `T-17-08` — serial após Ondas B+C verdes.

**Estimativa total:** 9 T-IDs · 5 ondas · ~3 dias úteis efetivos com paralelismo.

---

## Convenção de `entry_origin` no inbox

Quando atendente cria `funnel_entry` direto da conversa, `entry_origin='manual_inbox'`. Isso permite analytics futuro (quanto da pipeline veio do atendimento humano vs automação).

Se também tiver conversa de origem (sempre tem nesse fluxo), preencher campo opcional `funnel_entry.entry_conversation_id`? **Decisão:** **não criar coluna nova** — relação `conversation ──? funnel_entry` continua opcional/inferível. Se necessário no futuro, adicionar em sprint dedicado.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Multi-funil confunde atendente (lead em 5 funis simultâneos) | Contact-pane mostra só funis ativos (`label NOT IN ('won','lost')`), agrupados por kind. Limite visual: 3 cards + "ver todos" |
| Picker de usuário lista muitos perfis sem permission de atendimento | Filtrar por permission `inbox.respond` se existir; senão por `user.role IN ('admin','support','sales')` (consultar `BR-RBAC.md`). Registrar como OQ-INBOX-04 antes de implementar |
| `entry_origin='manual_inbox'` é string mágica | Documentar em `BR-FUNNEL-OPPORTUNITY.md` como valor canônico. Não criar enum (origens são livres por design) |
| `INV-FUNNEL-01` rejeita 2ª criação (lead já em funil ativo) | UX: ao detectar duplicação, modal mostra a oportunidade existente e oferece "Mover estágio" no lugar |
| ContactPane vira muito grande visualmente | Seções colapsáveis (`<details>`) ou ordenadas por relevância (responsável > status > funnels > ticket actions) |
| Migration `funnel.kind` em produção (sprint não deployado) | Default `'launch'` cobre 100% dos funnels existentes; backfill é trivial e seguro |

---

## Open Questions

- `OQ-INBOX-04` — Qual permission filtra o picker de "Atribuir conversa a outro usuário"? (`inbox.respond`? Cargo? Time?). Default proposto: qualquer usuário ativo da brand. Se time comercial só atende vendas e suporte só atende suporte — discutir antes de T-17-02.
- `OQ-FUNNEL-04` — Lista de funnels no modal "Adicionar a Pipeline" mostra **todos os kinds** ou só `kind='sales'`? Proposta: default só `'sales'`, com toggle para "ver todos os funis". Confirmar UX.
- `OQ-FUNNEL-05` — Quando atendente cria funnel_entry do inbox, owner default é current user ou pode ser deixado nulo? Proposta: default = current user (assume que quem está atendendo é responsável até ser reatribuído).

---

## Pós-Sprint 17 (proposta para Sprint 18)

- Forecasting comercial: `funnel_entry.expected_value_brl`, `expected_close_at`, dashboards de pipeline (valor total, conversion rate por estágio, cycle time médio).
- Notificações in-app (novo MOD-NOTIFICATION) — quando atribuído a conversa/ticket, recebe alerta.
- Real-time push (browser notification) para conversas atribuídas a mim.
- Atalhos de teclado no inbox (j/k navegação, `c`=criar ticket, `p`=adicionar a pipeline).
