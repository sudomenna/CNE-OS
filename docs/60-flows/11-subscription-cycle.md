# FLOW-11: Ciclo de assinatura

## Gatilho / pré-condições

Assinatura `subscription` é criada em [`FLOW-05`](./05-external-sale-ingest.md) passo 16 quando `offer.billing_kind='subscription'`. A partir daí, seu ciclo é conduzido por timers (Inngest cron) e webhooks de pagamento.

Pré-condições: `subscription` existe com `status IN ('trial','active')`; ao menos 1 `installment` agendada; `offer` configurada com periodicidade (mensal/anual).

## Atores

- humano: contato (cancela self-service); admin/financial/support (cancela por solicitação).
- sistema: `MOD-BILLING` (`advanceSubscription`, `markInstallmentPaid`, `markInstallmentOverdue`, `cancelSubscription`); Inngest cron; `MOD-TIMELINE`; `MOD-INTEGRATION` (Digital Guru).
- integração: Digital Guru (cobrança recorrente; webhooks de pagamento).

## Passos

### Criação (subchamada de FLOW-05)

1. `createSubscriptionFromTransaction(transactionId)`:
   - cria `subscription` com `status='trial'` (se `trial_ends_at` definido) ou `active`;
   - define `current_period_start=approved_at`, `current_period_end=approved_at + period`;
   - INSERT `installment` inicial (ou do trial);
   - emite `TE-SUBSCRIPTION-STARTED`.

### Ciclo de cobrança recorrente

2. **Cron diário** varre `subscription` ativas com `current_period_end <= now() + 1d AND status IN ('active','trial')`:
   - enfileira tentativa de cobrança via provedor para a próxima parcela;
   - Digital Guru processa PIX/cartão;
   - webhook de resultado chega e é processado via [`FLOW-05`](./05-external-sale-ingest.md) (idempotente por `external_event_id`).
3. **Pagamento sucesso** — `markInstallmentPaid(externalEventId, installmentId, paidAt)`:
   - idempotência: checa `webhook_log`; se já processado, no-op;
   - UPDATE `installment SET status='paid', paid_at`;
   - INSERT `installment_status_history`;
   - `advanceSubscription`: `current_period_start=current_period_end`, `current_period_end += period`;
   - se status era `past_due` ⇒ volta a `active`;
   - emite `TE-INSTALLMENT-PAID` + `TE-SUBSCRIPTION-RENEWED`;
   - estende/consolida entitlements vinculados (ver [`FLOW-06`](./06-entitlement-update.md)).
4. **Pagamento falha (primeira)** — cron detecta `installment.due_at < now() AND status='scheduled'`:
   - UPDATE `installment SET status='overdue'`;
   - `advanceSubscription`: transiciona subscription para `past_due`;
   - emite `TE-INSTALLMENT-OVERDUE` + `TE-SUBSCRIPTION-PAST-DUE`;
   - inicia dunning: `retry_count=1`.
5. **Dunning D+3, D+7, D+15** — cron tenta cobrança novamente:
   - sucesso em qualquer ponto ⇒ passo 3;
   - D+3 falha ⇒ `retry_count=2`, notifica provedor, emite `TE-INTEGRATION-EVENT` informativo;
   - D+7 falha ⇒ `retry_count=3`;
   - D+15 falha ⇒ `cancelSubscription(id, 'dunning_exhausted', { kind:'system' })`.
6. **Cancelamento automático (`dunning_exhausted`)**:
   - UPDATE `subscription SET status='cancelled', cancelled_at=now(), cancel_reason='dunning_exhausted'`;
   - INSERT `subscription_status_history`;
   - **preserva entitlements ativos até `current_period_end`** (cron noturno de expiração natural depois);
   - emite `TE-SUBSCRIPTION-CANCELLED`.

### Cancelamento manual

7. Contato (self-service) ou operador (`admin`/`financial`/`support`) solicita cancelamento:
   - guard `can(user, ...)` e 2FA se aplicável;
   - `cancelSubscription(id, reason, actor)`;
   - subscription `cancelled`, `cancelled_at=now()`, `cancel_reason=<motivo>`;
   - **entitlements permanecem ativos até `current_period_end`** (diferencia de refund);
   - emite `TE-SUBSCRIPTION-CANCELLED`.

### Expiração natural

8. Cron noturno identifica `subscription.status='active'` sem renovação agendada e `current_period_end <= now()`:
   - UPDATE `status='expired'`;
   - entitlements dependentes vão para `expired` via cron de direitos (`OQ-BR-SUB-04`).

### Reativação

9. Contato decide reativar (cancelada ou expirada):
   - nova compra da mesma oferta ⇒ FLOW-05 cria **nova** `subscription` S2;
   - S1 permanece imutável em `cancelled`/`expired` para histórico;
   - direito consolidado via [`FLOW-06`](./06-entitlement-update.md).

## Pós-condições

