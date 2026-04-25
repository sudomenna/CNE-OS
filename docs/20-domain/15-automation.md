# Automation (Módulo MOD-AUTOMATION)

## 1. Finalidade

Executar regras operacionais, comerciais e de atendimento por meio de fluxos configuráveis (grafo de nós: trigger → condition* → action*). Consome eventos emitidos pelos outros módulos e produz efeitos laterais controlados (aplicar tag, mover estágio, abrir ticket, notificar, emitir timeline, enviar externo). Execução via Inngest com retries, backoff e DLQ.

## 2. Ownership (paralelização)

- Arquivos que POSSUI:
  - `docs/20-domain/15-automation.md`
  - `lib/db/schema/automation.ts`
  - `lib/domain/automation/*`
  - `inngest/automation/*`
  - `app/(app)/automations/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`automation_trigger_kind`, `automation_action_kind`, `automation_execution_status`)
  - `docs/30-contracts/03-timeline-event-catalog.md` (eventos consumidos e `TE-AUTOMATION-EXECUTED`)
  - `docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md`
  - `docs/50-business-rules/BR-RBAC.md`
  - schemas de contact, conversation, ticket, funnel, offer, transaction (apenas leitura para executar ações)
- Interfaces públicas expostas:
  - `dispatchTrigger(kind, subject): Promise<void>` (recebe eventos emitidos por outros módulos)
  - `runFlow(flowId, context): Promise<AutomationExecution>`
  - `createFlow(input): Promise<AutomationFlow>`

## 3. Entidades e campos

| Tabela | Finalidade |
|---|---|
| `automation_flow` | Um fluxo configurável (grafo). |
| `automation_node` | Nó do grafo (trigger, condition ou action). |
| `automation_trigger` | Configuração específica do nó trigger. |
| `automation_condition` | Configuração do nó condição. |
| `automation_action` | Configuração do nó ação. |
| `automation_execution` | Instância de execução de um fluxo. |
| `automation_execution_log` | Log append-only por nó executado. |

### DDL sketch (Fase 1 implementada)

```sql
CREATE TABLE automation_flow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NULL REFERENCES brand(id),
  name text NOT NULL,
  description text NULL,
  is_active boolean NOT NULL DEFAULT false,
  start_node_id uuid NULL,                       -- FK DEFERRABLE INITIALLY DEFERRED (circular)
  version int NOT NULL DEFAULT 1,
  created_by uuid NULL REFERENCES user_account(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);

CREATE TABLE automation_node (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES automation_flow(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('trigger','condition','action')),
  label text NULL,
  next_node_id uuid NULL REFERENCES automation_node(id),
  next_on_true_id uuid NULL REFERENCES automation_node(id),   -- só condition
  next_on_false_id uuid NULL REFERENCES automation_node(id),  -- só condition
  config jsonb NOT NULL DEFAULT '{}',
  position_x numeric(10,2) NOT NULL DEFAULT 0,               -- coordenada X (editor visual)
  position_y numeric(10,2) NOT NULL DEFAULT 0,               -- coordenada Y (editor visual)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_trigger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL UNIQUE REFERENCES automation_node(id) ON DELETE CASCADE,
  kind automation_trigger_kind NOT NULL,
  filter jsonb NOT NULL DEFAULT '{}',           -- ex.: { funnel_id, brand_id, stage_id }
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_condition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL UNIQUE REFERENCES automation_node(id) ON DELETE CASCADE,
  expr jsonb NOT NULL,                          -- DSL JSON (ver §8)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_action (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL UNIQUE REFERENCES automation_node(id) ON DELETE CASCADE,
  kind automation_action_kind NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE automation_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES automation_flow(id) ON DELETE RESTRICT,
  subject_kind text NULL,                       -- tipo do subject (ex: 'contact', 'transaction')
  subject_id uuid NULL,                         -- ID do subject
  status automation_execution_status NOT NULL DEFAULT 'pending',
  triggered_at timestamptz NOT NULL DEFAULT now(),  -- quando o evento disparou
  started_at timestamptz NULL,                  -- quando Inngest começou a executar
  finished_at timestamptz NULL,                 -- quando terminou (sucesso/falha)
  error text NULL,                              -- mensagem de erro se falhou
  retry_count int NOT NULL DEFAULT 0,           -- tentativas realizadas (máx 5)
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_automation_execution_idem UNIQUE (flow_id, idempotency_key)
);

CREATE TABLE automation_execution_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES automation_execution(id) ON DELETE CASCADE,
  node_id uuid NOT NULL,                        -- referência informativa do nó
  node_kind text NOT NULL CHECK (node_kind IN ('trigger', 'condition', 'action')),
  status text NOT NULL CHECK (status IN ('ok', 'skipped', 'error')),
  input jsonb,                                  -- contexto de entrada do nó
  output jsonb,                                 -- resultado produzido pelo nó
  error text,                                   -- mensagem de erro se o nó falhou
  executed_at timestamptz NOT NULL DEFAULT now()
);
```

Append-only em `automation_execution_log`.

## 4. Relações (ASCII)

```
automation_flow ──< automation_node (start_node_id aponta para o inicial)
   │                     │
   │                     ├── automation_trigger   (kind='trigger')
   │                     ├── automation_condition (kind='condition')
   │                     └── automation_action    (kind='action')
   │
   └──< automation_execution ──< automation_execution_log
