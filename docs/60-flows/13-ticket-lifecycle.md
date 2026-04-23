# FLOW-13: Ciclo de vida do ticket

## Gatilho / pré-condições

Ticket nasce por uma de três origens:

- (a) **manual pelo atendente** — botão "Abrir ticket" na UI de contato ou inbox;
- (b) **a partir de conversa** — atendente em conversa clica "Abrir ticket" com `origin_conversation_id`;
- (c) **por automação** — `automation_action_kind='open_ticket'` disparado por gatilho configurado.

Pré-condições: contato existe; operador autenticado com permissão `ticket.open` ([`BR-RBAC`](../50-business-rules/BR-RBAC.md)); categoria e prioridade preenchidas.

## Atores

- humano: atendente, comercial, suporte, financial (conforme categoria); admin para cancelamento.
- sistema: `MOD-TICKET` (`openTicket`, `setTicketStatus`, `assignTicket`, `addTicketNote`); `MOD-AUTOMATION` (fluxo c); `MOD-TIMELINE`.
- integração: nenhuma.

## Passos

### Abertura

1. **Invocar `openTicket(input)`** com:
   - `contactId` (obrigatório);
   - `origin_conversation_id?`;
   - `brandId?` (herda de conversa quando existir);
   - `category` (ex.: `refund`, `support`, `commercial`, `access`);
   - `priority` (`low|medium|high|urgent`);
   - `subject`, `description?`, `due_at?`, `assigned_user_id?`.
2. Guard `can(user, 'ticket.open')`.
3. INSERT `ticket` com `number` auto (bigserial), `status='open'`, `created_by`.
4. Se `origin_conversation_id` fornecido e `brandId` ausente ⇒ herdar `brandId` da conversa.
5. Se `assigned_user_id` fornecido ⇒ INSERT `ticket_assignment_history(from=NULL, to=assigned)`.
6. Emitir `TE-TICKET-OPENED` com `subjectKind='ticket', subjectId=ticket.id`.

### Atribuição / reatribuição

7. `assignTicket(ticketId, userId)`:
   - lê atual; compara; se igual ⇒ no-op;
   - UPDATE `assigned_user_id`;
   - INSERT `ticket_assignment_history(from, to, changed_by)`;
   - emite `TE-TICKET-ASSIGNED`.

### Transições de status

Matriz canônica (ver [MOD-TICKET §6](../20-domain/06-ticket.md#6-estados-e-transições-ticket_status)):

```
open ↔ in_progress ↔ waiting_reply → resolved
  ↓         ↓              ↓           ↑
  └─────────┴──────────────┴── cancelled
(resolved|cancelled) → open  (reabertura)
```

8. `setTicketStatus(ticketId, to, reason?)`:
   1. lê `from_status`;
   2. valida transição pela matriz; rejeita com `InvalidTicketTransitionError` se inválida;
   3. UPDATE `status=to`, `updated_at=now()`; quando `to='resolved'` ou `'cancelled'` ⇒ `closed_at=now()`;
   4. INSERT `ticket_status_history(from, to, changed_by, reason)`;
   5. emite evento:
      - `TE-TICKET-STATUS-CHANGED` sempre;
      - `TE-TICKET-RESOLVED` quando `to='resolved'`;
      - `TE-TICKET-REOPENED` quando `from IN ('resolved','cancelled') AND to='open'`.

### Notas

9. `addTicketNote(ticketId, body)`:
   - INSERT `ticket_note(ticket_id, author_user_id, body)`;
   - notas são privadas (não aparecem em conversa pública);
   - nenhum evento de timeline (nota interna).

### Reabertura

10. Contato retoma assunto resolvido; atendente chama `setTicketStatus(resolved → open)`; histórico preservado (mesmo ticket, não novo); `TE-TICKET-REOPENED` emitido.

### Cancelamento

11. `setTicketStatus(_, 'cancelled', reason)`:
    - Guard `can(user, 'ticket.cancel')`;
    - UPDATE status, `closed_at`;
    - `audit_log` registra (BR-AUDIT) quando `category IN ('refund','financial')`.

## Pós-condições

- `ticket.status` reflete transição; `closed_at` preenchido quando terminal.
- `ticket_status_history` e `ticket_assignment_history` append-only refletem trajetória.
- Timeline do contato contém eventos do ticket.
- Múltiplos tickets em paralelo por contato permitidos (`INV-TICKET-04`).

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `InvalidTicketTransitionError` (ex.: `resolved → waiting_reply`) | rejeita | reabrir para `open` antes |
| E-02 | RBAC falha | 403 | escalar |
| E-03 | `assigned_user_id` sem permissão para categoria (Fase 2) | aceita na Fase 1; log | regras por categoria em Fase 2 |
| E-04 | `closed_at` setado com status não-terminal | CHECK falha | bug de caller |
| E-05 | automação tenta `open_ticket` em contato blacklist | abrir normalmente; operador decide (Fase 1 não bloqueia) | — |

## Regras referenciadas

- [`BR-RBAC`](../50-business-rules/BR-RBAC.md) — `ticket.open`, `ticket.cancel`.
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md).
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md) — cancelamento de categorias sensíveis.
- [`BR-INBOX-CONVERSATION`](../50-business-rules/BR-INBOX-CONVERSATION.md) — origem opcional.

