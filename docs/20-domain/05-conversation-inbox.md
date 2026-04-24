# Conversation / Inbox (Módulo MOD-INBOX)

## 1. Finalidade

Centralizar conversas omnichannel (WhatsApp, Instagram, e-mail) entre contatos e a CNE. Organizar mensagens, anexos, notas internas, status e responsável por conversa. Fonte de entrada para atendimento, suporte e disparos de automação via gatilho `new_message`. Conversa é entidade distinta de ticket (ver [MOD-TICKET](./06-ticket.md)).

## 2. Ownership (paralelização)

- Arquivos que POSSUI:
  - `docs/20-domain/05-conversation-inbox.md`
  - `lib/db/schema/conversation.ts`
  - `lib/domain/inbox/*`
  - `app/(app)/inbox/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`conversation_status`, `channel_kind`)
  - `docs/30-contracts/03-timeline-event-catalog.md` (TE-MESSAGE-*, TE-CONVERSATION-*)
  - `docs/50-business-rules/BR-INBOX-CONVERSATION.md`
  - `docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md`
  - `lib/db/schema/contact.ts`, `lib/db/schema/brand.ts`
- Interfaces públicas expostas:
  - `openOrReopenConversation(input): Promise<Conversation>`
  - `appendMessage(input): Promise<Message>`
  - `assignConversation(conversationId, toUserId, assignedByUserId): Promise<void>`
  - `setConversationStatus(conversationId, to, changedByUserId, reason?): Promise<Conversation>`

## 3. Entidades e campos

| Tabela | Finalidade |
|---|---|
| `channel` | Tipos de canal configurados (whatsapp, instagram, email). |
| `channel_account` | Instância configurada do canal (número WhatsApp, conta IG, caixa de e-mail). |
| `conversation` | Fluxo de mensagens entre contato e uma `channel_account`. |
| `message` | Mensagem inbound/outbound dentro de uma conversa. |
| `message_attachment` | Anexo (arquivo) vinculado a mensagem. |
| `conversation_assignment_history` | Histórico append-only de mudanças de responsável. |
| `conversation_internal_note` | Nota interna (não visível ao contato). |
| `conversation_status_history` | Histórico append-only de status. |

### DDL sketch

```sql
CREATE TABLE channel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind channel_kind NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_kind UNIQUE (kind)
);

CREATE TABLE channel_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES channel(id),
  brand_id uuid NOT NULL REFERENCES brand(id),
  external_id text NOT NULL,             -- identificador no provedor (nº, handle, endereço)
  display_name text NULL,
  credentials jsonb NULL,                -- chaves/tokens (criptografar na Fase 2)
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_channel_account UNIQUE (channel_id, brand_id, external_id)
);

CREATE TABLE conversation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id),
  channel_account_id uuid NOT NULL REFERENCES channel_account(id),
  brand_id uuid NULL REFERENCES brand(id),       -- pode permanecer NULL até classificação manual
  status conversation_status NOT NULL DEFAULT 'open',
  assigned_user_id uuid NULL REFERENCES user_account(id),
  external_thread_id text NULL,          -- ID do thread no provedor
  last_message_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL
);
-- INV-INBOX-01: no máximo 1 conversa ativa por (contact_id, channel_account_id).
CREATE UNIQUE INDEX uq_conversation_active
  ON conversation (contact_id, channel_account_id)
  WHERE status != 'closed' AND deleted_at IS NULL;

CREATE TABLE message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  body text NOT NULL,
  external_message_id text NULL,         -- ID único no provedor (idempotência)
  actor_user_id uuid NULL REFERENCES user_account(id),  -- outbound por humano
  actor_system text NULL,                -- outbound/inbound por sistema ('whatsapp-webhook')
  sent_at timestamptz NULL,              -- confirmação de entrega pelo provedor
  created_at timestamptz NOT NULL DEFAULT now()
);
-- INV-INBOX-02: external_message_id único por conversa quando informado.
CREATE UNIQUE INDEX uq_message_external
  ON message (conversation_id, external_message_id)
  WHERE external_message_id IS NOT NULL;