```

## 5. Invariantes (INV-AUTOMATION-NN)

- `INV-AUTOMATION-01`: cada `automation_flow` tem exatamente 1 `start_node_id` cujo `kind='trigger'`. Flow sem nó inicial é `is_active=false` obrigatoriamente.
- `INV-AUTOMATION-02`: nó `trigger` tem no máximo `next_node_id`; nó `condition` usa `next_on_true_id`/`next_on_false_id`; nó `action` usa `next_node_id`.
- `INV-AUTOMATION-03`: `(flow_id, idempotency_key)` é único — mesmo evento não dispara 2 execuções do mesmo fluxo.
- `INV-AUTOMATION-04`: ações `send_external` obedecem [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md) — geram `external_event_id` determinístico a partir de `(execution_id, node_id)`.
- `INV-AUTOMATION-05`: cada nó executado produz 1 linha em `automation_execution_log`.

## 6. Estados e transições (`automation_execution_status`)

```
pending ──► running ──► succeeded
              │   \
              │    └──► failed ──(retry)──► running
              │                       │
              │                       └──► failed (após N retries → cancelled via DLQ)
              └──► cancelled
```

## 7. Gatilhos e ações suportadas (Fase 1)

### Triggers (`automation_trigger_kind`)

| Kind | Origem |
|---|---|
| `funnel_enter` | MOD-FUNNEL emite `TE-FUNNEL-ENTERED` |
| `funnel_stage_change` | MOD-FUNNEL emite `TE-FUNNEL-STAGE-CHANGED` |
| `new_message` | MOD-INBOX emite `TE-MESSAGE-INBOUND` |
| `checkout_abandoned` | MOD-TRANSACTION (pending expirado) |
| `sale_approved` | MOD-TRANSACTION emite `TE-SALE-APPROVED` |
| `ticket_opened` | MOD-TICKET emite `TE-TICKET-OPENED` |
| `brevo_event` | MOD-INTEGRATION (Brevo) |
| `integration_event` | qualquer integração externa mapeada |

### Actions (`automation_action_kind`)

| Kind | Efeito |
|---|---|
| `apply_tag` | Adiciona tag em contato ou oportunidade |
| `move_stage` | Move `funnel_entry.current_stage_id` |
| `open_ticket` | Chama `MOD-TICKET.openTicket` |
| `notify_user` | Notifica usuário interno (realtime + e-mail) |
| `emit_timeline_event` | Emite `TE-AUTOMATION-EXECUTED` ou custom via `MOD-TIMELINE` |
| `send_external` | Dispara envio externo (Brevo, WhatsApp) com idempotência |

## 8. DSL de condição (esboço)

```json
{
  "op": "and",
  "children": [
    { "op": "eq", "left": "$contact.classification", "right": "lead" },
    { "op": "gte", "left": "$funnel_entry.score", "right": 20 }
  ]
}
```

Operadores mínimos: `and`, `or`, `not`, `eq`, `neq`, `gte`, `lte`, `gt`, `lt`, `in`, `contains`, `has_tag`. Avaliação em função pura `evalCondition(expr, ctx)`.

## 9. Execução, retries e DLQ

- Orquestração via **Inngest**. Cada `automation_execution` corresponde a um step function.
- Retries: backoff exponencial, **5 tentativas**; após esgotar, `status='failed'` e `cancelled` via DLQ manual (ver [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)).
- `idempotency_key` calculado a partir do evento de origem (ex.: `trigger_subject_kind:trigger_subject_id:flow_id`) — evita duplicação em caso de reentrega.
- Envios externos (`send_external`) reutilizam `webhook_log`/camada de idempotência outbound.

## 10. Regras de negócio referenciadas

- [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)
- [BR-RBAC](../50-business-rules/BR-RBAC.md) (quem pode criar/editar fluxos)
- [BR-TIMELINE](../50-business-rules/BR-TIMELINE.md)

## 11. Eventos de timeline emitidos

- `TE-AUTOMATION-EXECUTED` — emitido ao fim da execução de um fluxo. Payload: `{ flow_id: string, execution_id: string, action_kind?: string, body?: Record<string, unknown> }` (docs/30-contracts/03-timeline-event-catalog.md).
- `TE-USER-NOTIFICATION` — emitido pela ação `notify_user`. Payload: `{ user_id: string, message: string, flow_id?: string, execution_id?: string }`.

**Nota (T-11-09):** Hook pós-emissão de qualquer evento mapeado em `TE_KIND_TO_TRIGGER_KIND` dispara `dispatchTrigger`. Kinds `automation_executed` e `user_notification` são exclusos de redisparo (BR-AUTOMATION-LOOP) para evitar loop de auto-reativação.

## 12. Fluxos relacionados

- `FLOW-AUTOMATION-DISPATCH`: evento de outro módulo → `dispatchTrigger` seleciona fluxos ativos com trigger compatível e filtro casado → cria `automation_execution` → Inngest executa nó a nó.
- `FLOW-AUTOMATION-REPROCESS`: execução em `failed` reprocessada manualmente por admin → reset de `attempts` ou nova linha de execução.

## 13. Casos de teste obrigatórios

1. **Trigger dispara fluxo**: `TE-SALE-APPROVED` com filtro `{offer_id:X}` → cria 1 `automation_execution` com status `pending`.
2. **Idempotência**: mesmo evento reentregue 2x → apenas 1 execução criada (constraint `uq_automation_execution_idem`).
3. **Grafo condicional**: condição avalia `false` → segue `next_on_false_id`; log marca nó como `ok` com `output.result=false`.
4. **Retry com backoff**: ação `send_external` falha 3x, sucesso na 4ª → `status='succeeded'`, `attempts=4`.
5. **DLQ**: ação falha 5x → `status='failed'`, fluxo congela; admin pode reenfileirar.
6. **Ações fase 1**: `apply_tag`, `move_stage`, `open_ticket`, `notify_user`, `emit_timeline_event`, `send_external` — cada uma com teste dedicado de efeito colateral esperado.

## 14. Open Questions

- `OQ-AUTOMATION-01`: DSL de condição em JSON é suficiente ou precisa de expressão tipo CEL/JMESPath?
- `OQ-AUTOMATION-02`: loops/iteração sobre coleções (ex.: "para cada item do carrinho") — Fase 1 ou 2?
- `OQ-AUTOMATION-03`: limites de execução por fluxo/hora (rate limiting) para evitar envios em massa acidentais.
