# Sprint 11 — Automações  (duração: 2 semanas)

## Objetivo

Entregar **MOD-AUTOMATION**: motor visual de automações com gatilhos, condições e ações. Usuário cria fluxo via UI drag-drop (trigger → condition* → action*). Consome eventos emitidos pelos outros módulos (funil, inbox, ticket, sale, checkout abandonado, integração) e produz efeitos laterais controlados (aplicar tag, mover estágio, abrir ticket, notificar, emitir timeline, enviar externo). Execução via Inngest com retries, backoff exponencial, idempotência por `(flow_id, idempotency_key)` e DLQ para reprocess manual.

## Entregáveis (outcomes)

- Schemas `automation_flow`, `automation_node`, `automation_trigger`, `automation_condition`, `automation_action`, `automation_execution`, `automation_execution_log`.
- Função pura `evalCondition(expr, ctx)` com DSL JSON (AND/OR/NOT/eq/neq/gte/lte/gt/lt/in/contains/has_tag).
- Função `runFlow(flowId, context)` que percorre o grafo nó a nó registrando log.
- Dispatcher `dispatchTrigger(kind, subject)` consumido por todos os módulos que emitem TE.
- Ações Fase 1: `apply_tag`, `move_stage`, `open_ticket`, `notify_user`, `emit_timeline_event`, `send_external`.
- UI `/automations` lista + builder visual drag-drop (react-flow) + histórico de execuções.
- UI detalhe de execução com log de cada nó.
- Testes de idempotência: mesmo evento 3x = 1 execução.
- Testes de retry + DLQ.

## Pré-requisitos (sprints anteriores concluídos)

- Todos os sprints anteriores (consome TEs de todos os módulos).

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-11-01 | Schema `automation_flow` + `automation_node` | MOD-AUTOMATION | schema | no | — | `20-domain/15-automation.md` §3 | `lib/db/schema/automation.ts`, `lib/db/schema/index.ts` | Migration aplicada; FK `start_node_id` deferrable |
| T-11-02 | Schemas `automation_trigger`, `automation_condition`, `automation_action` | MOD-AUTOMATION | schema | yes | T-11-01 | `20-domain/15-automation.md` §3 | `lib/db/schema/automation.ts` (adicional) | 1-1 com `automation_node` via UNIQUE(node_id) |
| T-11-03 | Schemas `automation_execution` + `automation_execution_log` + UNIQUE idempotency | MOD-AUTOMATION | schema | yes | T-11-01 | INV-AUTOMATION-03 | `lib/db/schema/automation.ts` (adicional), `supabase/migrations/0080_automation_triggers.sql` | `uq_automation_execution_idem` barra duplicação; log append-only |
| T-11-04 | Função pura `evalCondition(expr, ctx)` (DSL JSON) | MOD-AUTOMATION | domain | yes | — | `20-domain/15-automation.md` §8 | `lib/domain/automation/eval-condition.ts`, `tests/unit/automation/eval-condition.test.ts` | 15 testes cobrindo todos os operadores e `has_tag` |
| T-11-05 | Função `runFlow(flowId, context)` com runner sequencial + log por nó | MOD-AUTOMATION | domain | no | T-11-03, T-11-04 | `20-domain/15-automation.md` §12 FLOW-AUTOMATION-DISPATCH | `lib/domain/automation/run-flow.ts`, `tests/integration/automation/run-flow.test.ts` | Condição false segue `next_on_false_id`; cada nó gera log |
| T-11-06 | Dispatcher `dispatchTrigger(kind, subject)` | MOD-AUTOMATION | domain | yes | T-11-05 | `20-domain/15-automation.md` §2 | `lib/domain/automation/dispatch.ts`, `tests/integration/automation/dispatch.test.ts` | Filtra fluxos ativos por kind + filter; calcula `idempotency_key`; cria `automation_execution` pending |
| T-11-07 | Handler Inngest `automation-run` (executa `runFlow` com retries + DLQ) | MOD-AUTOMATION | integration | yes | T-11-05 | `20-domain/15-automation.md` §9 | `inngest/functions/automation-run.ts`, `tests/integration/automation/inngest.test.ts` | 5 retries com backoff exponencial; após esgotar → status `failed` |
| T-11-08 | Ações Fase 1: `apply_tag`, `move_stage`, `open_ticket`, `notify_user`, `emit_timeline_event`, `send_external` | MOD-AUTOMATION | domain | yes | T-11-05 | `20-domain/15-automation.md` §7 actions | `lib/domain/automation/actions/apply-tag.ts`, `.../move-stage.ts`, `.../open-ticket.ts`, `.../notify-user.ts`, `.../emit-timeline-event.ts`, `.../send-external.ts`, `tests/unit/automation/actions/**` | Cada ação é função pura recebendo `(params, ctx) => Effect`; 1 teste por ação |
| T-11-09 | Integração dispatcher com emissões existentes (MOD-FUNNEL, MOD-INBOX, MOD-TICKET, MOD-TRANSACTION, etc.) | integração | integration | no | T-11-06 | `20-domain/15-automation.md` §7 triggers | `lib/timeline/emit.ts` (hook pós-emit → dispatcher), `tests/integration/automation/triggers-end-to-end.test.ts` | Toda emissão de TE relevante chama `dispatchTrigger` em background (Inngest), nunca bloqueante |
| T-11-10 | Server Actions: CRUD flow, CRUD nó, publicar/despublicar, reprocess execução | MOD-AUTOMATION | api | yes | T-11-05, T-11-07 | `BR-RBAC` | `app/(app)/automations/actions.ts` | Commercial sem permissão recebe 403 |
| T-11-11 | UI `/automations` lista + editor visual drag-drop (react-flow) | MOD-AUTOMATION | ui | yes | T-11-10 | `70-ux`; `reactflow` | `app/(app)/automations/page.tsx`, `app/(app)/automations/[id]/page.tsx`, `components/automation/flow-editor.tsx`, `components/automation/node-trigger.tsx`, `components/automation/node-condition.tsx`, `components/automation/node-action.tsx` | Usuário cria fluxo `new_message → condition has_tag → open_ticket` sem recarregar |
| T-11-12 | UI `/automations/[id]/executions` histórico + detalhe de execução com log por nó | MOD-AUTOMATION | ui | yes | T-11-10 | — | `app/(app)/automations/[id]/executions/page.tsx`, `app/(app)/automations/[id]/executions/[execId]/page.tsx`, `components/automation/execution-timeline.tsx` | Detalhe mostra cada nó com status/output/erro; botão reenfileirar para DLQ |
| T-11-13 | Schemas zod payload de condições e actions (por kind) | MOD-AUTOMATION | domain | yes | T-11-08 | INV-AUTOMATION-04 | `lib/domain/automation/schemas/**` | Server Action valida antes de persistir; ação sem params obrigatório rejeita |
| T-11-14 | Teste E2E `automation-dispatch.spec.ts` | MOD-AUTOMATION | test | yes | T-11-11, T-11-12 | `20-domain/15-automation.md` §13 | `tests/e2e/automation-dispatch.spec.ts` | Criar fluxo → emitir evento via fixture → ver execução verde na UI |
| T-11-15 | Teste integração idempotência + retry + DLQ | MOD-AUTOMATION | test | yes | T-11-07 | INV-AUTOMATION-03; §9 | `tests/integration/automation/retry-dlq.test.ts` | Mesmo trigger 3x = 1 execução; action falha 5x → status `failed`; reenfileirar cria execução nova |

