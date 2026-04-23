# 01 — Visão geral da arquitetura

Visão de alto nível do CNE-OS: blocos, fluxos canônicos e dependências entre módulos. Ponto de partida antes de qualquer decisão de implementação. Leia também [`02-stack.md`](./02-stack.md) e [`09-module-boundaries.md`](./09-module-boundaries.md).

---

## 1. Diagrama de blocos

```
                +----------------------------+
                |  Cliente (Browser / PWA)   |
                |  React Server Components   |
                |  Tailwind + shadcn/ui      |
                +-------------+--------------+
                              |
                              | HTTPS (Server Actions / fetch)
                              v
+--------------------------------------------------------------+
|                    Next.js App Router (Vercel)               |
|                                                              |
|  /app/(app)/...           /app/api/webhooks/<provider>/...   |
|  Server Actions           Route Handlers (entrada externa)   |
|  requireSession +         verifySignature +                  |
|  requirePermission        ingestWebhook -> webhook_log       |
|  -> domain/<mod>          -> inngest.send()                  |
|       |        |                                             |
|       v        v                                             |
|  emitTimelineEvent  logAudit   (mesma transação SQL)         |
+-------+--------------+-------------------------+-------------+
        |              |                         |
        | Drizzle      | Drizzle                 | Inngest client
        v              v                         v
+---------------------------+            +--------------------+
|  Postgres (Supabase)      |<---CDC---->|  Supabase Realtime |
|  - tabelas de domínio     |            |  (pg_notify)       |
|  - audit_log (append)     |            +---------+----------+
|  - timeline_event (append)|                      |
|  - transaction_snapshot   |                      | WebSocket
|  - webhook_log            |                      v
|  - *_history (append)     |            +--------------------+
+------------+--------------+            |  Cliente (inbox,   |
             ^                           |  timeline, inbox)  |
             |                           +--------------------+
             | Drizzle (tx)
             |
+------------+---------------+
|      Inngest Workers       |
|  - processWebhook          |
|  - subscription-advance    |
|  - dunning-retry           |
|  - automation executor     |
|  - dlq-alerter             |
+------+---------+-----------+
       |         |
       |         | Adapters (lib/integrations/<p>)
       v         v
+-------------+  +-------------------+  +--------------------+
| Supabase    |  | Digital Guru      |  | Brevo / WhatsApp / |
| Storage     |  | (checkout)        |  | Notazz / Analytics |
| (anexos)    |  +-------------------+  +--------------------+
+-------------+
```

---

## 2. Fluxo de requisição típica (UI -> DB)

Exemplo: operador aprova reembolso pela UI.

```
1. Browser    -> POST RSC payload para Server Action `approveRefund`
2. Middleware Next.js injeta `x-correlation-id`
3. Action    -> requireSession()            (Supabase Auth + cookies)
4. Action    -> zod.parse(input)            (validação externa)
5. Action    -> requirePermission(ctx, 'refund.approve', ...)
                (consulta matriz RBAC + 2FA fresh)
6. Action    -> db.transaction(tx => {
                  domain.approveRefundDomain(tx, ...)
                    -> revokeEntitlement(tx, ...)
                    -> flagSnapshotRefunded(tx, ...)
                  emitTimelineEvent(tx, TE-SALE-REFUNDED)
                  logAudit(tx, { action_kind:'refund', ... })
                })
7. Action    -> revalidatePath('/transactions/[id]')
8. Action    -> return { ok:true, data }
9. Supabase Realtime emite mudança em `timeline_event` via CDC
10. Cliente aberto na timeline do contato re-renderiza via subscription
```

Invariantes:

- RBAC **antes** da transação.
- Timeline + audit **dentro** da transação (atomicidade).
- `revalidatePath` **fora** da transação.
- Correlation ID propaga para Sentry, Axiom e `audit_log.context`.

Ver [`30-contracts/05-api-server-actions.md`](../30-contracts/05-api-server-actions.md).

---

## 3. Fluxo de webhook típico (externo -> domínio)

Exemplo: Digital Guru notifica venda aprovada.

```
1. Digital Guru  -> POST /api/webhooks/digital-guru
2. Route Handler -> verifySignature(rawBody, header)   (HMAC-SHA256)
3. Route Handler -> extractEventId(payload)
4. Route Handler -> ingestWebhook(...) INSERT webhook_log
                    UNIQUE(provider, external_event_id) = idempotência
5. Route Handler -> inngest.send('webhook/digital-guru.received')
6. Route Handler -> 200 OK (<1s, sem processamento pesado)

7. Inngest worker recebe evento, abre step.run:
   - SELECT webhook_log FOR UPDATE SKIP LOCKED
   - mapToInternal(payload)
   - db.transaction(tx => {
       upsertContact(tx, ...)              (MOD-CONTACT)
       createTransaction(tx, ...)          (MOD-TRANSACTION)
       approveTransaction(tx, ...)         (snapshot + entitlement + counter)
       emitTimelineEvent(tx, TE-SALE-APPROVED)
       logAudit(tx, actor_system='digital_guru')
     })
   - UPDATE webhook_log SET status='processed', processed_at=now()

8. Falha transitória: retry com backoff 5/30/150/750/3750s
9. 5 falhas -> status='dead_letter', alerta Sentry + Slack
```

