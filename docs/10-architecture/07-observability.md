# 07 — Observabilidade

Sentry (erros), Axiom (logs e métricas), Vercel Analytics (web vitals). Correlation ID atravessa tudo.

---

## 1. Sentry

### 1.1. Captura

| Escopo | SDK | Inicialização |
|---|---|---|
| Browser | `@sentry/nextjs` client | `sentry.client.config.ts` |
| Node (Server Actions, Route Handlers) | `@sentry/nextjs` server | `sentry.server.config.ts` |
| Edge (middleware) | `@sentry/nextjs` edge | `sentry.edge.config.ts` |
| Inngest workers | `@sentry/node` | manual dentro de `inngest.client.ts` |

### 1.2. Tags canônicas

Toda captura inclui as tags:

| Tag | Origem |
|---|---|
| `brand_id` | `ctx.user` ou objeto sendo mutado |
| `user_id` | `ctx.user.id` |
| `correlation_id` | header `x-correlation-id` |
| `webhook.provider` | adaptador em `/lib/integrations/<p>/` |
| `webhook.event_id` | `webhook_log.external_event_id` |
| `webhook.attempt` | tentativa Inngest |
| `module` | MOD-\* emissor (ex.: `MOD-REFUND`) |
| `inngest.function` / `inngest.run_id` | Inngest SDK |

Helper canônico:

```ts
// lib/observability/sentry.ts
import * as Sentry from '@sentry/nextjs';

export function withSentryContext<T>(
  tags: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  return Sentry.withScope(async (scope) => {
    for (const [k, v] of Object.entries(tags)) {
      if (v !== undefined) scope.setTag(k, v);
    }
    return fn();
  });
}
```

### 1.3. Sampling

| Tipo | Taxa Fase 1 |
|---|---|
| `errors` | 100% |
| `transactions` (performance) | 10% |
| `profilesSampleRate` | 10% de transactions |
| Release health | 100% |

Ajustes: elevar para 100% em janelas de incidente; reduzir se volume extrapolar free tier.

### 1.4. Sourcemaps

Upload automático via plugin `@sentry/nextjs` no build. Vercel env: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.

### 1.5. PII

- **Não** enviar CPF, email, phone em `message` livre. Usar `extra` com key explícita (`customer_email_hash`).
- `beforeSend` remove chaves de request com nomes `authorization`, `cookie`, `x-supabase-*`.

---

## 2. Axiom — logs estruturados

### 2.1. Dataset

Um único dataset `cne-os` com campos padronizados. Eventos diferenciados por `source`.

### 2.2. Campos canônicos

Todo log estruturado JSON contém:

| Campo | Tipo | Obrigatório? | Descrição |
|---|---|:-:|---|
| `ts` | ISO 8601 | sim | Timestamp do evento |
| `level` | `debug` / `info` / `warn` / `error` | sim | Nível |
| `message` | string | sim | Descrição humana |
| `correlation_id` | UUID | sim | Rastreio ponta-a-ponta |
| `module` | `MOD-*` | sim | Emissor |
| `source` | `server-action` / `webhook` / `inngest` / `cron` / `realtime` | sim | Origem do log |
| `brand_id` | UUID | quando aplicável | — |
| `user_id` | UUID | quando aplicável | — |
| `contact_id` | UUID | quando aplicável | — |
| `transaction_id` | UUID | quando aplicável | — |
| `webhook_log_id` | UUID | quando aplicável | — |
| `inngest_run_id` | string | quando job | — |
| `duration_ms` | number | quando evento tem duração | — |
| `error` | objeto `{ name, message, stack_first_lines }` | em `level=error` | — |

Campos sensíveis nunca vão para Axiom: CPF pleno, senha, `api_key`, `card_*`.

### 2.3. Logger

```ts
// lib/observability/log.ts
import { Axiom } from '@axiomhq/js';

const axiom = new Axiom({ token: process.env.AXIOM_TOKEN });

type LogInput = Partial<CanonicalFields> & { level: Level; message: string };

export function log(input: LogInput): void {
  axiom.ingest('cne-os', [{ ts: new Date().toISOString(), ...input }]);
}
```

Helpers de contexto:

```ts
export function childLogger(ctx: { correlationId: string; module: string }) {
  return {
    info: (msg: string, extra?: object) => log({ level:'info', message:msg, ...ctx, ...extra }),
    warn: (msg: string, extra?: object) => log({ level:'warn', message:msg, ...ctx, ...extra }),
    error: (msg: string, err: unknown, extra?: object) =>
      log({ level:'error', message:msg, error: normalizeError(err), ...ctx, ...extra }),
  };
}
```

---

## 3. Vercel Analytics

Web Vitals capturados automaticamente via `@vercel/analytics/next`:

- LCP, CLS, INP, FCP, TTFB por rota.
- Dashboards nativos do Vercel.
- Complementa Sentry Performance (que foca em traces de ações).

---

## 4. Métricas custom (Axiom dataset)

Queries APL agregam latências de operações críticas. Métricas alvo:

| Métrica | Fonte | Fórmula / medição |
|---|---|---|
| `inbox_latency_ms` | `source='realtime'`, `module='MOD-INBOX'` | tempo entre `message.created_at` inbound e emissão CDC ao cliente |
| `webhook_process_ms` | `source='inngest'`, `module='MOD-INTEGRATION'` | `duration_ms` da function `processWebhook` |
| `decision_engine_ms` | `source='server-action'`, `module='MOD-OFFER'` | duração de `selectCondition` |
| `entitlement_consolidate_ms` | `source='server-action'`, `module='MOD-ENTITLEMENT'` | duração de `consolidateEntitlement` |
| `server_action_ms` | `source='server-action'` | p50, p95, p99 por action |
| `dlq_size` | `source='cron'`, função `dlq-alerter` | contagem atual por provedor |
| `webhook_signature_fail_rate` | rota de webhook | % de `signatureValid=false` por provedor |

