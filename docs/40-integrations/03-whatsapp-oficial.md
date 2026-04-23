# Integração WhatsApp API Oficial (Meta Cloud API)

## Papel

Canal de mensageria primário do inbox. Suporta múltiplos números (um por marca ou grupo), recepção de mensagens (texto, mídia, localização, reação, status) e envio (mensagem de sessão dentro da janela de 24h ou template aprovado fora dela). Cada evento relevante emite `TE-MESSAGE-INBOUND`/`TE-MESSAGE-OUTBOUND` via MOD-INBOX.

Adaptador: `/lib/integrations/whatsapp/`. Contrato de recepção em [`../30-contracts/04-webhook-contracts.md#53-whatsapp-cloud-api-meta`](../30-contracts/04-webhook-contracts.md#53-whatsapp-cloud-api-meta).

## Eventos consumidos

Rota: `POST /api/webhooks/whatsapp` + `GET` para verificação inicial (responder `hub.challenge`). Header: `X-Hub-Signature-256` (HMAC-SHA256 com `WHATSAPP_APP_SECRET`). Meta agrupa múltiplos eventos em um mesmo request — o handler itera `payload.entry[].changes[].value.messages[]` e `.statuses[]` e grava **uma linha em `webhook_log` por evento interno**.

| `external_event` (derivado) | Ação interna | BRs | TEs | `idempotency_key` |
|---|---|---|---|---|
| `messages[].type='text'` | `appendMessage(direction='inbound', body=text.body, externalMessageId=message.id)`; `openOrReopenConversation` se necessário | BR-INTEGRATION-IDEMPOTENCY | `TE-MESSAGE-INBOUND`, `TE-CONVERSATION-OPENED`/`REOPENED` | `messages[].id` |
| `messages[].type IN ('image','audio','video','document','sticker')` | baixar mídia via `GET /v17.0/{media-id}` → Supabase Storage; `appendMessage` com `body=caption ?? ''`, `attachments=[{kind, url}]` | BR-INTEGRATION-IDEMPOTENCY | `TE-MESSAGE-INBOUND` | `messages[].id` |
| `messages[].type='location'` | `appendMessage` com payload `{lat, lng, name?}` | — | `TE-MESSAGE-INBOUND` | `messages[].id` |
| `messages[].type='reaction'` | `appendMessage` com kind=`reaction`, `refersTo=message_id`, `emoji` | — | `TE-MESSAGE-INBOUND` | `messages[].id` |
| `messages[].type='interactive'` (botão/list reply) | `appendMessage` com `body=reply.title`, `payload=reply.id` | — | `TE-MESSAGE-INBOUND` | `messages[].id` |
| `statuses[].status='sent'` | atualizar `message.delivery_status='sent'` | — | — (não gera TE) | `statuses[].id + ':sent'` |
| `statuses[].status='delivered'` | `message.delivery_status='delivered'` | — | — | `statuses[].id + ':delivered'` |
| `statuses[].status='read'` | `message.delivery_status='read'`, `read_at=statuses.timestamp` | — | — | `statuses[].id + ':read'` |
| `statuses[].status='failed'` | `message.delivery_status='failed'`, grava `error.code/title`; reabrir ticket se recorrente | — | `TE-INTEGRATION-EVENT` | `statuses[].id + ':failed'` |

## Eventos emitidos (outbound)

| Ação interna | Endpoint Meta | Idempotency |
|---|---|---|
| Resposta livre dentro da janela de 24h (session message) | `POST /v17.0/{phone-number-id}/messages` (type=text/image/document) | `conv:{conversationId}:msg:{internalMessageId}` |
| Envio fora da janela — obriga `template` aprovado | `POST /v17.0/{phone-number-id}/messages` (type=template) | `template:{templateName}:{contactId}:{dedupeKey}` |
| Marcação manual de leitura (read receipt quando operador abre conversa) | `POST /v17.0/{phone-number-id}/messages` (status=read) | `read:{conversationId}:{messageId}` |
| Upload de mídia outbound | `POST /v17.0/{phone-number-id}/media` | `media:{internalMessageId}` |

Regra de janela: se `now() - last_inbound_at > 24h`, envio de texto livre **é bloqueado** pelo MOD-INBOX; UI obriga escolher template aprovado. Violação do provedor seria erro 131047 (`re-engagement_message`) — tratamento: marcar `failed`, sugerir template na UI.

## Mapeamento canônico

| `external_field` | `internal_field` | Transformação |
|---|---|---|
| `entry[].id` | `channel_account.external_waba_id` (lookup) | resolve WABA → marca |
| `changes[].value.metadata.phone_number_id` | `channel_account.external_phone_number_id` | lookup → resolve número → marca |
| `messages[].from` | `contact_phone.value` | `+` prefix, E.164 normalize |
| `messages[].id` | `message.external_message_id` | cópia |
| `messages[].timestamp` | `message.occurred_at` | epoch → `timestamptz` |
| `messages[].text.body` | `message.body` | cópia |
| `messages[].<media>.id` | download → Supabase Storage; `message.attachments[].url` | baixar com `WHATSAPP_ACCESS_TOKEN`, armazenar em bucket `inbox-media/{brandId}/` |
| `messages[].context.id` | `message.in_reply_to_external_id` | cópia (reply) |
| `contacts[].profile.name` | hint para `contact.full_name` | só aplica se contato novo (não sobrescreve existente) |
| `statuses[].id` | cruza com `message.external_message_id` | lookup |
| `statuses[].errors[0]` | `message.error` | serializado |

## Idempotência / retry / DLQ

- UNIQUE `(provider='whatsapp_official', external_event_id)` onde `external_event_id` é `messages[].id` ou `statuses[].id + ':' + status`.
- Meta reentrega agressivamente (até o handler responder 200). Handler sempre 200 após validação de assinatura, mesmo em duplicatas.
- Quebra de múltiplos eventos por request: iterar antes de `ingestWebhook`; se qualquer um falha, os outros ainda foram persistidos independentes.
- Retry 5× backoff. DLQ → alerta Slack `#ops-integracoes`.
- Volume alto → backoff base pode precisar ser menor (OQ-WH-01). Fase 1: mantém padrão.

## Credenciais e configuração (env vars)

```
WHATSAPP_APP_SECRET=<segredo do app Meta para HMAC>
WHATSAPP_ACCESS_TOKEN=<system user access token com permissão whatsapp_business_messaging>
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<token definido no painel Meta para handshake GET>
WHATSAPP_PHONE_NUMBER_ID_CNE=<id do número principal>
WHATSAPP_PHONE_NUMBER_ID_<BRAND_B>=<id por marca adicional>
WHATSAPP_WABA_ID=<id do WABA>
WHATSAPP_API_VERSION=v17.0
```

Mapeamento phone_number_id → `channel_account` vive no banco (tabela `channel_account` em MOD-INBOX), não em env.

## Limitações conhecidas

1. **Janela de 24h** — fora dela, apenas templates aprovados pela Meta; UI precisa forçar escolha de template.
2. **Aprovação de templates** — templates novos levam 24-48h; operação mantém catálogo pré-aprovado em `message_template` (MOD-INBOX).
3. **Sem edição de mensagem** — Meta não suporta edição; mensagens enviadas são imutáveis.
4. **Reações como evento** — podem poluir timeline; Fase 1 registra como message `kind='reaction'` sem TE próprio.
5. **Mídia expira** — URLs de mídia Meta expiram em ~5min; handler deve baixar e persistir em Supabase Storage imediatamente.
6. **Rate limit** — 80 msg/s por número na camada default; throttle no outbound obrigatório.
7. **Verificação GET** — rota precisa responder 200 com `hub.challenge` em plaintext quando `hub.mode=subscribe` e `hub.verify_token` bate.
8. **Sem CSAT nativo** — pesquisa de satisfação via template interativo (Fase 2).

## Casos de teste

| ID | Cenário | Resultado |
|---|---|---|
| CT-WA-01 | Mensagem de texto inbound nova | cria conversa + message + `TE-MESSAGE-INBOUND` + `TE-CONVERSATION-OPENED` |
| CT-WA-02 | Reentrega do mesmo `messages[].id` | idempotent no-op |
| CT-WA-03 | Mensagem com imagem | mídia baixada e gravada em Storage; `message.attachments` populado |
| CT-WA-04 | Status `read` para mensagem outbound | `delivery_status='read'`, `read_at` preenchido |
| CT-WA-05 | Envio outbound dentro da janela | 200 Meta; `message.delivery_status='sent'` |
| CT-WA-06 | Envio outbound fora da janela com texto livre | MOD-INBOX rejeita antes do HTTP com erro `out_of_session_window` |
| CT-WA-07 | Envio outbound fora da janela com template aprovado | 200 Meta; mensagem persistida |
| CT-WA-08 | Assinatura `X-Hub-Signature-256` inválida | 401; sem linha |
| CT-WA-09 | GET `hub.challenge` handshake | 200 com challenge em plaintext |
| CT-WA-10 | Request com 5 `messages[]` | 5 linhas distintas em `webhook_log`; 5 inserções idempotentes |
| CT-WA-11 | Status `failed` (error 131047) | `delivery_status='failed'`; `TE-INTEGRATION-EVENT` gerado |

## Open Questions

- `OQ-WA-01` — Reações viram TE próprio ou ficam só em `message`? Fase 1: só message.
- `OQ-WA-02` — Quando operador marca conversa como lida na UI, propagar `read receipt` ao Meta? Proposta: sim, com debounce.
- `OQ-WA-03` — Template com parâmetros dinâmicos — onde validar schema do template antes do envio? Proposta: validar em MOD-INBOX contra `message_template.variables`.
