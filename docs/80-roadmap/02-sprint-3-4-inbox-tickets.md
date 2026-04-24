# Sprint 3-4 — Inbox + Tickets  (duração: 4 semanas)

## Objetivo

Entregar a **inbox omnichannel** (WhatsApp oficial, Instagram Direct, e-mail) com abertura/reabertura determinística de conversa, mensagens idempotentes via webhook, atribuição por conversa, notas internas e realtime em 3 colunas (conversas / thread / detalhes do contato). Em paralelo, entregar o agregado **ticket** como entidade distinta, permitindo abrir ticket a partir de conversa ou standalone, com estados, histórico de status e de atribuição. Fluxos críticos `FLOW-02-omnichannel-message` e `FLOW-13-ticket-lifecycle` passam no E2E.

## Entregáveis (outcomes)

- Schemas `channel`, `channel_account`, `conversation`, `message`, `message_attachment`, `conversation_internal_note`, `conversation_assignment_history`, `conversation_status_history` aplicados.
- Adapters idempotentes para WhatsApp Business Official, Instagram Direct, e-mail (IMAP/SMTP Fase 1 simplificado).
- Funções de domínio `openOrReopenConversation`, `appendMessage`, `assignConversation`, `setConversationStatus`.
- Schemas `ticket`, `ticket_note`, `ticket_status_history`, `ticket_assignment_history` aplicados.
- Funções de domínio `openTicket`, `setTicketStatus`, `assignTicket`, `addTicketNote`.
- UI `/inbox` 3 colunas com realtime Supabase + push desktop quando atribuído.
- UI `/tickets` lista + detalhe + ação "abrir ticket a partir da conversa".
- E2E FLOW-02 e FLOW-13 verdes.

## Pré-requisitos (sprints anteriores concluídos)

- Sprint 0 (schemas base, Inngest, `timeline_event`, `webhook_log`).
- Sprint 1-2 (`contact` + `resolveContactIdentity` + timeline).

## Status atual

> Última atualização: 2026-04-25 — Sprint 3-4 concluído (todas as ondas A–G entregues).

| T-ID | Título curto | Onda | Status |
|---|---|---|---|
| T-3-01 | Schema channel + channel_account + seed | A | ✅ completed |
| T-3-02 | Schema conversation + uq_conversation_active | B | ✅ completed |
| T-3-03 | Schema message + message_attachment | B | ✅ completed |
| T-3-04 | Schema conversation history + triggers | B | ✅ completed |
| T-3-05 | openOrReopenConversation + appendMessage | C | ✅ completed |
| T-3-06 | assignConversation + setConversationStatus | D | ✅ completed |
| T-3-07 | Adapter WhatsApp webhook | D | ✅ completed |
| T-3-08 | Adapter Instagram Direct | D | ✅ completed |
| T-3-09 | Adapter e-mail IMAP/SMTP | E | ✅ completed |
| T-3-10 | Server Actions inbox | E | ✅ completed |
| T-3-11 | UI /inbox 3 colunas + realtime | F | ✅ completed |
| T-3-12 | Schema ticket + histórico + triggers | A | ✅ completed |
| T-3-13 | Funções domínio ticket | C | ✅ completed |
| T-3-14 | Server Actions + UI /tickets | F | ✅ completed |
| T-3-15 | Timeline schemas inbox + ticket | D | ✅ completed |
| T-3-16 | E2E flow-02-omnichannel | G | ✅ completed |
| T-3-17 | E2E flow-13-ticket | G | ✅ completed |
| T-3-18 | Integration tests idempotência webhooks | G | ✅ completed |

**Sprint 3-4 CONCLUÍDO** — 18/18 T-IDs ✅ em 2026-04-25.

**Migrations aplicadas no Supabase remoto:**
- `20260425000002_conversation_schema.sql` — channel + channel_account
- `20260425000003_ticket_schema.sql` — ticket + histórico
- `20260425000004_conversation_table.sql` — conversation
- `20260425000005_message_schema.sql` — message + message_attachment
- `20260425000006_conversation_history.sql` — conversation history tables
- `20260425000007_conversation_status_history_nullable_actor.sql` — changed_by_user_id nullable
- `20260425000008_email_provider_enum.sql` — email no enum integration_provider

**Suite:** 427 testes passando | typecheck limpo

