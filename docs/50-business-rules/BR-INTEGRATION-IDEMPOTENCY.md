# BR-INTEGRATION-IDEMPOTENCY: idempotência, retry e DLQ de webhooks

## Enunciado

1. **Toda integração com webhook externo** registra cada evento recebido em `webhook_log` com `external_event_id` UNIQUE por `(provider, external_event_id)`.
2. **Recepção** persiste a linha com `INSERT ... ON CONFLICT (provider, external_event_id) DO NOTHING`. Se já existe e `status='processed'`, retorna `200` imediatamente sem reprocessar.
3. **Processamento** é enfileirado via **Inngest**. Retries: backoff exponencial, até **5 tentativas**. Esgotado o limite, `status='dead_letter'`.
4. **Reprocessamento manual** de um evento em `dead_letter` ou `failed` é feito alterando `status` para `received`, incrementando metadata, e re-enfileirando. A linha original **não é sobrescrita** além do campo `status`, `attempts`, `last_error`, `processed_at`.
5. Envio **outbound** (ex.: ação `send_external` de automação, disparo Brevo) segue o mesmo princípio: gera `external_event_id` determinístico a partir de `(source_kind, source_id, step)` para impedir envio duplicado.
6. Emissões para timeline que dependem de webhook só ocorrem **após** transição para `processed` (atomicidade dentro da mesma transação SQL).

## Motivação

Webhooks externos reentregam por design (Digital Guru, Brevo, WhatsApp). Sem idempotência, duplicamos vendas, disparamos e-mails em loop, infestamos timeline. DLQ dá visibilidade sobre integrações quebradas sem bloquear o pipeline.

## Escopo

- Módulos: MOD-INTEGRATION (universal), consumido por MOD-TRANSACTION, MOD-INBOX, MOD-AUTOMATION, MOD-BILLING.
- Entidades: `webhook_log`.

## Enforcement

- [x] DB constraint (SQL) — UNIQUE `(provider, external_event_id)`.
- [x] Função de domínio pura — `ingestWebhook(provider, eventId, payload)`.
- [x] Guard em Server Action / route handler — chamada obrigatória antes de qualquer efeito de integração.
- [x] Inngest — orquestração de retry e backoff.
- [ ] DB trigger — idempotência não é enforçada por trigger, apenas por UNIQUE + upsert idempotente.

## DDL / constraint SQL

```sql
CREATE TABLE webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider integration_provider NOT NULL,
  external_event_id text NOT NULL,
  event_kind text NULL,                          -- mapeado do payload, quando disponível
  payload jsonb NOT NULL,
  status webhook_status NOT NULL DEFAULT 'received',
  attempts int NOT NULL DEFAULT 0,
  last_error text NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  dead_lettered_at timestamptz NULL,
  CONSTRAINT uq_webhook_event UNIQUE (provider, external_event_id)
);

CREATE INDEX idx_webhook_status ON webhook_log (status);
CREATE INDEX idx_webhook_provider_received ON webhook_log (provider, received_at DESC);
```

Recepção:

```sql
INSERT INTO webhook_log (provider, external_event_id, event_kind, payload)
VALUES ($1, $2, $3, $4)
ON CONFLICT (provider, external_event_id) DO NOTHING
RETURNING id;
```

Se `RETURNING` vazio → evento já existia; consultar `status` e decidir.

## Contrato TS

```ts
import type { IntegrationProvider } from '@/lib/db/enums';

export type IngestResult = {
  handled: boolean;       // true se este call trouxe efeito novo
  duplicate: boolean;     // true se evento já estava persistido
  status: 'received' | 'processed' | 'failed' | 'dead_letter';
};

export async function ingestWebhook(
  provider: IntegrationProvider,
  eventId: string,
  payload: unknown
): Promise<IngestResult>;

export async function processWebhook(
  webhookLogId: string
): Promise<{ status: 'processed' | 'failed' }>;

export async function reprocessWebhook(
  webhookLogId: string,
  actorUserId: string
): Promise<void>;
```

Semântica de `ingestWebhook`:

1. `INSERT ... ON CONFLICT DO NOTHING`.
2. Se `duplicate=true` e `status='processed'` → retornar `{handled:false, duplicate:true, status:'processed'}` (caller responde 200).
3. Se `duplicate=true` e `status` não-final → retornar `{handled:false, duplicate:true, status}` (caller responde 200; processamento em andamento).
4. Se `duplicate=false` → enfileirar `processWebhook(id)` no Inngest; retornar `{handled:true, duplicate:false, status:'received'}`.

Semântica de `processWebhook`:

- Executa mapeamento canônico e efeitos do provedor dentro de transação.
- Sucesso → `status='processed'`, `processed_at=now()`.
- Falha → incrementa `attempts`, grava `last_error`. Após 5ª falha → `status='dead_letter'`, `dead_lettered_at=now()`.

`reprocessWebhook` atualiza apenas `status → 'received'`, reseta `attempts`, e reenfileira. Emite `TE-WEBHOOK-REPROCESSED`.

## Outbound idempotency

Ao enviar webhook/integração saindo do sistema:

```ts
const externalEventId = `${sourceKind}:${sourceId}:${step}`;  // determinístico
```

Camada outbound grava em `webhook_log` com `provider` do destino antes do request e só faz PUT/POST ao externo após persistir. Falha do externo entra no mesmo ciclo de retry/DLQ.

## Casos de teste

1. **CT-IDEM-01 — Evento duplicado não processa 2x**
   - Dado: `ingestWebhook('digital_guru', 'evt_123', payload)` já retornou `handled:true` e `status='processed'`.
   - Quando: a mesma chamada chega de novo.
   - Então: retorna `{handled:false, duplicate:true, status:'processed'}`. Nenhuma nova transação criada. Nenhum evento de timeline emitido.

2. **CT-IDEM-02 — Retry até sucesso**
   - Dado: `processWebhook` falha 2 vezes por erro transitório e sucede na 3ª.
   - Quando: Inngest executa backoff.
   - Então: `attempts=3`, `status='processed'`, `last_error` preservado do último erro (ou limpo conforme convenção).

3. **CT-IDEM-03 — Dead letter após 5 falhas**
   - Dado: `processWebhook` falha persistentemente.
   - Quando: 5ª tentativa falha.
   - Então: `status='dead_letter'`, `dead_lettered_at=now()`.

4. **CT-IDEM-04 — Reprocessamento manual**
   - Dado: evento em `dead_letter`.
   - Quando: `reprocessWebhook(id, admin.id)`.
   - Então: `status='received'`, `attempts=0`, job reenfileirado, `TE-WEBHOOK-REPROCESSED` emitido.

5. **CT-IDEM-05 — UNIQUE em (provider, external_event_id)**
   - Dado: linha existente `('brevo','abc')`.
   - Quando: tentativa de inserir novamente sem `ON CONFLICT`.
   - Então: erro de constraint.

6. **CT-IDEM-06 — Outbound determinístico**
   - Dado: ação `send_external` da automação executa 2x por reentrega de evento upstream.
   - Quando: `externalEventId` é idêntico nas duas chamadas.
   - Então: segundo envio resolve como duplicate — nenhum POST ao provedor; resposta 200 imediata.

## Rastreabilidade

- Teste esperado: `tests/integration/integrations/webhook-idempotency.test.ts`.
- Referenciada em: [MOD-INBOX](../20-domain/05-conversation-inbox.md), [MOD-AUTOMATION](../20-domain/15-automation.md), `40-integrations/*`, [BR-REFUND](./BR-REFUND.md), [BR-SNAPSHOT-IMMUTABILITY](./BR-SNAPSHOT-IMMUTABILITY.md).

## Open Questions

- `OQ-BR-IDEM-01`: quando provedor não fornece `external_event_id` estável (ex.: webhook legado), hashing do payload é aceitável? Quais campos?
- `OQ-BR-IDEM-02`: TTL para remover `webhook_log` antigo (ex.: > 18 meses em `processed`) — partition pruning ou nunca expurgar?
- `OQ-BR-IDEM-03`: backoff preciso (base, jitter) deve ser centralizado em `lib/integrations/retry.ts` ou configurável por provider?
