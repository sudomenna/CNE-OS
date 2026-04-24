# Ticket (Módulo MOD-TICKET)

## 1. Finalidade

Registrar formalmente demandas, problemas e solicitações que exigem acompanhamento com prazo, responsável e categoria. Ticket é **distinto** de conversa: nem toda conversa gera ticket; um ticket pode existir sem conversa de origem; um contato pode ter múltiplos tickets abertos simultaneamente.

## 2. Ownership (paralelização)

- Arquivos que POSSUI:
  - `docs/20-domain/06-ticket.md`
  - `lib/db/schema/ticket.ts`
  - `lib/domain/ticket/*`
  - `app/(app)/tickets/**`
- Arquivos que LÊ (read-only):
  - `docs/30-contracts/01-enums.md` (`ticket_status`, `ticket_priority`, `ticket_category`)
  - `docs/30-contracts/03-timeline-event-catalog.md` (TE-TICKET-*)
  - `docs/50-business-rules/BR-RBAC.md`
  - `lib/db/schema/contact.ts`, `lib/db/schema/conversation.ts`, `lib/db/schema/brand.ts`
- Interfaces públicas expostas:
  - `openTicket(input): Promise<Ticket>`
  - `setTicketStatus(ticketId, to: TicketStatus, reason?): Promise<void>`
  - `assignTicket(ticketId, userId): Promise<void>`
  - `addTicketNote(ticketId, body): Promise<TicketNote>`

## 3. Entidades e campos

| Tabela | Finalidade |
|---|---|
| `ticket` | Registro principal. |
| `ticket_note` | Notas privadas de tratativa. |
| `ticket_status_history` | Histórico append-only de status. |
| `ticket_assignment_history` | Histórico append-only de responsável. |

### DDL sketch

> Implementado em `lib/db/schema/ticket.ts` + `supabase/migrations/20260425000003_ticket_schema.sql` (T-3-12).

```sql
CREATE TABLE ticket (
  id                     uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  number                 bigserial       NOT NULL,  -- número humano sequencial (único)
  contact_id             uuid            NOT NULL REFERENCES contact(id)       ON DELETE RESTRICT ON UPDATE CASCADE,
  brand_id               uuid            NULL     REFERENCES brand(id)         ON DELETE SET NULL ON UPDATE CASCADE,
  -- origin_conversation_id: sem FK formal por ora; será adicionada em migration posterior
  -- quando conversation existir no mesmo banco (INV-TICKET-02).
  origin_conversation_id uuid            NULL,
  status                 ticket_status   NOT NULL DEFAULT 'open',
  priority               ticket_priority NOT NULL DEFAULT 'medium',
  category               ticket_category NOT NULL,
  title                  text            NOT NULL,
  description            text            NULL,
  assigned_user_id       uuid            NULL     REFERENCES user_account(id)  ON DELETE SET NULL  ON UPDATE CASCADE,
  opened_by_user_id      uuid            NOT NULL REFERENCES user_account(id)  ON DELETE RESTRICT  ON UPDATE CASCADE,
  resolved_at            timestamptz     NULL,
  created_at             timestamptz     NOT NULL DEFAULT now(),
  updated_at             timestamptz     NOT NULL DEFAULT now(),
  deleted_at             timestamptz     NULL,      -- soft-delete
  CONSTRAINT uq_ticket_number UNIQUE (number)
);

CREATE TABLE ticket_note (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      uuid        NOT NULL REFERENCES ticket(id)        ON DELETE CASCADE  ON UPDATE CASCADE,
  author_user_id uuid        NOT NULL REFERENCES user_account(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
  body           text        NOT NULL,
  is_internal    boolean     NOT NULL DEFAULT true,  -- true = nota privada para agentes
  created_at     timestamptz NOT NULL DEFAULT now()
  -- APPEND-ONLY: trigger bloqueia UPDATE e DELETE
);

CREATE TABLE ticket_status_history (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           uuid          NOT NULL REFERENCES ticket(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  from_status         ticket_status NULL,
  to_status           ticket_status NOT NULL,
  changed_by_user_id  uuid          NULL REFERENCES user_account(id) ON DELETE SET NULL ON UPDATE CASCADE,
  reason              text          NULL,
  created_at          timestamptz   NOT NULL DEFAULT now()
  -- APPEND-ONLY: trigger bloqueia UPDATE e DELETE
);

CREATE TABLE ticket_assignment_history (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           uuid        NOT NULL REFERENCES ticket(id)        ON DELETE RESTRICT ON UPDATE CASCADE,
  from_user_id        uuid        NULL     REFERENCES user_account(id) ON DELETE SET NULL ON UPDATE CASCADE,
  to_user_id          uuid        NULL     REFERENCES user_account(id) ON DELETE SET NULL ON UPDATE CASCADE,
  assigned_by_user_id uuid        NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now()
  -- APPEND-ONLY: trigger bloqueia UPDATE e DELETE
);
```

