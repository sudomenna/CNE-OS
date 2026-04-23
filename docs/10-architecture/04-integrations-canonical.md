# 04 — Integrações e modelo canônico

Padrão de adaptador para **toda** integração externa. Complementa [`30-contracts/04-webhook-contracts.md`](../30-contracts/04-webhook-contracts.md) e [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md).

---

## 1. Princípio fundamental

> **O modelo interno prevalece.** Nenhum nome, enum, estrutura ou campo vindo de provedor externo vaza para o domínio. Toda entrada passa por `mapper.ts` que converte payload externo em tipo canônico interno antes de tocar no domínio.

Consequências:

1. Trocar de provedor é **refactor de adaptador**, nunca de domínio.
2. Enum interno (ex.: `transaction_status`) é autoritativo; enums de provedor são traduzidos.
3. `transaction_snapshot.payload` guarda a foto **canônica**, não o payload bruto.
4. Payload bruto vive em `webhook_log.payload` para auditoria e reprocessamento.

---

## 2. Estrutura padrão por provedor

```
/lib/integrations/<provider>/
  signature.ts          # verifyHMAC, extractSignatureHeader
  mapper.ts             # mapToInternal(payload): CanonicalEvent — PURO
  processor.ts          # Inngest function: consome webhook_log -> domínio
  handler.ts            # wrapper usado pelo Route Handler
  types.ts              # tipos do provedor (apenas uso interno do adaptador)
  outbound.ts           # chamadas de saída (API do provedor) — opcional
  fixtures/             # payloads reais anonimizados para testes
    transaction-approved.json
    subscription-renewed.json
    ...
```

Regra: **nada** dentro de `/lib/integrations/<provider>/` exporta tipos do provedor para fora. O único tipo cruzando é o **canônico**.

---

## 3. Camadas por integração

### 3.1. Route Handler

Arquivo padrão: `app/api/webhooks/<provider>/route.ts`. Contrato completo em [`30-contracts/04-webhook-contracts.md §2`](../30-contracts/04-webhook-contracts.md). Resumo:

1. Validar assinatura HMAC (primeiro passo).
2. Extrair `external_event_id` canônico do payload.
3. `ingestWebhook({ provider, externalEventId, eventKind, payload, signatureHeader, signatureValid, correlationId })` — INSERT idempotente em `webhook_log`.
4. `inngest.send('webhook/<provider>.received', { webhookLogId })`.
5. Retornar 200 em menos de 1 segundo.

Nenhum trabalho de domínio acontece aqui.

### 3.2. `mapper.ts` — função pura, testável

```ts
// lib/integrations/digital-guru/mapper.ts
import type { CanonicalTransactionEvent } from '@/lib/domain/transaction/canonical';

type GuruPayload = {
  id: string;
  event_type: 'transaction.approved' | 'transaction.refunded' | '...';
  data: { /* ... */ };
};

export function extractEventId(p: GuruPayload): string { return p.id; }
export function extractEventKind(p: GuruPayload): string { return p.event_type; }

export function mapToInternal(p: GuruPayload): CanonicalTransactionEvent {
  switch (p.event_type) {
    case 'transaction.approved':
      return {
        kind: 'transaction.approved',
        externalRef: p.data.transaction_id,
        contactInput: {
          name: p.data.customer.name,
          email: normalizeEmail(p.data.customer.email),
          phone: normalizePhone(p.data.customer.phone),
          cpf: normalizeCpf(p.data.customer.cpf),
        },
        offerExternalId: p.data.offer_id,
        amount: toBrl(p.data.amount_cents),
        paymentMethod: mapPaymentMethod(p.data.payment_method),
        approvedAt: new Date(p.data.approved_at),
      };
    // ...
  }
}
```

Requisitos:

1. **Puro.** Sem I/O, sem `Date.now()`, sem acesso a DB.
2. **Totalmente coberto por teste** com fixtures reais (§7).
3. **Normalização** (email lowercase, phone E.164, cpf dígitos) feita aqui.
4. **Enum translation** feita aqui (ex.: `status: 'paid' -> 'approved'`).

### 3.3. `processor.ts` — Inngest function

