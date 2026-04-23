# Contratos de webhook

Contrato técnico de recepção, processamento, retry e reprocessamento de webhooks de todos os provedores externos. Fonte única — integrações específicas (`../40-integrations/*.md`) consomem este contrato e mapeiam payloads.

> **Regra-mãe:** toda chegada externa passa por `webhook_log` antes de qualquer efeito no domínio. Idempotência é linha de defesa #1. Ver [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md).

---

## 1. Esquema canônico de `webhook_log`

DDL é autoritativa em [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md). Reproduzido aqui para consulta rápida:

```sql
CREATE TABLE webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider integration_provider NOT NULL,
  external_event_id text NOT NULL,
  event_kind text NULL,
  payload jsonb NOT NULL,
  signature_header text NULL,              -- header bruto usado para validar
  signature_valid boolean NOT NULL DEFAULT false,
  status webhook_status NOT NULL DEFAULT 'received',
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  correlation_id uuid NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  dead_lettered_at timestamptz NULL,
  CONSTRAINT uq_webhook_event UNIQUE (provider, external_event_id)
);

CREATE INDEX idx_webhook_status ON webhook_log (status);
CREATE INDEX idx_webhook_provider_received ON webhook_log (provider, received_at DESC);
CREATE INDEX idx_webhook_dead_letter ON webhook_log (status) WHERE status = 'dead_letter';
```

Tabela append-only no conteúdo de domínio: apenas os campos `status`, `attempts`, `last_error`, `processed_at`, `dead_lettered_at` podem ser atualizados pelo worker. Payload nunca muda.

---

## 2. Fluxo de recepção (Next.js Route Handler)

Todo provedor expõe uma rota em `app/api/webhooks/<provider>/route.ts`. Contrato do handler:

```ts
// app/api/webhooks/<provider>/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@/lib/integrations/<provider>/signature';
import { extractEventId, extractEventKind } from '@/lib/integrations/<provider>/mapper';
import { ingestWebhook } from '@/lib/integrations/webhook-log';
import { inngest } from '@/inngest/client';

export async function POST(req: NextRequest) {
  const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('<provider-signature-header>') ?? '';

  // 1. Validar assinatura ANTES de qualquer parsing custoso
  const signatureValid = verifySignature(rawBody, signatureHeader);
  if (!signatureValid) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  // 2. Parse + extração de event_id canônico
  const payload = JSON.parse(rawBody);
  const externalEventId = extractEventId(payload);
  const eventKind = extractEventKind(payload);

  if (!externalEventId) {
    // provedor sem id estável: ver fallback em §6
    return NextResponse.json({ error: 'missing_event_id' }, { status: 400 });
  }

  // 3. Persistir idempotente
  const result = await ingestWebhook({
    provider: '<provider>',
    externalEventId,
    eventKind,
    payload,
    signatureHeader,
    signatureValid: true,
    correlationId,
  });

  // 4. Enfileirar processamento assíncrono quando houve inserção nova
  if (result.handled) {
    await inngest.send({
      name: 'webhook/<provider>.received',
      data: { webhookLogId: result.id, correlationId },
    });
  }

  // 5. Sempre 200 quando assinatura válida e payload aceito (mesmo duplicata)
  return NextResponse.json({ ok: true, duplicate: result.duplicate }, { status: 200 });
}
```

Regras invioláveis:

1. Validar assinatura é o **primeiro passo**; payload malformado depois de assinatura válida ainda retorna `400` mas grava linha com `status='failed'`.
2. Handler responde em menos de 1s. Processamento pesado vai para Inngest.
3. Nunca abra transação de domínio dentro do handler.
4. Header `x-correlation-id` é propagado para Sentry/Axiom via `correlation_id` salvo na linha.

---

## 3. Processamento assíncrono (Inngest)

Um job por provedor, escutando o evento `webhook/<provider>.received`:

```ts
// inngest/functions/<provider>-webhook.ts
export const processProviderWebhook = inngest.createFunction(
  {
    id: '<provider>-webhook-process',
    retries: 5,
    concurrency: { limit: 20, key: 'event.data.webhookLogId' },
  },
  { event: 'webhook/<provider>.received' },
  async ({ event, step, attempt }) => {
    const { webhookLogId, correlationId } = event.data;

    await step.run('process', async () => {
      return await processWebhook(webhookLogId, { correlationId, attempt });
    });
  },
);
```

Responsabilidades de `processWebhook`:

1. Carregar linha de `webhook_log` (trava pessimista opcional `FOR UPDATE SKIP LOCKED`).
2. Se `status='processed'` → retornar noop (idempotência dupla).
3. Mapear payload → chamar função canônica de domínio (via interface pública do módulo — nunca SELECT direto em tabela alheia, ver [`07-module-interfaces.md`](./07-module-interfaces.md)).
4. Emitir eventos de timeline dentro da **mesma transação SQL** do efeito ([`03-timeline-event-catalog.md`](./03-timeline-event-catalog.md)).
5. Sucesso → `status='processed'`, `processed_at=now()`.
6. Falha → incrementar `attempts`, gravar `last_error` (mensagem + stack curta, sem PII sensível).

---

## 4. Política de retry + DLQ

| Tentativa | Delay antes de executar |
|---|---|
| 1 | imediato |
| 2 | 5 s |
| 3 | 30 s |
| 4 | 150 s |
| 5 | 750 s |
| 6ª falha | `status='dead_letter'`, sem reenfileirar |

- Backoff exponencial base 5, multiplicador 5 (aprox.): `delay = 5 * 5^(attempt-2)`.
- Jitter: ±20% para evitar thundering herd.
- Esgotadas as 5 tentativas, linha vai para `dead_letter` com `dead_lettered_at=now()`. Alerta Sentry `severity=error` com tag `webhook.dead_letter=true`.
- **Nunca** há 6ª tentativa automática. Reprocesso é manual.

---

## 5. Contrato por provedor

Detalhes (mapeamento de campos, enums externos, edge cases) vivem em `../40-integrations/*.md`. Aqui só o contrato de recepção.

### 5.1. Digital Guru Manager

| Item | Valor |
|---|---|
| Rota | `POST /api/webhooks/digital-guru` |
| Header de assinatura | `X-Guru-Signature` (HMAC-SHA256 do rawBody com `DIGITAL_GURU_WEBHOOK_SECRET`) |
| Validação | `hmac === computed` via `crypto.timingSafeEqual` |
| Campo `external_event_id` | `payload.id` (UUID do evento na Guru) |
| `event_kind` | `payload.event_type` (ex.: `transaction.approved`, `transaction.refunded`, `subscription.renewed`) |
| Eventos relevantes | `transaction.pending`, `transaction.approved`, `transaction.refused`, `transaction.refunded`, `transaction.chargeback`, `subscription.renewed`, `subscription.canceled`, `installment.paid`, `installment.overdue` |

### 5.2. Brevo

| Item | Valor |
|---|---|
| Rota | `POST /api/webhooks/brevo` |
| Header de assinatura | `X-Brevo-Signature` (HMAC-SHA256 com `BREVO_WEBHOOK_SECRET`) |
| Validação | HMAC do rawBody; rejeitar se divergir |
| Campo `external_event_id` | `payload.message-id` + `payload.event` (concatenados) quando `payload.id` ausente |
| `event_kind` | `payload.event` (`delivered`, `opened`, `clicked`, `soft_bounce`, `hard_bounce`, `unsubscribed`, `spam`) |
| Eventos relevantes | `delivered`, `opened`, `clicked`, `hard_bounce`, `unsubscribed`, `spam` |

### 5.3. WhatsApp Cloud API (Meta)

| Item | Valor |
|---|---|
| Rota | `POST /api/webhooks/whatsapp` (+ `GET` para verificação inicial com `hub.challenge`) |
| Header de assinatura | `X-Hub-Signature-256` (HMAC-SHA256 com `WHATSAPP_APP_SECRET`) |
| Validação | HMAC do rawBody; comparação time-safe |
| Campo `external_event_id` | `payload.entry[].changes[].value.messages[].id` OU `payload.entry[].changes[].value.statuses[].id` |
| `event_kind` | `messages` ou `statuses` (derivado da estrutura) |
| Eventos relevantes | mensagem recebida, status `sent`/`delivered`/`read`/`failed`, opt-out |

Handler WhatsApp quebra o payload em múltiplos `webhook_log` quando Meta agrupa vários eventos por request — um `external_event_id` por evento interno.

### 5.4. Notazz (emissão fiscal)

| Item | Valor |
|---|---|
| Rota | `POST /api/webhooks/notazz` |
| Header de assinatura | `X-Notazz-Token` (token estático) + HMAC opcional |
| Validação | comparar token com `NOTAZZ_WEBHOOK_TOKEN` via `timingSafeEqual` |
| Campo `external_event_id` | `payload.invoice_id + ':' + payload.status` |
| Eventos relevantes | `invoice.issued`, `invoice.cancelled`, `invoice.rejected` |