**Pendências para Sprint 5+:**
- E2E specs requerem `SEED_E2E=true` com banco semeado (padrão Sprint 1)
- `sendMessage` Server Action não chama adapter externo (Fase 1: apenas registra outbound na DB)
- Merge reassign list: adicionar `conversation` e `ticket` quando integração com mergeContacts for evoluída
- RLS: tabelas conversation/message/ticket ainda sem policies (Fase 1 — mesmo padrão de sprint anterior)
- `contact_classification_changed` timeline kind: registrar quando MOD-TRANSACTION integrar com classifyContact

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-3-01 | Schema `channel` + `channel_account` + seed canais Fase 1 | MOD-INBOX | schema | no | — | `20-domain/05-conversation-inbox.md` §3; `30-contracts/01-enums.md` (`channel_kind`) | `lib/db/schema/conversation.ts` (inicial), `lib/db/schema/index.ts`, `lib/db/seed/channels.ts` | Seed popula `whatsapp`, `instagram`, `email`; `uq_channel_account` impede duplicata |
| T-3-02 | Schema `conversation` + índice único parcial `uq_conversation_active` | MOD-INBOX | schema | yes | T-3-01 | `20-domain/05-conversation-inbox.md` §3, INV-INBOX-01 | `lib/db/schema/conversation.ts` (adicional) | Índice parcial barra 2ª conversa ativa no mesmo par `(contact, channel_account)` |
| T-3-03 | Schema `message` + `message_attachment` + UNIQUE external_message_id | MOD-INBOX | schema | yes | T-3-02 | `20-domain/05-conversation-inbox.md` §3, INV-INBOX-02 | `lib/db/schema/conversation.ts` (adicional) | `uq_message_external` garante idempotência; teste verde |
| T-3-04 | Schema `conversation_internal_note` + `conversation_assignment_history` + `conversation_status_history` + triggers | MOD-INBOX | schema | yes | T-3-02 | `20-domain/05-conversation-inbox.md` §3 final | `lib/db/schema/conversation.ts` (adicional), `supabase/migrations/0020_conversation_triggers.sql` | UPDATE/DELETE em histórico bloqueados |
| T-3-05 | Função `openOrReopenConversation` + `appendMessage` (idempotentes) | MOD-INBOX | domain | no | T-3-03, T-3-04 | `20-domain/05-conversation-inbox.md` §2 interfaces; `BR-INBOX-CONVERSATION`; `BR-INTEGRATION-IDEMPOTENCY` | `lib/domain/inbox/open-or-reopen.ts`, `lib/domain/inbox/append-message.ts`, `tests/unit/inbox/**` | Mensagem inbound em conversa `closed` reabre + emite `TE-CONVERSATION-REOPENED`; mesma `external_message_id` 2x = 1 registro |
| T-3-06 | Funções `assignConversation`, `setConversationStatus` + TEs | MOD-INBOX | domain | yes | T-3-05 | `20-domain/05-conversation-inbox.md` §2 | `lib/domain/inbox/assign.ts`, `lib/domain/inbox/set-status.ts`, `tests/unit/inbox/assign.test.ts` | Grava `conversation_assignment_history` e emite `TE-CONVERSATION-ASSIGNED` |
| T-3-07 | Adapter WhatsApp Business Official (handler + mapper + handler Inngest) | MOD-INBOX | integration | yes | T-3-05 | `40-integrations/*` (se existir), `BR-INTEGRATION-IDEMPOTENCY` | `lib/integrations/whatsapp/webhook.ts`, `lib/integrations/whatsapp/map.ts`, `inngest/functions/whatsapp-inbound.ts`, `app/api/webhooks/whatsapp/route.ts` | Webhook WhatsApp com assinatura válida grava `webhook_log` UNIQUE; reentrega = noop; testes integração verdes |
| T-3-08 | Adapter Instagram Direct (handler + mapper) | MOD-INBOX | integration | yes | T-3-05 | idem | `lib/integrations/instagram/webhook.ts`, `lib/integrations/instagram/map.ts`, `inngest/functions/instagram-inbound.ts`, `app/api/webhooks/instagram/route.ts` | Webhook idempotente; cria contato via `resolveContactIdentity` |
| T-3-09 | Adapter e-mail (IMAP poll Inngest cron + SMTP send) | MOD-INBOX | integration | yes | T-3-05 | idem; `OQ-INBOX-01` | `lib/integrations/email/poll.ts`, `lib/integrations/email/send.ts`, `inngest/functions/email-poll.ts` | Cron a cada 60s lê IMAP; mensagens novas viram inbound; envio SMTP registra outbound |
| T-3-10 | Server Actions inbox: `sendMessage`, `assign`, `changeStatus`, `addInternalNote` | MOD-INBOX | api | yes | T-3-06, T-3-07 | `20-domain/05-conversation-inbox.md` §2 | `app/(app)/inbox/actions.ts` | `sendMessage` chama adapter do canal; falha do provedor = `TE` não emitido e action retorna erro legível |
| T-3-11 | UI `/inbox` 3 colunas + realtime Supabase + push desktop | MOD-INBOX | ui | yes | T-3-10 | `70-ux`; Supabase Realtime | `app/(app)/inbox/page.tsx`, `components/inbox/conversation-list.tsx`, `components/inbox/thread-pane.tsx`, `components/inbox/contact-pane.tsx`, `components/inbox/realtime-provider.tsx` | Nova mensagem aparece em <2s; atribuição abre notificação desktop; teste manual + E2E `inbox.realtime` |
| T-3-12 | Schema `ticket` + histórico de status e atribuição + triggers | MOD-TICKET | schema | no | — | `20-domain/06-ticket.md` §3 | `lib/db/schema/ticket.ts`, `lib/db/schema/index.ts`, `supabase/migrations/0021_ticket_triggers.sql` | `uq_ticket_number` sequencial global; histórico append-only |
| T-3-13 | Funções de domínio ticket: `openTicket`, `setTicketStatus`, `assignTicket`, `addTicketNote` | MOD-TICKET | domain | no | T-3-12 | `20-domain/06-ticket.md` §2 e §6 matriz | `lib/domain/ticket/open.ts`, `lib/domain/ticket/set-status.ts`, `lib/domain/ticket/assign.ts`, `tests/unit/ticket/**` | Transição inválida (`resolved→waiting_reply`) rejeitada; reabertura verde; 6 testes |
| T-3-14 | Server Actions + UI `/tickets` lista + detalhe + "abrir a partir da conversa" | MOD-TICKET | ui | yes | T-3-13, T-3-11 | `20-domain/06-ticket.md` §FLOW | `app/(app)/tickets/page.tsx`, `app/(app)/tickets/[id]/page.tsx`, `app/(app)/tickets/actions.ts`, `components/ticket/**`, `components/inbox/open-ticket-button.tsx` | Botão "Abrir ticket" em conversa cria ticket com `origin_conversation_id` preenchido |
| T-3-15 | Extensão timeline: novos `kind` de evento do Inbox e Ticket + schemas zod | contratos | domain | yes | T-3-05, T-3-13 | `30-contracts/03-timeline-event-catalog.md` (read-only — não editar); `20-domain/04-timeline.md` | `lib/timeline/schemas/message-inbound.ts`, `lib/timeline/schemas/conversation-*.ts`, `lib/timeline/schemas/ticket-*.ts` | `emitTimelineEvent` valida payload por `kind`; teste unit para cada kind |
| T-3-16 | E2E `flow-02-omnichannel.spec.ts` | MOD-INBOX | test | yes | T-3-11 | `FLOW-02` | `tests/e2e/flow-02-omnichannel.spec.ts` | Mensagem WhatsApp inbound cria contato, abre conversa, aparece na UI, atendente responde; verde |
| T-3-17 | E2E `flow-13-ticket.spec.ts` | MOD-TICKET | test | yes | T-3-14 | `FLOW-13` | `tests/e2e/flow-13-ticket.spec.ts` | Conversa → abre ticket → atribui → resolve → reabre; histórico preservado |
| T-3-18 | Teste integração idempotência de webhooks (3 canais) | MOD-INBOX | test | yes | T-3-07, T-3-08, T-3-09 | `BR-INTEGRATION-IDEMPOTENCY` | `tests/integration/inbox/webhook-idempotency.test.ts` | Reentrega 3x do mesmo `external_message_id` = 1 mensagem |

