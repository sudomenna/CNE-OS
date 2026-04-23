# Integração Brevo

## Papel

Provedor de envio de e-mail (transacional e marketing) + fonte de eventos de engajamento (entrega, abertura, clique, bounce, unsubscribe, reclamação de spam). Cada evento do Brevo vira `TE-INTEGRATION-EVENT` na timeline do contato, com reflexos em `contact_email.status` (hard bounce → `invalid`, unsubscribe → `unsubscribed`).

Adaptador: `/lib/integrations/brevo/`. Contrato de recepção em [`../30-contracts/04-webhook-contracts.md#52-brevo`](../30-contracts/04-webhook-contracts.md#52-brevo).

## Eventos consumidos

Rota: `POST /api/webhooks/brevo`. Header: `X-Brevo-Signature` (HMAC-SHA256 com `BREVO_WEBHOOK_SECRET`). `external_event_id = payload.message-id + ':' + payload.event` (concatenação quando `payload.id` ausente). `event_kind = payload.event`.

| `external_event` | Ação interna | BRs | TEs | `idempotency_key` |
|---|---|---|---|---|
| `delivered` | emitir `TE-INTEGRATION-EVENT` com `payload.reason='email_delivered'`; atualizar métrica | BR-INTEGRATION-IDEMPOTENCY | `TE-INTEGRATION-EVENT` | `message-id:delivered` |
| `opened` (e `unique_opened`) | emitir `TE-INTEGRATION-EVENT`; opcional: disparar automação `automation_trigger_kind='brevo_event'` | BR-INTEGRATION-IDEMPOTENCY | `TE-INTEGRATION-EVENT` | `message-id:opened:{timestamp}` quando duplicar |
| `clicked` | emitir `TE-INTEGRATION-EVENT` com `payload.link`; se link é `trackable_link` interno, delegar a `MOD-CAMPAIGN.recordClick` (emite `TE-CAMPAIGN-CLICK`) | BR-INTEGRATION-IDEMPOTENCY | `TE-INTEGRATION-EVENT`, `TE-CAMPAIGN-CLICK` | `message-id:clicked:{link_hash}` |
| `soft_bounce` | contador; sem mudar status do e-mail (recuperável) | BR-INTEGRATION-IDEMPOTENCY | `TE-INTEGRATION-EVENT` | `message-id:soft_bounce` |
| `hard_bounce` | `UPDATE contact_email SET status='invalid' WHERE value=payload.email` | BR-IDENTITY (propagação); BR-CONTACT-CLASSIFICATION (indireto) | `TE-INTEGRATION-EVENT`, `TE-CONTACT-UPDATED` | `message-id:hard_bounce` |
| `unsubscribed` | `UPDATE contact_email SET status='unsubscribed'`; remove contato de listas Brevo por sincronização | — | `TE-INTEGRATION-EVENT`, `TE-CONTACT-UPDATED` | `message-id:unsubscribed` |
| `spam` / `complained` | `UPDATE contact_email SET status='unsubscribed'`; `TE-INTEGRATION-EVENT` com severidade alta; alertar marketing | — | `TE-INTEGRATION-EVENT` | `message-id:spam` |

`webhook_log.failed` para eventos de tipos desconhecidos (não descartar — DLQ por default).

## Eventos emitidos (outbound)

Envio via API transacional e API de marketing.

| Ação interna | Endpoint Brevo | Idempotency |
|---|---|---|
| Enviar e-mail transacional (reset de senha, confirmação de compra, NF-e pronta) | `POST /v3/smtp/email` | `txn:{purpose}:{contactId}:{dedupeKey}` |
| Enviar campanha de marketing (template) | `POST /v3/smtp/email` com `templateId` | `mkt:{campaignId}:{contactId}:{sendId}` |
| Adicionar contato a lista | `POST /v3/contacts` / `PUT /v3/contacts/{id}` | `contact:{contactId}:list:{listId}` |
| Remover contato de lista (unsubscribe propagado) | `DELETE /v3/contacts/lists/{listId}/contacts/remove` | `contact:{contactId}:unsub:{listId}` |

Outbound grava em `webhook_log` antes do HTTP (§8 de webhook-contracts). Retry/DLQ iguais.

## Mapeamento canônico

| `external_field` | `internal_field` | Transformação |
|---|---|---|
| `payload.message-id` | `webhook_log.external_event_id` (parte) | cópia |
| `payload.event` | `webhook_log.event_kind` | cópia |
| `payload.email` | lookup `contact_email.value` → `contact_id` | `lower().trim()`; não encontrado → grava `TE-INTEGRATION-EVENT` sem `contact_id` (orfão rastreável) |
| `payload.date` | `TE.occurred_at` | ISO-8601 → `timestamptz` |
| `payload.tag[]` | payload do TE | cópia como array |
| `payload.link` | payload do TE (quando `clicked`) | cópia |
| `payload.reason` | `last_error` / payload do TE | cópia |
| Brevo `list_id` | `tag` interna | mapeamento configurável em `integration_config.brevo.list_to_tag` — ausente → nenhuma tag aplicada |
| Brevo `segment` | `tag` interna | idem |

## Idempotência / retry / DLQ

- UNIQUE `(provider='brevo', external_event_id)`.
- Brevo reentrega com intensidade moderada; abertura e clique podem ter múltiplos eventos por mensagem — `external_event_id` inclui timestamp/hash do link para permitir registro múltiplo válido.
- Retry 5× backoff padrão. DLQ → alerta Axiom (baixa severidade — engajamento, não financeiro).
- Reprocesso por `admin` via FLOW-12.

## Credenciais e configuração (env vars)

```
BREVO_API_KEY=<xkeysib-...>
BREVO_WEBHOOK_SECRET=<segredo HMAC configurado no painel Brevo>
BREVO_SENDER_EMAIL=<no-reply@cne.edu.br>
BREVO_SENDER_NAME=CNE Educação
BREVO_LIST_MAP=<json {"list_id":"tag_name"}>  # opcional
```

## Limitações conhecidas

1. **Sem `external_event_id` nativo** — composto de `message-id + event [+ suffix]`. Ver OQ-BR-IDEM-01.
2. **Rate limit API** — 400 req/s; outbound em lote deve respeitar; usar endpoint batch quando > 1k destinatários.
3. **Template approval** — templates precisam existir no painel Brevo antes do envio; não há criação via API na Fase 1.
4. **Webhooks de lista (adicionar/remover)** — não consumidos na Fase 1; sincronização é sempre outbound (CNE-OS é fonte da verdade).
5. **Unsubscribe bidirecional** — se o contato der unsubscribe diretamente no Brevo, o webhook `unsubscribed` propaga para o CNE-OS; se o CNE-OS marca `unsubscribed`, o outbound de remoção de lista é obrigatório para impedir envios.

## Casos de teste

| ID | Cenário | Resultado |
|---|---|---|
| CT-BR-01 | `delivered` de e-mail transacional | `TE-INTEGRATION-EVENT` emitido; métrica incrementada |
| CT-BR-02 | `opened` duplicado (mesmo `message-id` + timestamp diferente) | ambos registrados; idempotency key distinto por timestamp |
| CT-BR-03 | `clicked` em `trackable_link` interno | `TE-INTEGRATION-EVENT` + `TE-CAMPAIGN-CLICK` (via MOD-CAMPAIGN) |
| CT-BR-04 | `hard_bounce` | `contact_email.status='invalid'`; `TE-CONTACT-UPDATED` |
| CT-BR-05 | `unsubscribed` | `contact_email.status='unsubscribed'`; outbound remove de lista |
| CT-BR-06 | `spam` | mesmo efeito de unsubscribe + alerta |
| CT-BR-07 | HMAC inválida | 401; sem linha |
| CT-BR-08 | E-mail desconhecido (sem `contact` matching) | `TE-INTEGRATION-EVENT` com `contact_id=NULL`; investigar |
| CT-BR-09 | Outbound transacional idempotente | 2ª chamada mesma key → no-op, sem envio duplicado |
| CT-BR-10 | Rate limit (429) | retry backoff; eventualmente sucesso |

## Open Questions

- `OQ-BR-01` — Sincronização bidirecional de tags ↔ listas Brevo em tempo real ou por cron? Fase 1: outbound on-demand.
- `OQ-BR-02` — Quando hard_bounce acontece em e-mail `primary`, promover `alternative` a `primary` automaticamente? Proposta: sim, se existir.
- `OQ-BR-03` — Registrar `opened` agregado por sessão ou cada abertura? Cruza com OQ-TE-02.