---

## 6. Fallback — provedor sem `external_event_id` estável

Quando o provedor não fornece id único por evento:

```ts
const externalEventId = sha256(
  `${provider}|${stableFieldA}|${stableFieldB}|${occurredAt}`
);
```

Campos escolhidos ficam documentados no mapeador do provedor. Registrar decisão em [OQ-BR-IDEM-01](../90-meta/03-open-questions-log.md).

---

## 7. Reprocessamento manual (FLOW-12)

Operadores `admin` e `financial` podem reprocessar eventos em `dead_letter` ou `failed` via UI `settings/integrations/webhooks`.

Contrato:

```ts
export async function reprocessWebhook(
  webhookLogId: string,
  actorUserId: string,
): Promise<void>;
```

Efeitos:

1. Valida permissão `integration.configure` ([BR-RBAC](../50-business-rules/BR-RBAC.md)).
2. `UPDATE webhook_log SET status='received', attempts=0, last_error=NULL WHERE id=$1`.
3. Reenfileira no Inngest com mesmo `webhookLogId`.
4. Grava linha em `audit_log` (`action_kind='update'`, `resource_kind='webhook_log'`).
5. Emite `TE-WEBHOOK-REPROCESSED` na timeline do contato relacionado, quando resolvível.

---

## 8. Outbound webhook (envio para terceiros)

Envios saindo do sistema (ex.: `automation_action_kind='send_external'`) seguem o mesmo modelo:

```ts
const externalEventId = `${sourceKind}:${sourceId}:${step}`;  // determinístico
```

1. `INSERT` em `webhook_log` com `provider='<destino>'`, `status='received'` **antes** do request HTTP.
2. Executar POST/PUT ao externo dentro de `step.run` do Inngest.
3. Sucesso HTTP 2xx → `status='processed'`.
4. Falha → mesmo ciclo de retry/DLQ da §4.

---

## 9. Observabilidade

| Ferramenta | Tags / campos |
|---|---|
| Sentry | `webhook.provider`, `webhook.event_id`, `webhook.attempt`, `webhook.correlation_id`, `webhook.status` |
| Axiom | Log estruturado JSON: `{ provider, external_event_id, event_kind, status, attempts, duration_ms, correlation_id, error? }` |
| Vercel Analytics | Latência da rota `/api/webhooks/*` por provedor |

Alertas:

- `dead_letter` > 0 na última 1h → alerta Slack canal `#ops-integracoes`.
- Taxa de `signature_valid=false` > 1% em 15 min → alerta (possível tentativa de spoofing).

---

## 10. Casos de teste

| ID | Cenário | Resultado esperado |
|---|---|---|
| CT-WH-01 | Payload duplicado (mesmo `external_event_id`) | `ingestWebhook` retorna `duplicate:true`; sem efeito de domínio; resposta 200 |
| CT-WH-02 | Assinatura inválida | Handler responde 401; nenhuma linha em `webhook_log` |
| CT-WH-03 | Payload malformado (JSON inválido) | Resposta 400; linha gravada com `status='failed'`, `last_error='invalid_json'` |
| CT-WH-04 | Sucesso no primeiro processamento | Linha `status='processed'`, `attempts=1`, evento de timeline emitido uma vez |
| CT-WH-05 | Falha transitória 2x + sucesso 3ª | `attempts=3`, `status='processed'`, efeito de domínio ocorre exatamente 1 vez |
| CT-WH-06 | Falha 5 tentativas | `status='dead_letter'`, `dead_lettered_at` preenchido, alerta Sentry disparado |
| CT-WH-07 | Reprocesso manual de dead_letter | `status='received'`, `attempts=0`, `TE-WEBHOOK-REPROCESSED` emitido, `audit_log` gravado |
| CT-WH-08 | Outbound duplicado | Segundo disparo com mesmo `externalEventId` não gera POST ao externo |
| CT-WH-09 | Header `x-correlation-id` ausente | Handler gera UUID e persiste em `webhook_log.correlation_id` |

Testes vivem em `tests/integration/integrations/webhook-*.test.ts`.

---

## 11. Open Questions

- `OQ-WH-01`: backoff por provedor deve diferir? (ex.: WhatsApp é mais frequente, 5s inicial pode ser agressivo)
- `OQ-WH-02`: quando reprocessar em lote um range de `dead_letter`, abrir job separado ou iterar `reprocessWebhook`?
- `OQ-WH-03`: PII em `last_error` — truncar e sanitizar antes de persistir?
