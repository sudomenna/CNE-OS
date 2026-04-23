# Catálogo de eventos de timeline

A timeline do contato (`timeline_event`) é o stream unificado da jornada. Todo módulo que altera estado relevante ao contato **deve emitir** um evento tipado.

## Forma canônica da tabela

```sql
CREATE TABLE timeline_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contact(id),
  brand_id uuid NULL REFERENCES brand(id),        -- opcional
  kind text NOT NULL,                             -- TE-ID
  source text NOT NULL,                           -- módulo emissor (MOD-*)
  actor_user_id uuid NULL REFERENCES user_account(id),
  actor_system text NULL,                         -- p.ex. 'digital_guru', 'automation'
  subject_kind text NULL,                         -- 'transaction', 'conversation', ...
  subject_id uuid NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_timeline_contact_time ON timeline_event (contact_id, occurred_at DESC);
CREATE INDEX idx_timeline_brand ON timeline_event (brand_id);
CREATE INDEX idx_timeline_kind ON timeline_event (kind);
```

Append-only: trigger bloqueia UPDATE/DELETE.

## Regra de emissão

1. Apenas funções do módulo emissor podem emitir seus próprios eventos.
2. Emissão serializada dentro da mesma transação SQL que produz o efeito (atomicidade).
3. Payload de cada evento segue schema definido neste catálogo. Desvio = bug.
4. Campos `actor_user_id` OU `actor_system` obrigatório (um dos dois).

## Catálogo

Formato: `TE-<KIND>` — `kind` na tabela vira `snake_case` do KIND (ex.: `TE-SALE-APPROVED` → `sale_approved`).

### Contato / identidade

| ID | Emissor | Quando | Payload obrigatório |
|---|---|---|---|
| `TE-CONTACT-CREATED` | MOD-CONTACT | novo contato persistido | `{ origin: 'checkout'|'message'|'import'|'manual'|'integration', source_ref?: string }` |
| `TE-CONTACT-UPDATED` | MOD-CONTACT | alteração em campo crítico (nome, CPF, telefone principal, e-mail principal) | `{ field: string, from: any, to: any }` |
| `TE-CONTACT-CLASSIFICATION-CHANGED` | MOD-CONTACT | lead→customer, →student, →paid_lead | `{ from: classification, to: classification, reason: string }` |
| `TE-CONTACT-TAG-ADDED` | MOD-CONTACT | tag aplicada | `{ tag: string, source: 'manual'|'benefit'|'automation' }` |
| `TE-CONTACT-TAG-REMOVED` | MOD-CONTACT | tag removida | `{ tag: string }` |
| `TE-CONTACT-ISSUE-OPENED` | MOD-CONTACT | pendência aberta | `{ issue_id: uuid, kind: contact_issue_kind, detail: string }` |
| `TE-CONTACT-ISSUE-RESOLVED` | MOD-CONTACT | pendência resolvida | `{ issue_id: uuid, resolution: string }` |
| `TE-CONTACT-MERGED` | MOD-MERGE | merge realizado | `{ merged_into: uuid, merged_from: uuid, reason: string }` |
| `TE-CONTACT-UNMERGED` | MOD-MERGE | undo de merge | `{ merge_id: uuid }` |
| `TE-CONTACT-BLACKLISTED` | MOD-CONTACT | bloqueado | `{ reason: string }` |

### Inbox / atendimento

| ID | Emissor | Quando |
|---|---|---|
| `TE-MESSAGE-INBOUND` | MOD-INBOX | mensagem do cliente recebida |
| `TE-MESSAGE-OUTBOUND` | MOD-INBOX | resposta enviada |
| `TE-CONVERSATION-OPENED` | MOD-INBOX | nova conversa criada |
| `TE-CONVERSATION-REOPENED` | MOD-INBOX | conversa reaberta |
| `TE-CONVERSATION-CLOSED` | MOD-INBOX | encerrada |
| `TE-CONVERSATION-ASSIGNED` | MOD-INBOX | responsável atribuído/mudado |

### Ticket

| ID | Emissor | Quando |
|---|---|---|
| `TE-TICKET-OPENED` | MOD-TICKET | ticket criado |
| `TE-TICKET-STATUS-CHANGED` | MOD-TICKET | mudança de status |
| `TE-TICKET-ASSIGNED` | MOD-TICKET | responsável mudado |
| `TE-TICKET-RESOLVED` | MOD-TICKET | resolvido |
| `TE-TICKET-REOPENED` | MOD-TICKET | reaberto |

