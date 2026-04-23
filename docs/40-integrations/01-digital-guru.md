# Integração Digital Guru Manager

## Papel

Provedor principal de checkout, cobrança única e cobrança recorrente (ADR-01). Fonte autoritativa de fatos financeiros externos: `transaction` aprovada, recusada, reembolsada, `subscription` criada/renovada/cancelada, `installment` pago/vencido. Nenhuma venda nasce no CNE-OS sem um webhook do Digital Guru — MOD-TRANSACTION, MOD-BILLING, MOD-ENTITLEMENT são efeitos deste provedor.

Adaptador: `/lib/integrations/digital-guru/`. Contrato de recepção em [`../30-contracts/04-webhook-contracts.md#51-digital-guru-manager`](../30-contracts/04-webhook-contracts.md#51-digital-guru-manager). Idempotência em [`../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md).

## Eventos consumidos

Rota: `POST /api/webhooks/digital-guru`. Header: `X-Guru-Signature` (HMAC-SHA256 de `rawBody` com `DIGITAL_GURU_WEBHOOK_SECRET`, comparação `timingSafeEqual`). `external_event_id = payload.id`. `event_kind = payload.event_type`.

| `external_event` | Ação interna | BRs | TEs | `idempotency_key` |
|---|---|---|---|---|
| `purchase.pending` / `transaction.pending` | `createTransaction(status='pending')` via FLOW-05 passo 5 | BR-OFFER-UNIQUENESS, BR-INTEGRATION-IDEMPOTENCY | `TE-SALE-PENDING` | `payload.id` |
| `purchase.approved` / `transaction.approved` | cascata completa de FLOW-05 passos 5-18 (snapshot, counter, entitlement, classificação, funnel, subscription) | BR-SNAPSHOT-IMMUTABILITY, BR-OFFER-DECISION, BR-ENTITLEMENT-CONSOLIDATION, BR-CONTACT-CLASSIFICATION | `TE-SALE-APPROVED`, `TE-ENTITLEMENT-GRANTED`, `TE-CONTACT-CLASSIFICATION-CHANGED`, `TE-OPPORTUNITY-WON`, `TE-SUBSCRIPTION-STARTED` | `payload.id` |
| `purchase.refused` / `transaction.refused` | `refuseTransaction(reason)` | BR-INTEGRATION-IDEMPOTENCY | `TE-SALE-REFUSED` | `payload.id` |
| `purchase.refunded` / `transaction.refunded` | se refund nasceu internamente: notificação de confirmação (no-op de domínio). Se nasceu externamente: abrir `refund` system-opened e disparar FLOW-07 aprovação automática | BR-REFUND, BR-SNAPSHOT-IMMUTABILITY | `TE-SALE-REFUNDED`, `TE-ENTITLEMENT-REVOKED` | `payload.id` |
| `purchase.chargeback` / `transaction.chargeback` | `UPDATE transaction SET status='chargeback'` + flag snapshot `disputed`; proposta OQ-FLOW-05-01 dispara refund automático | BR-SNAPSHOT-IMMUTABILITY | `TE-SALE-CHARGEBACK` | `payload.id` |
| `subscription.created` | Criado indiretamente por FLOW-05 quando `offer.billing_kind='subscription'`; evento recebido é confirmação idempotente | BR-SUBSCRIPTION | `TE-SUBSCRIPTION-STARTED` | `payload.id` |
| `subscription.renewed` | `markInstallmentPaid` + `advanceSubscription` (FLOW-11 passo 3) | BR-SUBSCRIPTION, BR-ENTITLEMENT-CONSOLIDATION | `TE-SUBSCRIPTION-RENEWED`, `TE-INSTALLMENT-PAID`, `TE-ENTITLEMENT-EXTENDED` | `payload.id` |
| `subscription.cancelled` / `subscription.canceled` | `cancelSubscription(reason='external')`; entitlements permanecem até `current_period_end` | BR-SUBSCRIPTION | `TE-SUBSCRIPTION-CANCELLED` | `payload.id` |
| `subscription.past_due` | `markInstallmentOverdue` + transição para `past_due` (FLOW-11 passo 4) | BR-SUBSCRIPTION | `TE-SUBSCRIPTION-PAST-DUE`, `TE-INSTALLMENT-OVERDUE` | `payload.id` |
| `installment.paid` | `recordInstallment(status='paid')` + `markInstallmentPaid` | BR-INTEGRATION-IDEMPOTENCY | `TE-INSTALLMENT-PAID` | `payload.id` |
| `installment.overdue` | `recordInstallment(status='overdue')` + transição past_due | BR-SUBSCRIPTION | `TE-INSTALLMENT-OVERDUE` | `payload.id` |

## Eventos emitidos (outbound)

| Ação interna | Chamada externa | Idempotency |
|---|---|---|
| Notificar estorno ao provedor após FLOW-07 commit | `POST /v1/transactions/{externalRef}/refund` | `refund:{refundId}:notify` |
| Reemitir vínculo de oferta quando `offer.external_ref` muda (operador) | `PUT /v1/products/{externalRef}` | `offer:{offerId}:rev:{rev}` |

Outbound segue §8 de [`../30-contracts/04-webhook-contracts.md`](../30-contracts/04-webhook-contracts.md): grava em `webhook_log` antes do HTTP, retry/DLQ idênticos ao inbound.

## Mapeamento canônico

| `external_field` | `internal_field` | Transformação |
|---|---|---|
| `payload.id` | `webhook_log.external_event_id` | cópia |
| `payload.event_type` | `webhook_log.event_kind` | cópia |
| `payload.data.transaction.id` | `transaction.external_ref` | cópia |
| `payload.data.transaction.amount_cents` | `transaction.amount` | `amount_cents / 100`, `numeric(12,2)` como string |
| `payload.data.transaction.currency` | `transaction.currency` | `upper()` |
| `payload.data.transaction.payment_method` | `transaction.payment_method` | map `credit_card→credit_card`, `pix→pix`, `installments→installments`, `boleto→boleto`, outros→`custom` |
| `payload.data.transaction.installments` | `transaction.installments_count` | int |
| `payload.data.transaction.approved_at` | `transaction.approved_at` | ISO-8601 → `timestamptz` |
| `payload.data.customer.document` | `contact.cpf` | strip não-dígitos; validar 11 dígitos; CPF inválido → `contact_issue kind='document_mismatch'` |
| `payload.data.customer.email` | `contact_email.value` | `lower().trim()` |
| `payload.data.customer.phone_country` + `phone_area` + `phone_number` | `contact_phone.value` | concat + E.164 normalize |
| `payload.data.customer.name` | `contact.full_name` | trim; se divergir de contato matched forte → `contact_issue kind='other'` |
| `payload.data.product.id` | `offer.external_refs.digital_guru` | lookup — ausente → `webhook_log.failed` com `last_error='unmapped_product'` (E-02 de FLOW-05) |
| `payload.data.checkout.utm_*` | decision context `{ campaignId, creativeId, channel }` via resolução de `trackable_link` | ver MOD-CAMPAIGN |
| `payload.data.subscription.id` | `subscription.external_ref` | cópia |
| `payload.data.subscription.current_period_end` | `subscription.current_period_end` | ISO-8601 → `timestamptz` |
| `payload.data.installment.id` | `installment.external_ref` | cópia |
| `payload.data.installment.due_at` | `installment.due_at` | ISO-8601 |

**Limitação de granularidade de itens:** o provedor não expõe breakdown de `main`/`bonus`/`upsell`/`order_bump` no payload. Itens de `transaction_snapshot` são **derivados do snapshot interno** composto por `composeSnapshot` a partir da condição selecionada pelo MOD-OFFER. O payload externo serve apenas para acionar a cascata; o conteúdo da venda vem do estado interno no momento da aprovação.

## Idempotência / retry / DLQ

- UNIQUE `(provider='digital_guru', external_event_id=payload.id)` em `webhook_log`.
- Duplicata com `status='processed'` → 200 noop (CT-IDEM-01).
- Retry Inngest: 5 tentativas, backoff 5/30/150/750s + jitter ±20% (§4 de webhook-contracts). 6ª falha → `dead_letter` + alerta Sentry + PagerDuty (impacto financeiro direto).
- Reprocesso manual via FLOW-12 por `admin`/`financial`.
- Alerta: `webhook_dead_letter_total{provider='digital_guru'} > 0` em 1h → PagerDuty.

## Credenciais e configuração (env vars)

```
DIGITAL_GURU_BASE_URL=https://api.digitalmanager.guru
DIGITAL_GURU_API_KEY=<token bearer para chamadas outbound>
DIGITAL_GURU_WEBHOOK_SECRET=<segredo HMAC-SHA256 para verificação inbound>
DIGITAL_GURU_ACCOUNT_ID=<id da conta, para multi-marca se aplicável>
```

Rotação: segredos rotacionados trimestralmente; durante janela de rotação, handler aceita N-1 e N por 24h. Registrar no `audit_log`.

## Limitações conhecidas

1. **Sem granularidade de item no payload** — itens são reconstruídos pelo snapshot interno a partir da condição selecionada; ver `composeSnapshot`.
2. **Sem `external_event_id` em webhooks legados raros** — fallback hash `sha256('digital_guru|transaction_id|event_type|created_at')` registrado em OQ-BR-IDEM-01.
3. **Reentrega agressiva** — provedor reentrega até confirmar 2xx; handler deve responder < 1s.
4. **`approved` sem `pending` prévio** — alguns fluxos pulam pending; FLOW-05 passo 5 cria pending inline (OQ-FLOW-05-02).
5. **Sem notificação de renewal antes do vencimento** — cron interno (FLOW-11 passo 2) antecipa.
6. **Chargeback não detalha motivo** — campo `reason` vem curto; operação precisa cruzar com provedor via UI externa.

## Casos de teste

| ID | Cenário | Resultado |
|---|---|---|
| CT-DG-01 | `purchase.approved` novo | FLOW-05 happy-path; 5+ TEs emitidos; contador +1 |
| CT-DG-02 | Reentrega de `purchase.approved` | duplicate 200; nenhum efeito novo |
| CT-DG-03 | `purchase.refunded` externo (sem refund interno prévio) | abre `refund` system-opened; executa FLOW-07 aprovação automática |
| CT-DG-04 | `purchase.refunded` após refund interno já processado | no-op de domínio; `webhook_log.processed` |
| CT-DG-05 | `subscription.renewed` | `installment.paid`, `current_period_end` avança, `TE-ENTITLEMENT-EXTENDED` |
| CT-DG-06 | `purchase.chargeback` | `transaction.chargeback`, flag `disputed`, `TE-SALE-CHARGEBACK` |
| CT-DG-07 | HMAC inválida | 401, sem linha em `webhook_log` |
| CT-DG-08 | `external_product_id` sem offer mapping | `webhook_log.failed` com `last_error='unmapped_product'`, reprocess após cadastro |
| CT-DG-09 | CPF inválido | `contact_issue kind='document_mismatch'`, contato criado sem CPF |
| CT-DG-10 | `installment.overdue` → `subscription.past_due` | transição atômica, `TE-SUBSCRIPTION-PAST-DUE` |

Testes em `tests/integration/integrations/digital-guru-*.test.ts`.

## Open Questions

- `OQ-DG-01` — Chargeback dispara refund automático (system-opened)? Proposta: sim (OQ-FLOW-05-01).
- `OQ-DG-02` — Quando provedor reporta `refunded` antes do FLOW-07 interno ter completado (corrida), idempotência de refund deve detectar via `external_ref`? Proposta: sim, lookup antes de abrir refund novo.
- `OQ-DG-03` — Rotação de `WEBHOOK_SECRET` precisa de endpoint de admin para virar sem downtime? Fase 2.
- `OQ-DG-04` — `subscription.paused` não existe no enum externo; mapear para `active` + flag interna? Cruza com OQ-BR-SUB-01.