## Eventos emitidos

- `TE-TICKET-OPENED`
- `TE-TICKET-ASSIGNED`
- `TE-TICKET-STATUS-CHANGED`
- `TE-TICKET-RESOLVED`
- `TE-TICKET-REOPENED`

## Observabilidade

- Métricas:
  - `ticket_opened_total{category, priority}`;
  - `ticket_resolved_total{category}`;
  - `ticket_open_gauge{category}`;
  - `ticket_sla_breached_total{priority}` (quando `due_at < now() AND status != 'resolved'`);
  - `ticket_time_to_resolution_hours{category}` (histograma).
- Logs (`correlation_id`, `ticket_id`, `contact_id`, `from_status`, `to_status`, `flow='FLOW-13'`).
- Alertas:
  - Axiom: tickets `urgent` abertos > 1h sem atribuição.
  - Sentry: volume anormal de tickets `category='refund'` (possível incidente).

## Casos de teste E2E obrigatórios

1. **abertura-a-partir-de-conversa**
   - Given: conversa CV1 da MarcaA; atendente clica "abrir ticket".
   - When: `openTicket({ origin_conversation_id: CV1.id, category:'support', priority:'medium', subject:'...' })`.
   - Then: ticket criado com `brand_id=MarcaA` herdado; `TE-TICKET-OPENED` emitido.

2. **abertura-sem-conversa**
   - When: ticket criado manualmente com `origin_conversation_id=null`.
   - Then: aceito; `origin_conversation_id=NULL`.

3. **multiplos-tickets-paralelos**
   - Given: contato X com 3 tickets em `open`/`in_progress`.
   - When: abre 4º.
   - Then: aceito (sem restrição de unicidade).

4. **transicao-invalida-rejeita**
   - Given: ticket `resolved`.
   - When: `setTicketStatus(id, 'waiting_reply')`.
   - Then: `InvalidTicketTransitionError`.

5. **reabertura-preserva-historico**
   - Given: ticket `resolved` há 2 dias.
   - When: `setTicketStatus(id, 'open', 'cliente insistiu')`.
   - Then: mesmo ticket, `status='open'`; `ticket_status_history` tem todas as transições; `TE-TICKET-REOPENED`.

6. **cancelamento-refund-audita**
   - Given: ticket `category='refund'`; admin cancela.
   - When: `setTicketStatus(id, 'cancelled', 'duplicate')`.
   - Then: status ok; `audit_log` registra.

7. **automacao-abre-ticket**
   - Given: regra `automation_trigger=funnel_stage_change` + ação `open_ticket`.
   - When: FLOW-03 muda estágio.
   - Then: ticket criado automaticamente com `created_by=NULL`, `actor_system='automation'`; `TE-TICKET-OPENED`.

8. **reatribuicao-emite-evento**
   - Given: ticket atribuído a U1.
   - When: `assignTicket(id, U2)`.
   - Then: histórico (U1→U2); `TE-TICKET-ASSIGNED`.

## Open Questions

- `OQ-FLOW-13-01` — SLA por `priority` (`OQ-TICKET-01`) — valores default e notificação automática de breach.
- `OQ-FLOW-13-02` — auto-close de `waiting_reply` após N dias (`OQ-TICKET-03`)? Fase 1 não.
- `OQ-FLOW-13-03` — tags livres em ticket (`OQ-TICKET-02`)? Fase 2.