### Marketing / Funil

| ID | Emissor | Quando | Payload |
|---|---|---|---|
| `TE-CAMPAIGN-CLICK` | MOD-CAMPAIGN | clique em link rastreável | `{ campaign_id, creative_id?, trackable_link_id, utm: {...} }` |
| `TE-FUNNEL-ENTERED` | MOD-FUNNEL | contato entra em funil | `{ funnel_id, entry_id, stage_id, entry_creative_id?, entry_campaign_id? }` |
| `TE-FUNNEL-STAGE-CHANGED` | MOD-FUNNEL | oportunidade muda de estágio | `{ entry_id, from_stage_id, to_stage_id, score?: number }` |
| `TE-OPPORTUNITY-LABEL-CHANGED` | MOD-FUNNEL | etiqueta macro muda | `{ entry_id, from: label, to: label }` |
| `TE-OPPORTUNITY-WON` | MOD-FUNNEL | oportunidade ganha (compra) | `{ entry_id, transaction_id }` |
| `TE-OPPORTUNITY-LOST` | MOD-FUNNEL | oportunidade perdida | `{ entry_id, reason }` |

### Oferta / Transação / Direito

| ID | Emissor | Quando | Payload |
|---|---|---|---|
| `TE-SALE-PENDING` | MOD-TRANSACTION | transação pendente criada | `{ transaction_id, offer_id, condition_id }` |
| `TE-SALE-APPROVED` | MOD-TRANSACTION | compra aprovada | `{ transaction_id, offer_id, condition_id, snapshot_id }` |
| `TE-SALE-REFUSED` | MOD-TRANSACTION | recusada | `{ transaction_id, reason }` |
| `TE-SALE-REFUNDED` | MOD-REFUND | reembolsada | `{ transaction_id, refund_id, reason }` |
| `TE-SALE-CHARGEBACK` | MOD-TRANSACTION | chargeback recebido | `{ transaction_id }` |
| `TE-ENTITLEMENT-GRANTED` | MOD-ENTITLEMENT | direito concedido | `{ entitlement_id, kind, ref_id, ends_at? }` |
| `TE-ENTITLEMENT-EXTENDED` | MOD-ENTITLEMENT | expiração estendida | `{ entitlement_id, from, to }` |
| `TE-ENTITLEMENT-REVOKED` | MOD-ENTITLEMENT | revogado (por reembolso etc.) | `{ entitlement_id, reason }` |

### Assinatura / Cobrança

| ID | Emissor | Quando |
|---|---|---|
| `TE-SUBSCRIPTION-STARTED` | MOD-BILLING | assinatura ativada |
| `TE-SUBSCRIPTION-RENEWED` | MOD-BILLING | parcela recorrente paga |
| `TE-SUBSCRIPTION-PAST-DUE` | MOD-BILLING | parcela em atraso |
| `TE-SUBSCRIPTION-CANCELLED` | MOD-BILLING | cancelada |
| `TE-INSTALLMENT-PAID` | MOD-BILLING | parcela quitada |
| `TE-INSTALLMENT-OVERDUE` | MOD-BILLING | parcela vencida |

### Integração

| ID | Emissor | Quando |
|---|---|---|
| `TE-INTEGRATION-EVENT` | MOD-INTEGRATION | evento externo relevante (Brevo abriu e-mail, Analytics etc.) |
| `TE-WEBHOOK-REPROCESSED` | MOD-INTEGRATION | webhook reprocessado manualmente |

### Automação

| ID | Emissor | Quando |
|---|---|---|
| `TE-AUTOMATION-EXECUTED` | MOD-AUTOMATION | fluxo executado (sucesso ou falha) |

## Visibilidade

Todos os eventos aparecem na timeline do contato por padrão. Filtros de UI (marca, canal, tipo, período) são aplicados na leitura, nunca na escrita.

## Open Questions

- `OQ-TE-01`: eventos de automação podem gerar payload muito grande — precisamos truncar ou é responsabilidade do emissor?
- `OQ-TE-02`: `TE-CAMPAIGN-CLICK` pode inundar timeline — agregar por sessão?