CREATE TABLE message_attachment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  kind text NOT NULL,                       -- image, audio, video, file
  url text NOT NULL,
  size_bytes bigint NULL,
  mime text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_assignment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE RESTRICT,
  from_user_id uuid NULL REFERENCES user_account(id) ON DELETE SET NULL,
  to_user_id uuid NULL REFERENCES user_account(id) ON DELETE SET NULL,
  assigned_by_user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_internal_note (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE RESTRICT,
  author_user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversation(id) ON DELETE RESTRICT,
  from_status conversation_status NULL,
  to_status conversation_status NOT NULL,
  changed_by_user_id uuid NULL REFERENCES user_account(id) ON DELETE SET NULL,  -- NULL quando ator é sistema
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Triggers bloqueiam UPDATE/DELETE em `conversation_assignment_history` e `conversation_status_history` (append-only, conforme [02-db-schema-conventions §8](../30-contracts/02-db-schema-conventions.md#8-trilha-de-histórico-para-status)).

## 4. Relações (ASCII)

```
contact ──< conversation >── channel_account >── channel
                 │
                 ├──< message >── message_attachment
                 ├──< conversation_internal_note
                 ├──< conversation_assignment_history
                 └──< conversation_status_history

conversation ──? funnel_entry   (vínculo opcional)
conversation ──? transaction    (vínculo opcional)
```

## 5. Invariantes (INV-INBOX-NN)

- `INV-INBOX-01`: para um par `(contact_id, channel_account_id)` existe **no máximo uma** conversa com `status <> 'closed'`. Enforce por índice único parcial.
- `INV-INBOX-02`: toda mensagem pertence a exatamente uma conversa; `external_message_id` único por conversa quando informado.
- `INV-INBOX-03`: conversa só transita para `closed` via fluxo explícito; mensagem inbound em conversa fechada reabre (ver [BR-INBOX-CONVERSATION](../50-business-rules/BR-INBOX-CONVERSATION.md)).
- `INV-INBOX-04`: `assigned_user_id` é da **conversa**, não do contato. Um contato pode ter conversas com responsáveis distintos.
- `INV-INBOX-05`: `brand_id` pode ser NULL quando o sistema não consegue inferir marca a partir da `channel_account`; classificação manual preenche depois.
- `INV-INBOX-06`: cada transição de `status` gera linha em `conversation_status_history`; cada mudança de `assigned_user_id` gera linha em `conversation_assignment_history`.

## 6. Estados e transições (`conversation_status`)

```
open ─────────────► waiting_customer
  ▲                      │
  │                      ▼
  └──── waiting_team ◄───┘
          │
          ▼
        closed ──(mensagem inbound)──► open (reaberta)
```

- Qualquer status pode transitar para `closed` manualmente.
- Mensagem **inbound** em conversa `closed` sempre reabre (novo status = `open`), emite `TE-CONVERSATION-REOPENED`.
- Mensagem **outbound** em conversa `closed` é proibida — exige reabertura explícita por atendente antes.

## 7. Regras de negócio referenciadas

- [BR-INBOX-CONVERSATION](../50-business-rules/BR-INBOX-CONVERSATION.md)
- [BR-INTEGRATION-IDEMPOTENCY](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md) (canais externos enviam mensagens via webhook idempotente)
- [BR-RBAC](../50-business-rules/BR-RBAC.md) (quem pode responder, atribuir, fechar)
- [BR-TIMELINE](../50-business-rules/BR-TIMELINE.md) (emissão de eventos)

## 8. Eventos de timeline emitidos

- `TE-MESSAGE-INBOUND`
- `TE-MESSAGE-OUTBOUND`
- `TE-CONVERSATION-OPENED`
- `TE-CONVERSATION-REOPENED`
- `TE-CONVERSATION-CLOSED`
- `TE-CONVERSATION-ASSIGNED`

Payload e emissores: ver [03-timeline-event-catalog](../30-contracts/03-timeline-event-catalog.md#inbox--atendimento).

## 9. Fluxos relacionados

- `FLOW-INBOX-INBOUND`: recepção de mensagem externa → resolve contato → abre/reabre conversa → persiste mensagem → emite timeline → dispara automações.
- `FLOW-INBOX-REPLY`: atendente responde → cria mensagem outbound → chama adapter do canal → atualiza `last_message_at`.
- `FLOW-INBOX-ASSIGN`: atribuição/transferência de responsável.

## 10. Casos de teste obrigatórios

1. **Nova mensagem cria conversa**: mensagem inbound de contato sem conversa ativa na `channel_account` cria `conversation(status='open')` e emite `TE-CONVERSATION-OPENED` + `TE-MESSAGE-INBOUND`.
2. **Reabertura**: mensagem inbound chega em conversa `closed` do mesmo par; sistema transiciona status para `open`, cria linha em `conversation_status_history` e emite `TE-CONVERSATION-REOPENED`. Nenhuma nova conversa é criada.
3. **Transferência de responsável**: `assignConversation(c, userB)` partindo de `userA` registra linha em `conversation_assignment_history (from=A, to=B)` e emite `TE-CONVERSATION-ASSIGNED`.
4. **Mensagem sem marca identificável**: webhook de `channel_account` sem `brand_id` inferido — conversa criada com `brand_id = NULL` e aparece em fila de classificação manual.
5. **Múltiplas conversas simultâneas**: mesmo contato pode ter conversa aberta em WhatsApp-MarcaA e Instagram-MarcaB ao mesmo tempo (não viola INV-INBOX-01).
6. **Idempotência de mensagem**: mesmo `external_message_id` recebido 2x resulta em apenas 1 `message` persistida.

## 11. Open Questions

- `OQ-INBOX-01`: retenção de anexos de mensagem (política padrão? bucket separado?). Ver `70-ux` + NFR.
- `OQ-INBOX-02`: auto-classificação de marca quando `channel_account` serve múltiplas marcas — heurística ou sempre manual?
- `OQ-INBOX-03`: fechamento automático por inatividade (SLA) — Fase 1 ou 2?
