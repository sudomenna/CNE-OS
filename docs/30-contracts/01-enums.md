# Enums — fonte única

Todos os enums do sistema. Declarados em Postgres via `CREATE TYPE ... AS ENUM (...)` e espelhados em TypeScript via Drizzle. **Nunca** declare enum fora deste arquivo.

## Convenções

- Nome Postgres: `snake_case` (`contact_status`).
- Valores: `snake_case` minúsculo (`active`, `needs_review`).
- Adicionar valor = migration nova (`ALTER TYPE ... ADD VALUE`). Remover = nunca; deprecar com comentário.
- Expostos em TS como union literal: `type ContactStatus = 'active' | 'inactive' | 'invalid' | 'blocked'`.

---

## Contato

### `contact_status`
`active`, `inactive`, `invalid`, `blocked`

### `contact_phone_status`
`primary`, `secondary`, `whatsapp_valid`, `no_whatsapp`, `invalid`

### `contact_email_status`
`primary`, `alternative`, `invalid`, `unsubscribed`

### `contact_classification`
`lead`, `customer`, `student`, `paid_lead`

Referenciado em [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md).

### `contact_issue_kind`
`email_duplicate`, `phone_conflict`, `document_mismatch`, `source_divergence`, `other`

### `contact_issue_status`
`open`, `resolved`, `ignored`

## Inbox / Ticket

### `conversation_status`
`open`, `waiting_customer`, `waiting_team`, `closed`

### `channel_kind`
`whatsapp`, `instagram`, `email`

### `ticket_status`
`open`, `in_progress`, `waiting_reply`, `resolved`, `cancelled`

### `ticket_priority`
`low`, `medium`, `high`, `urgent`

### `ticket_category`
`commercial`, `support`, `financial`, `cancellation`, `refund`, `access`, `registration`, `other`

## Marketing / Funil

### `funnel_opportunity_label` (macro)
`open`, `negotiating`, `concluded`, `won`, `lost`, `reopened`

(O estágio do funil é dinâmico por funil; isto é só a etiqueta macro — ver `MOD-FUNNEL`.)

## Catálogo / Oferta

### `product_kind`
`course`, `ebook`, `training_online`, `training_in_person`, `mentoring`, `bonus`, `other`

### `offer_condition_item_kind`
`main`, `bonus`, `upsell`, `order_bump`, `complement`, `commercial_benefit`

### `offer_condition_status`
`draft`, `active`, `paused`, `archived`

### `offer_status`
`draft`, `active`, `paused`, `archived`

### `offer_payment_method`
`pix`, `credit_card`, `installments`, `boleto`, `custom`

### `offer_rule_operator` (combinação lógica)
`and`, `or`

### `offer_rule_kind` (tipo de regra de elegibilidade)
`date_range`, `sales_count_reached`, `campaign`, `channel`, `creative`, `internal_use`

### `commercial_benefit_delivery_status`
`pending`, `in_progress`, `delivered`, `not_applicable`, `failed`

### `offer_decision_channel` (input do motor de decisão, superset de `channel_kind`)
`whatsapp`, `instagram`, `email`, `site`, `api`, `internal`

## Transação / Snapshot / Direito

### `transaction_status`
`pending`, `approved`, `refused`, `refunded`, `chargeback`, `cancelled`

### `transaction_snapshot_flag`
`normal`, `refunded`, `disputed`

### `entitlement_status`
`active`, `suspended`, `expired`, `revoked`

### `entitlement_kind`
`product_access`, `benefit`, `other`

## Assinatura / Cobrança

### `subscription_status`
`trial`, `active`, `past_due`, `paused`, `cancelled`, `expired`

### `installment_status`
`scheduled`, `paid`, `overdue`, `refunded`, `cancelled`

### `refund_status`
`requested`, `approved`, `rejected`, `processed`, `failed`

## Integração

### `integration_provider`
`digital_guru`, `brevo`, `whatsapp_official`, `notazz`, `analytics`

### `webhook_status`
`received`, `processed`, `failed`, `dead_letter`

## Auditoria

### `audit_action_kind`
`create`, `update`, `delete`, `merge`, `unmerge`, `refund`, `status_change`, `impersonate`, `other`

## RBAC

### `role_kind`
`admin`, `financial`, `marketing`, `support`, `commercial`

## Timeline

### `timeline_event_kind`
Ver catálogo completo em [`03-timeline-event-catalog.md`](./03-timeline-event-catalog.md). Valores: prefixo `TE_` seguido de kind em `snake_case` (ex.: `te_sale_approved`).

## Automação

### `automation_trigger_kind`
`funnel_enter`, `funnel_stage_change`, `new_message`, `checkout_abandoned`, `sale_approved`, `ticket_opened`, `brevo_event`, `integration_event`

### `automation_action_kind`
`apply_tag`, `move_stage`, `open_ticket`, `notify_user`, `emit_timeline_event`, `send_external`

### `automation_execution_status`
`pending`, `running`, `succeeded`, `failed`, `cancelled`

---

## Open Questions sobre enums

- `OQ-ENUM-01`: `channel_kind` precisa de `sms` ou telefonia?
- `OQ-ENUM-02`: `product_kind.bonus` faz sentido ou basta usar `offer_condition_item_kind.bonus`?
- `OQ-ENUM-03`: `ticket_category` é suficiente ou precisa ser configurável por marca?