Todas emitidas como linha de log (não métrica separada); agregação via query Axiom.

---

## 5. Alertas

| Alerta | Condição | Canal | Severidade |
|---|---|---|---|
| DLQ cresce | `webhook_log.status='dead_letter'` novos > 5 em 15min | Slack `#ops-integracoes` + Sentry | warn |
| Signature inválida suspeita | `signature_valid=false` > 1% em 15min (por provedor) | Slack + Sentry | error |
| Error rate front | Sentry error rate > 2% em 5min | Sentry alert rule -> Slack | error |
| Error rate back | Sentry backend error rate > 2% em 5min | Slack | error |
| Decision engine empate | `MOD-OFFER` retorna `tiebreakers.length > 1` em > N/h ([ADR-07](../90-meta/04-decision-log.md)) | Slack `#ops-ofertas` | warn |
| Subscription past_due | contagem de `subscription.status='past_due'` > X | Slack `#ops-financeiro` | warn |
| Cron falhando | Inngest run de cron falha 3x seguidas | Slack `#ops` | error |
| Webhook latency p95 > 500ms | handler Next.js (apenas insere log) | Slack + Sentry | warn |

Cada alerta inclui link direto para:

- Sentry issue
- Axiom query pré-montada
- Painel DLQ (quando aplicável)

---

## 6. Dashboards

### 6.1. Dashboard operacional (Fase 2)

Rota: `/app/(app)/settings/observability/page.tsx`. Acesso: `admin`.

Painéis:

| Painel | Query Axiom |
|---|---|
| Webhooks por provedor (1h) | count by `webhook.provider` |
| DLQ atual | count onde `webhook_log.status='dead_letter'` |
| P95 `webhook_process_ms` por provedor | histogram last 24h |
| Error rate Server Actions | errors / total |
| Eventos de timeline emitidos (1h) | count by `kind` |
| Top 10 lentas ações | `source='server-action'` order by `duration_ms` desc |
| Sessões ativas | Supabase auth API |

Fase 1: uso direto do dashboard Axiom + Sentry; rota interna vem na Fase 2.

### 6.2. Dashboard Inngest

Nativo no Inngest Cloud: functions, runs, retries, DLQ. Sem customização.

---

## 7. Correlation ID — propagação

| Camada | Como recebe | Como propaga |
|---|---|---|
| Middleware Next.js | header `x-correlation-id` ou gera UUID | seta em response + request context |
| Server Action | `headers().get('x-correlation-id')` | passa para domínio, audit, timeline, logger, Sentry |
| Route Handler (webhook) | header ou gera | grava em `webhook_log.correlation_id` |
| Inngest worker | `event.data.correlationId` | passa para domínio, audit, logger |
| Outbound HTTP | envia header `x-correlation-id: <id>` | parceiros externos podem correlacionar |
| DB | `audit_log.context.correlationId`, `timeline_event.correlation_id` | consulta por id |

Um único `correlation_id` liga: request -> action -> transação DB -> timeline -> audit -> webhook disparado -> job processador -> nova ação derivada.

---

## 8. Logging em produção — boas práticas

1. **Nunca** `console.log`. Sempre via `log()` do Axiom.
2. **Um log por ponto de decisão** importante, não por linha.
3. **`level='info'`** para operações bem-sucedidas (uma linha por request/job).
4. **`level='warn'`** para condições recuperáveis (retry, duplicata esperada).
5. **`level='error'`** apenas para falhas reais (captura em Sentry também).
6. **Zero PII sensível.** CPF, senha, cartão **nunca**.
7. Mensagens em **inglês curto** (`"webhook processed"`, `"rbac denied"`). Parâmetros vão em campos.

---

## 9. Uptime e monitoramento externo

Checks externos (ex.: Better Stack / UptimeRobot) monitoram:

| URL | Frequência |
|---|---|
| `GET /api/health` | 1min |
| `GET /api/webhooks/ping` (responde 200 sem lógica) | 1min |
| Página `/login` carrega | 5min |

`GET /api/health`:

```ts
export async function GET() {
  const dbOk = await pingDb();               // SELECT 1
  const storageOk = await pingStorage();     // HEAD bucket
  return NextResponse.json(
    { db: dbOk, storage: storageOk, ts: new Date().toISOString() },
    { status: dbOk && storageOk ? 200 : 503 },
  );
}
```

---

## 10. Casos de teste / verificação

| ID | Cenário | Esperado |
|---|---|---|
| CT-OBS-01 | Erro em Server Action -> Sentry captura com tags canônicas | integration |
| CT-OBS-02 | Log de job Inngest tem `correlation_id`, `inngest_run_id` | integration |
| CT-OBS-03 | PII sanitizada: payload com senha em `extra` vira `***` | unit |
| CT-OBS-04 | `GET /api/health` com DB down -> 503 | integration |
| CT-OBS-05 | Webhook signature inválida registra em Axiom com `level='warn'` | integration |
| CT-OBS-06 | Alerta DLQ dispara quando 6 mensagens em 15min | e2e / manual |

---

## 11. Open Questions

- `OQ-OBS-01`: sample 100% em performance até atingir volume N, depois cair para 10%?
- `OQ-OBS-02`: exportar stream de `audit_log` para Axiom ou manter apenas em Postgres?
- `OQ-OBS-03`: consolidar alertas num router (ex.: PagerDuty) quando houver on-call?