```ts
// lib/integrations/digital-guru/processor.ts
import { inngest } from '@/inngest/client';
import { db } from '@/lib/db/client';
import { loadWebhookLog, markProcessed, markFailed } from '@/lib/integrations/webhook-log';
import { mapToInternal } from './mapper';
import { ingestTransactionEvent } from '@/lib/domain/transaction/ingest';

export const processDigitalGuruWebhook = inngest.createFunction(
  {
    id: 'digital-guru-webhook-process',
    retries: 5,
    concurrency: { limit: 20, key: 'event.data.webhookLogId' },
  },
  { event: 'webhook/digital-guru.received' },
  async ({ event, step, attempt }) => {
    const { webhookLogId, correlationId } = event.data;

    await step.run('process', async () => {
      const log = await loadWebhookLog(webhookLogId);
      if (log.status === 'processed') return; // idempotência dupla

      const canonical = mapToInternal(log.payload);

      try {
        await db.transaction(async (tx) => {
          await ingestTransactionEvent(tx, canonical, {
            correlationId,
            source: 'digital_guru',
            webhookLogId,
          });
        });
        await markProcessed(webhookLogId);
      } catch (err) {
        await markFailed(webhookLogId, attempt, err);
        throw err; // Inngest aplica retry
      }
    });
  },
);
```

Responsabilidades:

1. Carregar `webhook_log` e curto-circuitar se já processado.
2. Invocar `mapToInternal`.
3. Chamar **interface pública** do módulo de domínio (nunca SELECT alheio — ver [`09-module-boundaries.md`](./09-module-boundaries.md)).
4. Atomicidade em transação única (efeito + timeline + audit).
5. Atualizar `webhook_log.status` ao final.

---

## 4. Correlação end-to-end

Rastreabilidade por `correlation_id`:

| Origem | Campo |
|---|---|
| Route Handler | `webhook_log.correlation_id` (UUID gerado ou propagado do header) |
| Inngest | `event.data.correlationId` |
| Domínio | `audit_log.context.correlationId`, `timeline_event.correlation_id` |
| Ação derivada (ex.: job que gera segunda integração) | mesmo `correlation_id` propagado |

Chave extra: `external_event_id -> webhook_log.id` permite recuperar o payload original a partir de qualquer registro derivado.

Toda função que muta e recebe contexto carrega `correlationId`:

```ts
type IngestContext = {
  correlationId: string;
  source: 'digital_guru' | 'brevo' | 'whatsapp' | 'notazz' | 'manual';
  webhookLogId?: string;
};
```

---

## 5. DLQ (Dead-Letter Queue) — operação

### 5.1. Estado

Após 5 tentativas, `webhook_log.status = 'dead_letter'`, `dead_lettered_at = now()`. Alerta Sentry + Slack ([`07-observability.md`](./07-observability.md)).

### 5.2. UI operacional

Rota: `/app/(app)/settings/integrations/dlq/page.tsx`. Acesso: `admin`, `financial`.

Recursos:

| Função | Descrição |
|---|---|
| Listagem | Filtros por provider, data, event_kind, `last_error`. Paginação keyset. |
| Detalhe | Payload formatado (JSON tree), erro completo, histórico de tentativas, `correlation_id`. |
| Reprocessar | Botão disparando `reprocessWebhook(id, actorUserId)` ([`30-contracts/04-webhook-contracts.md §7`](../30-contracts/04-webhook-contracts.md)). |
| Reprocessar em lote | Apenas `admin`; gera Inngest fan-out com throttle. |
| Ocultar | Marcar como `resolved_manually=true` (não muda status; apenas UI). Adiciona comentário. |
| Exportar | CSV dos payloads filtrados (apenas `admin`). |

Ações que reprocessam auditam: `action_kind='update'`, `resource_kind='webhook_log'`.

---

## 6. Outbound canônico

Envio para terceiros segue o mesmo modelo. Helper central:

