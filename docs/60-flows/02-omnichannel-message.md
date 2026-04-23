# FLOW-02: Mensagem omnichannel inbound

## Gatilho / pré-condições

Webhook de provedor de mensageria (WhatsApp Cloud API, Instagram Messaging, IMAP/Brevo para e-mail) entrega uma mensagem recebida. Deve existir `channel_account` cadastrada e ativa para o identificador do destinatário (número, IG account, caixa postal).

## Atores

- humano: (indireto) atendente que será notificado; remetente externo (contato).
- sistema: rota de webhook `MOD-INTEGRATION`; `MOD-INBOX`; `MOD-CONTACT` (via `FLOW-01`); `MOD-TIMELINE`.
- integração: provedor do canal (`whatsapp_official`, Instagram Graph, Brevo inbound).

## Passos

1. **Receber payload** no endpoint `POST /api/webhooks/<provider>`. Validar assinatura HMAC.
2. **Idempotência** via `ingestWebhook(provider, externalEventId, payload)` — [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md). Se duplicado-processado: retornar 200 sem efeito.
3. **Mapear canal** a partir do destinatário no payload para `channel_account_id`. Não encontrado ⇒ erro `E-01`.
4. **Extrair identidade do remetente**: telefone (WhatsApp), IG user id, e-mail (email). Montar `IdentityInput` com `origin='message'`.
5. **Delegar a [`FLOW-01`](./01-contact-ingestion.md)** via `resolveContactIdentity`. Em caso de `action='create'` ou `'update'`, receber `contactId`.
6. **Checar blacklist**: se `contact.status='blocked'`, arquivar payload em `webhook_log.status='processed'` com flag informativa; **não** persistir mensagem; **não** notificar. Erro `E-02`.
7. **Chamar `openOrReopenConversation({ contactId, channelAccountId, brandId: channelAccount.brandId })`** ([`BR-INBOX-CONVERSATION`](../50-business-rules/BR-INBOX-CONVERSATION.md)):
   - não existe conversa ativa ⇒ cria `conversation.status='open'`; emite `TE-CONVERSATION-OPENED`.
   - existe `closed` ⇒ transiciona para `open`; emite `TE-CONVERSATION-REOPENED`.
   - existe ativa ⇒ `noop`.
8. **Persistir `message`** via `appendMessage({ conversationId, direction:'inbound', body, externalMessageId, payload })`. Idempotência por `externalMessageId`.
9. **Persistir `message_attachment`** para cada mídia do payload (upload para Supabase Storage, referência via `storage_path`).
10. **Aplicar regras de score do funil**: se contato tem `funnel_entry` ativa e existe `funnel_score_rule(event_kind='message_inbound')`, chamar `recomputeScore(entryId)` — [`FLOW-03`](./03-funnel-opportunity-lifecycle.md).
11. **Emitir `TE-MESSAGE-INBOUND`** com `subjectKind='conversation'`, `subjectId=conversationId`.
12. **Realtime push**: publicar canal Supabase Realtime `inbox:<brand_id>` e `conversation:<conversation_id>` para atualizar UI dos atendentes online.
13. **Avaliar triggers de automação** com `automation_trigger_kind='new_message'` (via `MOD-AUTOMATION`, assíncrono por Inngest).
14. **Commit**; marcar `webhook_log.status='processed'`.

## Pós-condições

- `webhook_log` em `processed`.
- `conversation` ativa em `(contact, channel_account)`.
- `message` inserida com `direction='inbound'`.
- Eventos de timeline emitidos atomicamente.
- Atendentes veem a mensagem em tempo real.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `channel_account` não encontrada para destinatário | `webhook_log.status='failed'`, `last_error='unknown_channel'` | operador cadastra a conta; reprocess via [`FLOW-12`](./12-webhook-reprocess.md) |
| E-02 | contato em blacklist | silent drop com log; nenhuma emissão | — |
| E-03 | assinatura HMAC inválida | 401; não persistir em `webhook_log` | revisar segredo do provedor |
| E-04 | mensagem sem `externalMessageId` estável | gerar hash determinístico do payload (`OQ-BR-IDEM-01`) | — |
| E-05 | falha de upload de attachment | transação mantém mensagem; attachment em `pending`; job de retry | job `retryAttachmentUpload` |
| E-06 | conversa existe em marca diferente da `channel_account.brand_id` | seguir marca do canal, não do contato; registrar em log | — |

## Regras referenciadas

- [`BR-INBOX-CONVERSATION`](../50-business-rules/BR-INBOX-CONVERSATION.md)
- [`BR-IDENTITY`](../50-business-rules/BR-IDENTITY.md) (via FLOW-01)
- [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)

## Eventos emitidos

Ordem dentro da transação:

1. `TE-CONTACT-CREATED` ou `TE-CONTACT-UPDATED` (quando aplicável, via FLOW-01).
2. `TE-CONVERSATION-OPENED` ou `TE-CONVERSATION-REOPENED` (mutuamente exclusivos; `noop` se já ativa).
3. `TE-MESSAGE-INBOUND`.

## Observabilidade

- Métricas:
  - `inbox_inbound_total{provider, brand_id}`.
  - `inbox_conversation_reopen_total{provider}`.
  - `inbox_inbound_latency_ms{provider}` (webhook → persistência).
- Logs estruturados (`correlation_id`, `external_event_id`, `channel_account_id`, `contact_id`, `conversation_id`, `flow='FLOW-02'`).
- Alertas:
  - Sentry: `unknown_channel` > 0 por minuto.
  - Axiom: latência p95 > 2s.
  - Sentry: falha de assinatura HMAC (possível ataque).

## Casos de teste E2E obrigatórios

1. **whatsapp-novo-contato-nova-conversa**
   - Given: número novo escreve para `channel_account` WhatsApp da MarcaA.
   - When: webhook processado.
   - Then: contato criado; conversa `open` em MarcaA; `message` inbound persistida; 3 eventos de timeline.

2. **reopen-de-conversa-fechada**
   - Given: conversa CV1 (C↔CA) em `closed`.
   - When: C envia nova mensagem.
   - Then: CV1 vira `open`; `TE-CONVERSATION-REOPENED` emitido; nenhuma conversa nova.

3. **idempotencia-de-reentrega**
   - Given: webhook com `externalMessageId='wamid.x'` já processado.
   - When: reentrega.
   - Then: 200; nenhuma nova mensagem.

4. **canal-desconhecido-vai-a-dlq**
   - Given: payload para número não cadastrado.
   - When: webhook entra.
   - Then: 5 retries falham; `webhook_log.status='dead_letter'`.

5. **blacklist-silent-drop**
   - Given: contato `blocked`.
   - When: envia mensagem.
   - Then: nenhuma conversa/mensagem persistida; `webhook_log='processed'` com nota.

6. **realtime-push-chega-em-2-clients**
   - Given: 2 atendentes com inbox aberto da MarcaA.
   - When: nova mensagem chega.
   - Then: ambos recebem evento em < 1s.

## Open Questions

- `OQ-FLOW-02-01` — se o canal permitir múltiplas marcas (ex.: mesmo número, diferentes negócios), como desambiguar? Hoje `channel_account` é 1↔1 com marca — cruz com `OQ-BR-INBOX-02`.
- `OQ-FLOW-02-02` — mensagens de grupo do WhatsApp (`wamid` com `group_id`): ignorar ou criar conversa por grupo? Fase 1: ignorar.