- Ciclo completo persistido em `subscription_status_history` + `installment_status_history` (ambos append-only).
- Webhooks idempotentes por `external_event_id` (`BR-INTEGRATION-IDEMPOTENCY`).
- Timeline contém eventos para cada marco.
- Entitlements preservados até `current_period_end` quando cancelamento não é refund.

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | webhook de pagamento duplicado | `markInstallmentPaid` detecta `webhook_log`; no-op | — |
| E-02 | provedor offline durante cron | job falha; Inngest retry backoff (até 5); depois DLQ | [`FLOW-12`](./12-webhook-reprocess.md) |
| E-03 | CHECK `ck_subscription_trial` violado | rejeitar INSERT; alerta | investigar caller |
| E-04 | cancelamento concorrente (2 atendentes) | `SELECT FOR UPDATE`; segundo recebe estado já `cancelled` | idempotente (no-op) |
| E-05 | cancelamento durante trial (`OQ-BR-SUB-03`) | preserva acesso até `trial_ends_at`; status = `cancelled` | — |
| E-06 | refund paralelo ao ciclo | [`FLOW-07`](./07-refund-end-to-end.md) cancela subscription imediatamente **e** revoga entitlements (diferente deste fluxo) | — |

## Regras referenciadas

- [`BR-SUBSCRIPTION`](../50-business-rules/BR-SUBSCRIPTION.md)
- [`BR-INTEGRATION-IDEMPOTENCY`](../50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md)
- [`BR-ENTITLEMENT-CONSOLIDATION`](../50-business-rules/BR-ENTITLEMENT-CONSOLIDATION.md)
- [`BR-REFUND`](../50-business-rules/BR-REFUND.md) (contraste: refund cancela E revoga)
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md)
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md)

## Eventos emitidos

- `TE-SUBSCRIPTION-STARTED`
- `TE-SUBSCRIPTION-RENEWED`
- `TE-SUBSCRIPTION-PAST-DUE`
- `TE-SUBSCRIPTION-CANCELLED`
- `TE-INSTALLMENT-PAID`
- `TE-INSTALLMENT-OVERDUE`
- `TE-ENTITLEMENT-EXTENDED` (ao renovar via pagamento, via FLOW-06)

## Observabilidade

- Métricas:
  - `subscription_active_total{brand_id}` (gauge);
  - `subscription_past_due_total` (gauge);
  - `subscription_cancelled_total{reason}` (counter);
  - `installment_paid_total{attempt_number}`;
  - `dunning_recovery_rate{retry_step}` (D+3/D+7/D+15).
- Logs (`correlation_id`, `subscription_id`, `installment_id`, `external_event_id`, `flow='FLOW-11'`).
- Alertas:
  - PagerDuty: taxa de pagamento sucesso < 80% em janela de 1h.
  - Axiom: dashboard MRR, churn voluntário vs involuntário (dunning).
  - Sentry: cron executando com atraso > 10 min.

## Casos de teste E2E obrigatórios

1. **trial-para-active-no-primeiro-pagamento**
   - Given: subscription `trial` com `trial_ends_at=now+7d`; parcela P1 agendada D+7.
   - When: P1 paga via webhook.
   - Then: `status='active'`; `TE-SUBSCRIPTION-STARTED`; ciclo avança.

2. **past-due-recupera-em-D+3**
   - Given: subscription `active`; P1 vence; cron marca overdue + past_due.
   - When: D+3 pagamento sucesso.
   - Then: P1 `paid`; subscription `active`; `TE-SUBSCRIPTION-RENEWED`.

3. **dunning-esgotado-cancela**
   - Given: D+3 e D+7 falharam.
   - When: D+15 falha.
   - Then: `status='cancelled'`, `cancel_reason='dunning_exhausted'`; entitlements seguem ativos até `current_period_end`.

4. **cancelamento-manual-preserva-acesso**
   - Given: subscription `active`, `current_period_end=now+20d`.
   - When: suporte cancela.
   - Then: `cancelled`; entitlements `active` por 20d; cron expira depois.

5. **reativacao-cria-nova**
   - Given: S1 `cancelled`.
   - When: contato recompra a oferta.
   - Then: S1 imutável; S2 nova subscription criada; entitlements consolidados via FLOW-06.

6. **idempotencia-pagamento**
   - Given: `evt_123` processado (P1 paid).
   - When: reentrega.
   - Then: no-op; `attempts` não muda em installment.

7. **refund-diferente-de-cancel-manual**
   - Given: subscription `active` com entitlements ativos.
   - When: FLOW-07 aprova refund sobre T1 originante.
   - Then: subscription `cancelled` imediatamente E entitlements `revoked` (contrastando com CT #4).

8. **expiracao-natural**
   - Given: subscription com ciclo finito, sem renovação agendada; `current_period_end<now`.
   - When: cron noturno.
   - Then: `status='expired'`; sem TE-SUBSCRIPTION-CANCELLED; entitlements expiram depois.

## Open Questions

- `OQ-FLOW-11-01` — `paused` no enum (`OQ-BR-SUB-01`) — quando usar? Hoje nenhum fluxo dispara.
- `OQ-FLOW-11-02` — dunning configurável por oferta (`OQ-BR-SUB-02`) — Fase 1 global.
- `OQ-FLOW-11-03` — proração em upgrade/downgrade (`OQ-BR-SUB-05`) — fora do escopo Fase 1.
- `OQ-FLOW-11-04` — cron de expiração de direitos (`OQ-BR-SUB-04`) precisa formalizar janela (diária? horária?).