```ts
// lib/integrations/outbound.ts
import { db } from '@/lib/db/client';
import { webhookLog } from '@/lib/db/schema';
import { inngest } from '@/inngest/client';

export type OutboundProvider = 'digital_guru' | 'brevo' | 'whatsapp' | 'notazz';

export async function sendViaProvider(
  provider: OutboundProvider,
  payload: {
    kind: string;                          // 'send_email', 'send_whatsapp', 'issue_invoice'
    body: Record<string, unknown>;
    idempotencyKey: string;                // determinística: `${kind}:${refId}:${step}`
    correlationId: string;
  },
): Promise<{ webhookLogId: string; duplicate: boolean }> {
  const duplicate = await findExisting(provider, payload.idempotencyKey);
  if (duplicate) return { webhookLogId: duplicate.id, duplicate: true };

  const logRow = await db.insert(webhookLog).values({
    provider,
    externalEventId: payload.idempotencyKey,
    eventKind: payload.kind,
    payload: payload.body,
    signatureValid: true,
    correlationId: payload.correlationId,
    status: 'received',
  }).returning();

  await inngest.send({
    name: `outbound/${provider}.dispatch`,
    data: { webhookLogId: logRow[0].id, correlationId: payload.correlationId },
  });

  return { webhookLogId: logRow[0].id, duplicate: false };
}
```

Idempotência: `external_event_id = <kind>:<refId>:<step>` impede double-send mesmo sob retry ([`30-contracts/04-webhook-contracts.md §8`](../30-contracts/04-webhook-contracts.md)).

Processor outbound:

1. `step.run('http', () => fetch(providerUrl, ...))`.
2. 2xx -> `status='processed'`.
3. 4xx não-retentável -> `status='failed'` + alerta, sem retry.
4. 5xx / timeout -> retry exponencial conforme política padrão.

---

## 7. Fixtures reais

Diretório `lib/integrations/<provider>/fixtures/` guarda payloads reais **anonimizados**:

- CPF: `12345678901` (dummy válido de teste).
- E-mail: `fixture-<slug>@example.com`.
- Nome: `Fulano da Silva`.
- `external_id`: substituído por UUID fixo.

Usados em:

- Teste unitário do `mapper.ts` (puro): `tests/unit/integrations/<provider>/mapper.test.ts`.
- Teste integration do `processor.ts`: `tests/integration/integrations/<provider>/*.test.ts`.
- Seed de ambiente local para desenvolvimento.

Anonimização é **obrigatória**: payload real de cliente nunca entra no repositório.

---

## 8. Padrão de checklist para nova integração

Ao adicionar novo provedor:

1. Registrar valor em `enum integration_provider` (serial, via PR em `30-contracts/01-enums.md`).
2. Criar `lib/integrations/<provider>/`.
3. Declarar HMAC, header, `external_event_id` em `30-contracts/04-webhook-contracts.md §5`.
4. Implementar `signature.ts`, `mapper.ts`, `processor.ts`.
5. Route Handler em `app/api/webhooks/<provider>/route.ts`.
6. Mínimo **3 fixtures reais** anonimizadas.
7. Testes: mapper (unit), processor (integration), idempotência (integration).
8. Documento em `40-integrations/<nn>-<provider>.md`.
9. Adicionar env vars ao `.env.example` e secret no Vercel/Supabase.
10. Alertas Sentry/Axiom com tag `webhook.provider=<provider>`.

---

## 9. Casos de teste obrigatórios

| ID | Cenário | Fonte |
|---|---|---|
| CT-INT-01 | Mapper mapeia payload real -> canônico esperado | fixture |
| CT-INT-02 | Assinatura HMAC inválida -> handler retorna 401, sem linha | — |
| CT-INT-03 | Mesmo `external_event_id` chega 2x -> segunda não gera efeito | fixture |
| CT-INT-04 | Falha transitória 2x, sucesso na 3ª -> efeito uma vez só | fixture + mock domínio |
| CT-INT-05 | Dead-letter após 5 falhas -> alerta Sentry emitido | — |
| CT-INT-06 | Reprocesso manual -> `TE-WEBHOOK-REPROCESSED` + `audit_log` | — |
| CT-INT-07 | Outbound duplicado com mesmo `idempotencyKey` -> single HTTP | — |

---

## 10. Open Questions

- `OQ-INT-ARCH-01`: consolidar `mapper.ts` por provedor em biblioteca genérica (schema-driven via zod)?
- `OQ-INT-ARCH-02`: versionamento do `CanonicalTransactionEvent` — `_v` no payload canônico também?
- `OQ-INT-ARCH-03`: permitir `mapToInternal` retornar múltiplos eventos canônicos por payload (WhatsApp multi-message)?
