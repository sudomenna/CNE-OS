# BR-SUBSCRIPTION: ciclo de assinatura e dunning

## Enunciado

Uma `subscription` segue o ciclo **`trial`** (opcional) → **`active`** → ao vencer sem pagamento vira **`past_due`** → após N retries de cobrança recupera para `active` ou é **`cancelled`**. O cancelamento — seja automático (dunning esgotado) ou manual (usuário/admin) — **preserva os `customer_entitlement` ativos até `current_period_end`**; a revogação só ocorre via refund ([`BR-REFUND`](./BR-REFUND.md)). Reativação após `cancelled`/`expired` cria **nova** `subscription`; a antiga permanece para histórico.

## Motivação

Padronizar o ciclo de cobrança recorrente para viabilizar dashboard de inadimplência ([`ADR-01`](../90-meta/04-decision-log.md#adr-01)), garantir comportamento previsível (cliente cancelado não perde acesso no meio do período pago) e permitir integrações de dunning com Digital Guru de forma idempotente.

## Escopo

- Módulo: [`MOD-BILLING`](../20-domain/13-subscription-billing.md).
- Entidades: `subscription`, `installment`, `subscription_status_history`, `installment_status_history`.

## Enforcement

- [x] Função de domínio pura (`advanceSubscription`, `markInstallmentOverdue`, `markInstallmentPaid`)
- [x] Guard em Server Action (cancelamento manual exige RBAC; self-service tem escopo restrito)
- [x] DB constraint (CHECKs em `subscription` sobre coerência de `trial_ends_at`, `cancelled_at`, `current_period_end`)
- [x] DB trigger (append-only em history)
- [ ] Guard em UI

## Política de dunning (Fase 1)

Retry após `due_at` da parcela: **D+3, D+7, D+15**. Configuração global (não por oferta) — ver [`OQ-BILL-03`](../20-domain/13-subscription-billing.md#12-open-questions).

- D+3: incrementa `retry_count=1`, notifica provedor, emite `TE-INSTALLMENT-OVERDUE` (primeira vez).
- D+7: `retry_count=2`.
- D+15: `retry_count=3`. Se ainda `overdue`, `subscription → cancelled` com `cancel_reason='dunning_exhausted'`.

A primeira transição para `past_due` (logo após `due_at`) ocorre via cron de varredura (`idx_installment_status_due` sobre `status='scheduled' AND due_at < now()`).

## Tabela de decisão — transições de `subscription.status`

| De | Evento | Condição | Para | Notas |
|---|---|---|---|---|
| — | `createSubscriptionFromTransaction` | `trial_ends_at != null` | `trial` | cria parcelas do trial |
| — | `createSubscriptionFromTransaction` | sem trial | `active` | próximo ciclo = `current_period_end` |
| `trial` | cron avança | `trial_ends_at <= now` e parcela paga | `active` | emite `TE-SUBSCRIPTION-STARTED` (efetivo) |
| `trial` | cron avança | `trial_ends_at <= now` e parcela não paga | `past_due` | entra em dunning |
| `active` | cron de varredura | parcela do ciclo em `status='overdue'` | `past_due` | `TE-SUBSCRIPTION-PAST-DUE` |
| `past_due` | webhook paga | parcela vira `paid` | `active` | avança `current_period_*`, `TE-SUBSCRIPTION-RENEWED` |
| `past_due` | D+15 sem pagamento | retry esgotado | `cancelled` | `cancel_reason='dunning_exhausted'`, `TE-SUBSCRIPTION-CANCELLED` |
| `active` \| `past_due` | admin/financial cancela | RBAC ok | `cancelled` | `cancel_reason='admin_cancel'` ou self-service |
| `active` | fim de `current_period_end` sem renovação | sem parcela agendada | `expired` | ciclo finito terminou |
| `cancelled` | — | — | terminal | reativação cria nova subscription |
| `expired` | — | — | terminal | idem |

## Tabela de decisão — transições de `installment.status`

| De | Evento | Para |
|---|---|---|
| — | emissão | `scheduled` |
| `scheduled` | webhook de pagamento | `paid` |
| `scheduled` | cron detecta `due_at < now` | `overdue` |
| `overdue` | webhook de pagamento | `paid` |
| `paid` | refund aprovado sobre transação/assinatura | `refunded` |
| qualquer | admin cancela parcela avulsa | `cancelled` |

## Preservação de direitos ao cancelar

Quando `subscription.status` vai para `cancelled` (qualquer caminho exceto refund):
- `customer_entitlement` derivados da `origin_transaction_id` **permanecem `active`** até `current_period_end`.
- Cron noturno identifica direitos ativos cuja subscription está `cancelled` e `ends_at <= now()` → transiciona direito para `expired` (job de expiração natural).

Em refund, o fluxo é diferente (revoga imediatamente — ver [`BR-REFUND`](./BR-REFUND.md)).

## Contrato TS

```ts
export async function advanceSubscription(
  subscriptionId: string,
): Promise<SubscriptionStatus>;
// Chamado por cron; aplica a matriz de transições acima.

export async function cancelSubscription(
  subscriptionId: string,
  reason: string,
  actor: { kind: 'admin'|'financial'|'self'|'system'; userId?: string },
): Promise<Subscription>;

export async function markInstallmentPaid(
  externalEventId: string,   // id do webhook para idempotência
  installmentId: string,
  paidAt: Date,
): Promise<Installment>;

export async function markInstallmentOverdue(
  installmentId: string,
): Promise<Installment>;
```

## Casos de teste (Given/When/Then)

### CT-SUB-01 — Ciclo feliz: trial → active → renewed
- **Given** nova assinatura com `trial_ends_at=now+7d`; primeira parcela agendada para D+7.
- **When** parcela D+7 paga via webhook.
- **Then** `status` muda para `active`; `TE-SUBSCRIPTION-STARTED` emitido. Avançado para o próximo período com `TE-SUBSCRIPTION-RENEWED`.

### CT-SUB-02 — Past due recupera
- **Given** assinatura `active`; parcela P1 vence e não é paga (cron marca `overdue`, subscription vai `past_due`).
- **When** em D+3 parcela é paga (webhook).
- **Then** P1 `paid`; subscription volta a `active`; `TE-SUBSCRIPTION-RENEWED`; `current_period_*` avançado.

### CT-SUB-03 — Dunning esgotado cancela
- **Given** parcela vencida, retries D+3 e D+7 falhos.
- **When** D+15 sem pagamento.
- **Then** subscription `cancelled` com `cancel_reason='dunning_exhausted'`; `cancelled_at=now()`; entitlements permanecem ativos até `current_period_end`; `TE-SUBSCRIPTION-CANCELLED` emitido.

### CT-SUB-04 — Cancelamento manual preserva direito até fim do período
- **Given** subscription `active` com `current_period_end=now+20d`; contato solicita cancelamento.
- **When** suporte/financial/admin cancela.
- **Then** `status='cancelled'`; entitlements com `ends_at` derivado ≥ `current_period_end` continuam ativos; cron de expiração só revogará após `current_period_end`.

### CT-SUB-05 — Reativação cria nova subscription
- **Given** subscription S1 `cancelled`.
- **When** contato decide reativar (nova compra da mesma oferta).
- **Then** S1 permanece imutável em `cancelled`; nova `subscription` S2 é criada via `createSubscriptionFromTransaction`; direitos são consolidados via BR-ENTITLEMENT-CONSOLIDATION.

### CT-SUB-06 — Idempotência de pagamento
- **Given** webhook de pagamento com `external_event_id=evt_123` processado (parcela `paid`).
- **When** o mesmo webhook chega novamente.
- **Then** `markInstallmentPaid` detecta `evt_123` já registrado em `webhook_log`/`installment.external_id`; noop; parcela não é duplicada.

### CT-SUB-07 — Guard CHECK bloqueia subscription inconsistente
- **Given** tentativa de INSERT subscription `status='trial'` sem `trial_ends_at`.
- **When** INSERT.
- **Then** CHECK falha (ck_subscription_trial).

### CT-SUB-08 — Expiração natural
- **Given** subscription `active` com ciclo finito (sem renovação automática); `current_period_end=now-1h`; sem nova parcela.
- **When** cron avança.
- **Then** `status='expired'`; sem evento de cancelamento; direitos vão para `expired` pelo cron de direitos.

## Rastreabilidade

- Teste esperado: `tests/integration/billing/subscription-lifecycle.test.ts`, `tests/integration/billing/dunning.test.ts`.
- Referenciada em: [`MOD-BILLING §6, §7`](../20-domain/13-subscription-billing.md), [`BR-REFUND`](./BR-REFUND.md), [`BR-INTEGRATION-IDEMPOTENCY`](./BR-INTEGRATION-IDEMPOTENCY.md).
- ADR: [`ADR-01`](../90-meta/04-decision-log.md#adr-01).

## Open Questions

- `OQ-BR-SUB-01` — `paused` está no enum `subscription_status` mas não há evento que o dispare nesta BR. Manter por extensibilidade ou remover?
- `OQ-BR-SUB-02` — janela de dunning configurável por oferta exige coluna nova em `offer`? Fase 1 usa global; registrar como roadmap.
- `OQ-BR-SUB-03` — cancelamento manual durante trial: preserva acesso até `trial_ends_at` ou encerra imediatamente? Proposta: preserva.
- `OQ-BR-SUB-04` — "cron de expiração de direitos" depende de MOD-ENTITLEMENT; formalizar cron schedule.
- `OQ-BR-SUB-05` — cobrança de upgrades/downgrades na assinatura (proração) — fora do escopo Fase 1; confirmar.