Ver [`30-contracts/04-webhook-contracts.md`](../30-contracts/04-webhook-contracts.md), [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md).

---

## 4. Serviços externos

| Serviço | Papel | Direção | Criticidade |
|---|---|---|---|
| Supabase (Postgres + Auth + Realtime + Storage) | DB, auth, CDC, armazenamento | Bidirecional | Crítico |
| Vercel | Host do front + Server Actions + Route Handlers | Hospedagem | Crítico |
| Inngest | Orquestração de jobs, webhooks, crons, DLQ | Bidirecional | Crítico |
| Digital Guru Manager | Checkout, transações, assinaturas, reembolsos | Entrada (webhook) + saída (API) | Crítico |
| Brevo | E-mail transacional e marketing | Saída (API) + entrada (webhook de eventos) | Alta |
| WhatsApp Cloud API (Meta) | Mensageria WhatsApp | Bidirecional (mensagens + status) | Alta |
| Notazz | Emissão fiscal (NFe/NFS-e) | Saída (API) + entrada (webhook) | Média |
| Sentry | Erros front + back | Saída | Alta |
| Axiom | Logs estruturados + métricas custom | Saída | Alta |
| Vercel Analytics | Web vitals e telemetria de rota | Saída | Média |

Credenciais sempre em env vars do Vercel/Supabase (ver [`08-nfr.md §Segurança`](./08-nfr.md)). Rotação trimestral.

---

## 5. Dependências entre módulos

Mapa resumido (detalhe em [`../20-domain/README.md`](../20-domain/README.md)):

```
MOD-ORG          <- base de todos
MOD-CONTACT      <- MOD-MERGE, MOD-TIMELINE, MOD-INBOX, MOD-TICKET,
                    MOD-FUNNEL, MOD-TRANSACTION, MOD-REFUND
MOD-CATALOG      <- MOD-OFFER
MOD-OFFER        <- MOD-TRANSACTION, MOD-BILLING
MOD-TRANSACTION  <- MOD-ENTITLEMENT, MOD-REFUND, MOD-BILLING
MOD-FUNNEL       <- MOD-CAMPAIGN
MOD-TIMELINE     <- emissor universal (write) — todos os módulos escrevem via emitTimelineEvent
MOD-AUTOMATION   <- ouvinte universal (via triggerFlow)
```

Regras invioláveis:

1. **Escrita:** apenas via interface pública do módulo dono (ver [`30-contracts/07-module-interfaces.md`](../30-contracts/07-module-interfaces.md)).
2. **Leitura cross-module:** também via interface pública. `SELECT` ad-hoc em tabela alheia é bug de arquitetura.
3. **Timeline:** único ponto de escrita é `emitTimelineEvent`. Tabela `timeline_event` é append-only (trigger).
4. **Audit:** único ponto de escrita é `audit(tx, entry)`. Tabela `audit_log` é append-only (trigger).

---

## 6. Três camadas (da UI ao DB)

| Camada | Responsabilidade | Exemplo de arquivo |
|---|---|---|
| UI (RSC + client components) | Renderizar, capturar input, invocar Server Action. **Nunca** fala com DB. | `app/(app)/refunds/page.tsx` |
| Server Action | Sessão, validação, RBAC, orquestração, revalidação de cache. Uma transação SQL. | `app/(app)/refunds/actions.ts` |
| Domínio puro | Regras de negócio sem I/O, testáveis com vitest. | `lib/domain/refund/approve.ts` |
| Integração | Adaptador externo, webhook handler, mapeamento canônico. | `lib/integrations/digital-guru/mapper.ts` |
| Job (Inngest) | Processamento assíncrono, cron, DLQ. | `inngest/functions/webhook-digital-guru.ts` |
| DB | Postgres gerenciado via Supabase + Drizzle. | `lib/db/schema/contact.ts` |

---

## 7. Observabilidade transversal

- **Correlation ID** atravessa request -> action -> domínio -> job -> log -> audit.
- **Sentry** tags: `brand_id`, `user_id`, `correlation_id`, `webhook.provider`.
- **Axiom** logs JSON com campos canônicos (ver [`07-observability.md`](./07-observability.md)).
- **Realtime** entrega mudanças ao cliente sem polling.

---

## 8. O que esta visão NÃO cobre

- Estratégia de deploy (blue/green, canary) — Fase 2.
- Multi-região — não aplicável; Supabase single-region + Vercel edge cache.
- Réplica de leitura — não há; Supabase Postgres único.
- Serviço de busca full-text dedicado — Fase 2 (Postgres `tsvector` na Fase 1).

---

## 9. Referências

- [`02-stack.md`](./02-stack.md) — stack detalhada com versões.
- [`03-data-layer.md`](./03-data-layer.md) — data layer + RLS + audit tables.
- [`04-integrations-canonical.md`](./04-integrations-canonical.md) — padrão de adaptador.
- [`05-realtime-jobs.md`](./05-realtime-jobs.md) — Realtime e Inngest.
- [`06-auth-rbac-audit.md`](./06-auth-rbac-audit.md) — auth, RBAC e auditoria.
- [`09-module-boundaries.md`](./09-module-boundaries.md) — ownership e interfaces.
