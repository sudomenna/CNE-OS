# BR-INBOX-CONVERSATION: ciclo de vida da conversa

## Enunciado

1. **Conversa ≠ ticket.** Conversa é o fluxo de mensagens entre contato e uma `channel_account`; ticket é demanda formal com SLA. Nenhuma operação cria ticket automaticamente a partir de conversa.
2. **Unicidade ativa por par contato × conta de canal.** Para um `(contact_id, channel_account_id)`, existe no máximo 1 conversa com `status <> 'closed'`.
3. **Reabertura automática.** Mensagem **inbound** em conversa `closed` reabre a conversa (status → `open`) e emite `TE-CONVERSATION-REOPENED`. Não cria conversa nova.
4. **Responsável é da conversa.** `conversation.assigned_user_id` é independente de qualquer "responsável do contato". Um contato pode ter conversas com responsáveis distintos em paralelo.
5. **Múltiplas conversas por contato.** Um contato pode ter conversas simultâneas em canais/contas distintos. Não há limite arquitetural.
6. **Marca opcional.** Quando a `channel_account` não permite inferência única de marca, a conversa permanece com `brand_id = NULL` até classificação manual. Operação do inbox nunca bloqueia por falta de marca.

## Motivação

Separar conversa de ticket preserva o loop real de atendimento sem burocratizar toda interação. Unicidade ativa impede "twin conversations" do mesmo par. Reabertura automática evita histórico fragmentado do cliente. Responsável por conversa reflete a prática: pessoas diferentes cuidam de canais diferentes do mesmo contato.

## Escopo

- Módulos: [MOD-INBOX](../20-domain/05-conversation-inbox.md).
- Entidades: `conversation`, `message`, `conversation_status_history`, `conversation_assignment_history`.

## Enforcement

- [x] DB constraint (SQL) — índice único parcial em `conversation(contact_id, channel_account_id) WHERE status <> 'closed'`.
- [x] DB trigger — append-only em `conversation_status_history` e `conversation_assignment_history`.
- [x] Função de domínio pura — `openOrReopenConversation`, `appendMessage`.
- [x] Guard em Server Action — atendente não pode enviar outbound em conversa `closed`; UI obriga reabrir antes.
- [ ] Guard em UI — reforço visual.

## Contrato TS

```ts
export type OpenOrReopenInput = {
  contactId: string;
  channelAccountId: string;
  brandId?: string | null;
  firstMessage?: InboundMessageInput;
};

export async function openOrReopenConversation(
  input: OpenOrReopenInput
): Promise<{ conversation: Conversation; reopened: boolean; created: boolean }>;

export async function appendMessage(input: {
  conversationId: string;
  direction: 'inbound' | 'outbound';
  body: string;
  authorUserId?: string | null;
  externalMessageId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<Message>;
```

Regras do `openOrReopenConversation`:

1. Buscar conversa ativa por `(contactId, channelAccountId)`.
2. Se existir e `status <> 'closed'` → retornar `{ reopened:false, created:false }`.
3. Se existir e `status = 'closed'` → transitar para `open`, registrar histórico, emitir `TE-CONVERSATION-REOPENED`, retornar `{ reopened:true, created:false }`.
4. Se não existir → criar, emitir `TE-CONVERSATION-OPENED`, retornar `{ reopened:false, created:true }`.

## DDL / constraint SQL

```sql
CREATE UNIQUE INDEX uq_conversation_active
  ON conversation (contact_id, channel_account_id)
  WHERE status <> 'closed';

-- trigger append-only
CREATE OR REPLACE FUNCTION prevent_update_delete_history()
RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER t_conv_status_history_append
  BEFORE UPDATE OR DELETE ON conversation_status_history
  FOR EACH ROW EXECUTE FUNCTION prevent_update_delete_history();
```

## Casos de teste

### Dado/Quando/Então

1. **CT-INBOX-01 — Abertura simples**
   - Dado: contato C sem conversa na `channel_account` CA.
   - Quando: chega `appendMessage(direction='inbound', ...)` via webhook WhatsApp.
   - Então: `openOrReopenConversation` retorna `{created:true}`; `conversation.status='open'`; emitidos `TE-CONVERSATION-OPENED` + `TE-MESSAGE-INBOUND`.

2. **CT-INBOX-02 — Reabertura por inbound**
   - Dado: conversa `CV1` entre C e CA em `status='closed'`.
   - Quando: chega nova mensagem inbound em (C, CA).
   - Então: mesma `CV1` transiciona para `open`; linha em `conversation_status_history (from=closed, to=open)`; `TE-CONVERSATION-REOPENED` emitido; **nenhuma** nova conversa criada.

3. **CT-INBOX-03 — Múltiplas contas, múltiplas conversas**
   - Dado: contato C com conversa ativa em CA1 (WhatsApp MarcaA).
   - Quando: contato escreve em CA2 (Instagram MarcaB).
   - Então: nova conversa é criada em CA2 sem violar unicidade (pares diferentes).

4. **CT-INBOX-04 — Outbound bloqueado em conversa fechada**
   - Dado: conversa em `status='closed'`.
   - Quando: atendente tenta `appendMessage(direction='outbound')`.
   - Então: erro `ConversationClosedError`; nenhuma mensagem persistida.

5. **CT-INBOX-05 — Marca indefinida**
   - Dado: `channel_account` configurada sem `brand_id` fixo e inbound sem pista de marca.
   - Quando: conversa é criada.
   - Então: `conversation.brand_id = NULL`; conversa aparece em fila de "classificação de marca pendente"; nenhuma falha.

## Rastreabilidade

- Teste esperado: `tests/unit/inbox/open-or-reopen.test.ts`, `tests/integration/inbox/webhook-idempotency.test.ts`.
- Referenciada em: [MOD-INBOX](../20-domain/05-conversation-inbox.md), [MOD-TICKET](../20-domain/06-ticket.md), [MOD-AUTOMATION](../20-domain/15-automation.md).

## Open Questions

- `OQ-BR-INBOX-01`: política de auto-close por inatividade (ex.: 72h sem mensagem) — Fase 1 ou 2?
- `OQ-BR-INBOX-02`: mensagens outbound programadas em conversa fechada devem auto-reabrir?