## Ondas de paralelização sugeridas

**Onda A (serial):** T-11-01.

**Onda B (serial em `automation.ts`):** T-11-02 → T-11-03.

**Onda C (paralelo, 2 subagents, depende de B):** T-11-04, T-11-13
→ eval-condition + schemas zod.

**Onda D (serial, depende de C):** T-11-05 (runner é núcleo).

**Onda E (paralelo, 3 subagents, depende de D):** T-11-06, T-11-07, T-11-08
→ Dispatcher, Inngest handler, actions.

**Onda F (serial, depende de E):** T-11-09 (hook em `emit.ts` é ponto central).

**Onda G (paralelo, 1 subagent, depende de F):** T-11-10.

**Onda H (paralelo, 2 subagents, depende de G):** T-11-11, T-11-12.

**Onda I (paralelo, 2 subagents, depende de H):** T-11-14, T-11-15.

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] E2E automation-dispatch verde.
- [ ] Idempotência provada com 3x reentrega.
- [ ] DLQ reenfileirável via UI.
- [ ] Hook em `emit.ts` não bloqueia emissor (dispatch em Inngest assíncrono).
- [ ] Deploy em staging verde.

## Riscos e mitigação

- **Hook em `emit.ts` causa loop (action emite TE que redispara fluxo).** Mitigação: T-11-09 exclui `TE-AUTOMATION-EXECUTED` do redispatch; guard por profundidade máxima.
- **Runner sequencial lento para fluxos longos.** Mitigação: runner usa Inngest steps que suportam pausa/retry por nó individualmente.
- **DSL JSON limitada.** Mitigação: OQ-AUTOMATION-01; evolução para CEL/JMESPath na Fase 2.
- **react-flow grande no bundle.** Mitigação: lazy-load apenas em `/automations/[id]`.
- **Rate limiting ausente permite envio em massa acidental.** Mitigação: OQ-AUTOMATION-03 documenta; implementação mínima por brand+hour em T-11-07.

## Open Questions

- `OQ-SPRINT11-01` — DSL permite referenciar `$transaction.amount` ou só `$contact.*`? Fase 1 suporta todos os subjects conhecidos.
- `OQ-SPRINT11-02` — versão de fluxo (editar sem perder histórico) — Fase 2?
- `OQ-SPRINT11-03` — testes A/B (splits dentro do fluxo) — Fase 2.
