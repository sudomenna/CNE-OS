# BR-AUTOMATION-LOOP — Prevenção de loop de re-execução em automações

## Regra

Uma emissão de timeline event gerada por uma **ação de automação** não deve redisparar fluxos de automação, evitando loops infinitos.

## Motivação

O hook pós-emissão em `lib/timeline/emit.ts` chama `dispatchTrigger` para cada TE emitido. Se uma action de automação emitir um TE que por sua vez disparasse novos fluxos, criaria um ciclo de execução sem fim.

## Implementação

Os seguintes timeline event kinds são excluídos do redispatch no conjunto `AUTOMATION_EXCLUDED_KINDS` em `lib/timeline/emit.ts`:

| TE kind | Motivo da exclusão |
|---|---|
| `automation_executed` | Emitido ao final de cada execução de fluxo — redispatch criaria loop |
| `user_notification` | Emitido pela action `notify_user` — redispatch criaria loop |

Qualquer novo TE kind emitido por actions de automação deve ser adicionado a `AUTOMATION_EXCLUDED_KINDS`.

## Proteção secundária

`runFlow` em `lib/domain/automation/run-flow.ts` impõe limite de 100 nós por execução. Se um grafo circular escapar do guard de exclusão de kinds, a execução falha com `AutomationLoopDetectedError` antes de causar dano.

## Referências

- `lib/timeline/emit.ts` — `AUTOMATION_EXCLUDED_KINDS`
- `lib/domain/automation/run-flow.ts` — limite de 100 nós
- `docs/20-domain/15-automation.md` §9 — riscos e mitigação