Triggers bloqueiam UPDATE/DELETE em `ticket_note`, `ticket_status_history` e `ticket_assignment_history`.

## 4. Relações (ASCII)

```
contact ──< ticket
ticket ──? conversation        (origin_conversation_id opcional)
ticket ──< ticket_note
ticket ──< ticket_status_history
ticket ──< ticket_assignment_history
```

## 5. Invariantes (INV-TICKET-NN)

- `INV-TICKET-01`: ticket sempre pertence a 1 contato. `brand_id` opcional (herda de conversa de origem quando existir; pode ser preenchido manualmente).
- `INV-TICKET-02`: `origin_conversation_id` é opcional; ticket pode nascer fora do inbox.
- `INV-TICKET-03`: responsável do ticket (`assigned_user_id`) é independente do responsável da conversa de origem.
- `INV-TICKET-04`: contato pode ter múltiplos tickets com `status <> 'resolved' AND status <> 'cancelled'` simultaneamente (não há restrição de unicidade).
- `INV-TICKET-05`: ticket `resolved` ou `cancelled` pode ser **reaberto** — transição volta para `open` ou `in_progress` e emite `TE-TICKET-REOPENED`.
- `INV-TICKET-06`: cada transição de status/responsável gera linha no respectivo histórico append-only.
- `INV-TICKET-07`: `number` é sequencial global e único (UX humano-legível).

## 6. Estados e transições (`ticket_status`)

```
open ──► in_progress ──► waiting_reply ──► resolved
  │          │                │              │
  │          └──────────────► resolved       │
  │                                           ▼
  └───────────────────────────► cancelled   (reabertura: resolved|cancelled → open)
```

Matriz mínima de transições válidas:

| De \ Para | open | in_progress | waiting_reply | resolved | cancelled |
|---|:-:|:-:|:-:|:-:|:-:|
| open | – | ✅ | ✅ | ✅ | ✅ |
| in_progress | ✅ | – | ✅ | ✅ | ✅ |
| waiting_reply | ✅ | ✅ | – | ✅ | ✅ |
| resolved | ✅ (reabertura) | ✅ (reabertura) | ❌ | – | ❌ |
| cancelled | ✅ (reabertura) | ❌ | ❌ | ❌ | – |

## 7. Regras de negócio referenciadas

- [BR-RBAC](../50-business-rules/BR-RBAC.md) — quem pode abrir, cancelar, reatribuir.
- [BR-TIMELINE](../50-business-rules/BR-TIMELINE.md) — eventos emitidos.
- [BR-AUDIT](../50-business-rules/BR-AUDIT.md) — cancelamento registrado na trilha.

## 8. Eventos de timeline emitidos

- `TE-TICKET-OPENED`
- `TE-TICKET-STATUS-CHANGED`
- `TE-TICKET-ASSIGNED`
- `TE-TICKET-RESOLVED`
- `TE-TICKET-REOPENED`

## 9. Fluxos relacionados

- `FLOW-TICKET-FROM-CONVERSATION`: atendente em conversa clica "abrir ticket" → `openTicket({origin_conversation_id, ...})` → emite `TE-TICKET-OPENED`.
- `FLOW-TICKET-STANDALONE`: ticket aberto manualmente ou via automação (`open_ticket` action) sem conversa de origem.
- `FLOW-TICKET-REOPEN`: solicitação adicional após `resolved` → reabre com histórico preservado.

## 10. Casos de teste obrigatórios

1. **Abertura a partir de conversa**: `openTicket({origin_conversation_id, category, ...})` popula `origin_conversation_id`, herda `brand_id` da conversa, emite `TE-TICKET-OPENED`.
2. **Abertura sem conversa**: ticket criado manualmente com `origin_conversation_id = NULL` é aceito.
3. **Múltiplos tickets abertos**: contato X com 3 tickets em `open` simultâneos não é impedido.
4. **Responsável distinto da conversa**: conversa com responsável A, ticket derivado com responsável B — ambos persistem independentes.
5. **Reabertura**: ticket `resolved` recebe `setTicketStatus(id, 'open', 'cliente solicitou retomar')` — transição aceita, histórico registra, emite `TE-TICKET-REOPENED`.
6. **Transição inválida**: `resolved → waiting_reply` é rejeitada pela guard de domínio.

## 11. Open Questions

- `OQ-TICKET-01`: SLA por `priority` — valores padrão e override por categoria?
- `OQ-TICKET-02`: ticket precisa de `tags` livres (além de `category`) na Fase 1?
- `OQ-TICKET-03`: fechamento automático após inatividade em `waiting_reply`?
