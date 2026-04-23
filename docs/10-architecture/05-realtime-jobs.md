# 05 — Realtime e Jobs

Padrão de tempo real (Supabase Realtime) e de orquestração assíncrona (Inngest). Complementa [`01-overview.md`](./01-overview.md) e [`04-integrations-canonical.md`](./04-integrations-canonical.md).

---

## 1. Supabase Realtime

Tempo real baseado em **Postgres CDC** (Change Data Capture) via `pg_notify` / replicação lógica. Cliente assina canais e recebe mudanças sem polling.

### 1.1. Canais canônicos

| Canal | Evento | Consumidor | Propósito |
|---|---|---|---|
| `conversations:brand_<brandId>` | `INSERT`, `UPDATE` em `conversation` | Inbox do operador | Lista de conversas recebe nova mensagem / mudança de status |
| `conversation:<conversationId>` | `INSERT` em `message` | Tela da conversa aberta | Mensagem nova aparece instantânea |
| `timeline:contact_<contactId>` | `INSERT` em `timeline_event` (filtrado por `contact_id`) | Perfil do contato | Eventos novos atualizam timeline |
| `inbox:user_<userId>` | `UPDATE` em `conversation` quando `assignee_user_id = userId` | Badge de inbox pessoal | Notificação de atribuição |
| `dlq:ops` | `INSERT` / `UPDATE` em `webhook_log` onde `status='dead_letter'` | Tela DLQ | Alerta operacional |
| `presence:conversation_<id>` | Presence API nativa | Conversa aberta | Indicador de "operador digitando" / "agente online" |

Nomenclatura: `<escopo>:<chave>`. Escopo sempre derivado de `brand_id`, `user_id` ou `contact_id` — nunca canal global para dados de domínio.

### 1.2. Habilitação

Replicação lógica habilitada por tabela via UI Supabase ou SQL:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE conversation;
ALTER PUBLICATION supabase_realtime ADD TABLE message;
ALTER PUBLICATION supabase_realtime ADD TABLE timeline_event;
ALTER PUBLICATION supabase_realtime ADD TABLE webhook_log;
```

Tabelas não listadas **não** emitem CDC — decisão explícita.

### 1.3. Consumidor front — padrão

```ts
// components/inbox/use-conversation-subscription.ts
'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useConversationSubscription(conversationId: string) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message',
          filter: `conversation_id=eq.${conversationId}` },
        () => router.refresh(),   // dispara revalidação do RSC
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, router]);
}
```

Padrão: subscription apenas dispara `router.refresh()` — dados vêm da Server Action/RSC que já aplica RBAC e joins corretos. **Nunca** consumir o payload CDC diretamente na UI como fonte da verdade.

### 1.4. Autorização Realtime

RLS filtra as linhas que o cliente pode ver. Na Fase 1 (`USING (true)`), qualquer usuário autenticado vê mudanças; na Fase 2 (`brand_scope`), filtra automaticamente.

### 1.5. Notificações desktop

Quando conversa é **atribuída ao usuário logado** (`conversation.assignee_user_id = me`), a subscription dispara Web Notifications API:

```ts
if (Notification.permission === 'granted') {
  new Notification('Nova conversa atribuída', {
    body: `Contato: ${contactName}`,
    tag: `conv-${conversationId}`,    // agrupa notificações da mesma conversa
  });
}
```

Permissão solicitada no primeiro login com explicação contextual.

---

## 2. Inngest

### 2.1. Organização

```
/inngest
  client.ts                        # inngest client singleton
  functions/
    webhook-digital-guru.ts        # processa webhook/digital-guru.received
    webhook-brevo.ts
    webhook-whatsapp.ts
    webhook-notazz.ts
    subscription-cycle.ts          # cron: adiantar ciclos
    dunning-retry.ts               # cron: inadimplência
    dlq-alerter.ts                 # cron: alertar DLQ
    automation-executor.ts         # executa AutomationFlow
    outbound-dispatch.ts           # processa outbound/*
    entitlement-expire.ts          # cron: expirar entitlements
  index.ts                         # export central para `app/api/inngest`