## Ondas de paralelização sugeridas

**Onda A (paralelo, 2 subagents):** T-3-01, T-3-12
→ Arquivos distintos (`schema/conversation.ts` inicial vs `schema/ticket.ts`).

**Onda B (serial em `conversation.ts`):** T-3-02 → T-3-03 → T-3-04.

**Onda C (paralelo, 2 subagents, depende de B):** T-3-05, T-3-13
→ Domínio em arquivos distintos.

**Onda D (paralelo, 4 subagents, depende de C):** T-3-06, T-3-07, T-3-08, T-3-15
→ Domínio inbox + 2 adapters + schemas zod, todos disjuntos.

**Onda E (paralelo, 2 subagents, depende de D):** T-3-09, T-3-10
→ Email adapter + server actions inbox.

**Onda F (paralelo, 2 subagents, depende de E):** T-3-11, T-3-14
→ UI inbox + UI tickets.

**Onda G (paralelo, 3 subagents, depende de F):** T-3-16, T-3-17, T-3-18.

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] `pnpm test:e2e` para FLOW-02 e FLOW-13 verde.
- [ ] Push desktop funciona em Chrome (permission prompt + notificação).
- [ ] Realtime: atendente vê nova mensagem sem refresh em <2s.
- [ ] Idempotência provada com 3x reentrega em cada canal.
- [ ] Nenhuma OQ nova bloqueante.
- [ ] Deploy em staging verde.

## Riscos e mitigação

- **Assinatura de webhook WhatsApp rejeitada em produção.** Mitigação: T-3-07 valida `X-Hub-Signature` com segredo do Meta; ambiente staging usa sandbox oficial.
- **IMAP poll gera duplicatas em reconexão.** Mitigação: T-3-09 usa `Message-Id` como `external_message_id` para idempotência.
- **Realtime Supabase com muitas conversas abertas sobrecarrega.** Mitigação: T-3-11 assina só canal do usuário logado (filtro `assigned_user_id`).
- **Reabertura de conversa por mensagem outbound.** Mitigação: `BR-INBOX-CONVERSATION` proíbe — T-3-05 rejeita outbound em `closed` com erro claro.

## Open Questions

- `OQ-SPRINT34-01` — Instagram webhook verifica `brand_id` como? Hoje canal→marca é 1:1; OQ-INBOX-02 aceita manual.
- `OQ-SPRINT34-02` — SLA automático de ticket entra aqui ou no Sprint 11 (Automações)? Hoje deixa fora.