```

Rota de serve: `app/api/inngest/route.ts` via `@inngest/next`. Assinatura de webhooks Inngest validada pelo SDK.

### 2.2. Política de retries

Base canônica ([`30-contracts/04-webhook-contracts.md §4`](../30-contracts/04-webhook-contracts.md)):

| Tentativa | Delay |
|---|---|
| 1 | imediato |
| 2 | 5 s |
| 3 | 30 s |
| 4 | 150 s |
| 5 | 750 s |
| 6 | 3750 s |
| 7ª | sem reenfileirar -> `dead_letter` |

Declaração na function:

```ts
{
  id: 'digital-guru-webhook-process',
  retries: 5,
  concurrency: { limit: 20, key: 'event.data.webhookLogId' },
  throttle: { limit: 200, period: '1m' },
}
```

Jitter ±20% aplicado pelo Inngest por padrão.

### 2.3. Concurrency e idempotência

- `concurrency.key = 'event.data.webhookLogId'` impede processar o mesmo webhook 2x em paralelo.
- Além disso, toda function carrega **idempotência interna**: primeiro passo consulta `webhook_log.status` e retorna noop se `processed`.
- Fan-out (ex.: reprocessar DLQ em lote) usa `step.sendEvent` para disparar múltiplos eventos filhos — cada um retoma a garantia de idempotência.

### 2.4. `step.run`

Toda chamada com efeito colateral fica dentro de `step.run('nome', async () => { ... })`:

- Permite retomar da última etapa bem-sucedida em caso de crash.
- Gera timeline de execução observável no dashboard Inngest.

Exemplo multi-step:

```ts
await step.run('load', () => loadWebhookLog(id));
await step.run('domain', () => db.transaction((tx) => ingestDomain(tx, canonical)));
await step.run('mark-processed', () => markProcessed(id));
```

### 2.5. Idempotency key no evento

Quando eventos externos podem duplicar no disparo ao Inngest, usar `id` no `inngest.send`:

```ts
await inngest.send({
  id: `webhook-digital-guru-${externalEventId}`,
  name: 'webhook/digital-guru.received',
  data: { webhookLogId, correlationId },
});
```

Inngest deduplica por `id` dentro de janela de 24h.

---

## 3. Crons canônicos

Declaração via `inngest.createFunction({ cron: '...' })`:

| Função | Cron | Responsabilidade |
|---|---|---|
| `subscription-advance` | `0 * * * *` (hora em hora) | Avançar ciclos de `subscription` vencidos, gerar `installment` pendente |
| `dunning-retry` | `0 9 * * *` (09:00 diário) | Tentar cobrança de `installment` em `overdue`, acionar comunicação |
| `dlq-alerter` | `*/15 * * * *` (a cada 15min) | Verificar `webhook_log.status='dead_letter'` e emitir alerta agregado |
| `entitlement-expire` | `0 2 * * *` (02:00 diário) | Marcar `entitlement.status='expired'` quando `ends_at < now()` |
| `export-audit-cold` | `0 3 * * 0` (domingo 03:00) | Snapshot semanal para bucket cold |
| `analytics-rollup` | `30 3 * * *` (03:30 diário) | Agregações de dashboards |

Timezone base: UTC. Horários de negócio em America/Sao_Paulo convertidos.

### 3.1. Boas práticas de cron

1. **Lote pequeno.** Cada run processa até N (ex.: 500) registros; próximo run pega resto. Evita timeout Inngest.
2. **Marcador de progresso** em tabela quando processamento atômico requer retomar de onde parou.
3. **Observabilidade:** logar início/fim/quantidade processada em Axiom.
4. **Idempotência:** cron deve poder ser re-executado sem duplicar efeito.

---

## 4. Mapa de functions por domínio

| Função | Evento / cron | Chama (interface pública) |
|---|---|---|
| `webhook-digital-guru-process` | `webhook/digital-guru.received` | `upsertContact`, `createTransaction`, `approveTransaction`, `startSubscription`, `recordInstallment`, `flagSnapshotRefunded` |
| `webhook-brevo-process` | `webhook/brevo.received` | `emitTimelineEvent` (evento de e-mail), `appendMessage` (quando reply) |
| `webhook-whatsapp-process` | `webhook/whatsapp.received` | `openOrReopenConversation`, `appendMessage` |
| `webhook-notazz-process` | `webhook/notazz.received` | `emitTimelineEvent` (`TE-INVOICE-*`) |
| `subscription-cycle` | cron | `advanceSubscription`, `recordInstallment` |
| `dunning-retry` | cron | `recordInstallment` (reexecução), `triggerFlow('dunning_step')` |
| `automation-executor` | `automation/flow.triggered` | `executeFlow` (internal) |
| `outbound-dispatch` | `outbound/<provider>.dispatch` | HTTP externo + `markProcessed` |
| `entitlement-expire` | cron | `revokeEntitlement` (status='expired') |
| `dlq-alerter` | cron | Sentry capture + Slack |

---

## 5. Local dev

```bash
pnpm inngest:dev         # servidor local Inngest em http://localhost:8288
```

Dashboard mostra eventos, steps, retries, logs em tempo real. Em dev, `webhook/digital-guru.received` pode ser disparado manualmente pela UI Inngest para testar o processor.

---

## 6. Observabilidade

| Mecanismo | Campos |
|---|---|
| Inngest dashboard | Runs, duração, steps, payloads, retries |
| Axiom | Log estruturado com `function_id`, `run_id`, `step`, `duration_ms`, `correlation_id` |
| Sentry | Erro com tags `inngest.function`, `inngest.run_id`, `correlation_id` |

Alerta: `dead_letter > 0` disparado pelo `dlq-alerter` agrega por provedor e envia Slack `#ops-integracoes` a cada 15min quando houver novos.

---

## 7. Limites operacionais

| Item | Limite Fase 1 |
|---|---|
| Concurrency por function | 20 (default); ajustar por gargalo |
| Throughput webhooks | ~200/min por provedor (throttle) |
| Duração máxima por step | 30s (padrão Inngest) |
| Payload máximo de evento | 1MB |
| Retenção de runs no Inngest | 7 dias (plano padrão) |

Excedido qualquer limite -> investigar e dimensionar via ADR.

---

## 8. Casos de teste

| ID | Cenário | Onde |
|---|---|---|
| CT-JOB-01 | Webhook processa na 1ª tentativa | integration (Postgres + Inngest dev) |
| CT-JOB-02 | Webhook falha 2x, sucesso na 3ª | integration — mockar domínio |
| CT-JOB-03 | Webhook 5 falhas -> `dead_letter`, alerta enviado | integration |
| CT-JOB-04 | Cron `subscription-advance` não duplica ciclo em re-run | integration |
| CT-JOB-05 | `concurrency.key` bloqueia duplicata paralela | unit Inngest mock |
| CT-JOB-06 | `inngest.send` com `id` idempotente deduplica | integration |
| CT-JOB-07 | Realtime: cliente recebe CDC após `appendMessage` | E2E |

---

## 9. Open Questions

- `OQ-JOB-01`: centralizar declaração de crons em config único (arquivo `crons.ts`) para tooling?
- `OQ-JOB-02`: abrir `webhook_log` com `FOR UPDATE SKIP LOCKED` vale a pena dado que `concurrency.key` já serializa?
- `OQ-JOB-03`: limitar notificações desktop para turno comercial (não disparar fora de expediente)?
