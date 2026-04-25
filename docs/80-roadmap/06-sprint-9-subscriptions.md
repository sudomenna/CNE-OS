# Sprint 9 — Subscriptions + Parcelamento + Inadimplência  (duração: 3 semanas)

## Objetivo

Entregar **MOD-BILLING**: modelar assinaturas (ciclo, trial, active, past_due, cancelled, expired), parcelas (scheduled, paid, overdue, refunded, cancelled), dunning automático em D+3/D+7/D+15 via cron Inngest, dashboard de inadimplência consolidada e integração com eventos Digital Guru `subscription.*` e `installment.*`. Cancelamento preserva entitlements até `current_period_end` (INV-BILL-07). E2E FLOW-11 verde cobrindo ciclo completo: trial → active → past_due → recovered e past_due → dunning_exhausted → cancelled preservando acesso.

## Entregáveis (outcomes)

- Schemas `subscription`, `installment`, `subscription_status_history`, `installment_status_history` aplicados.
- Funções `createSubscriptionFromTransaction`, `scheduleInstallments`, `handleInstallmentPaid`, `handleInstallmentOverdue`, `cancelSubscription`, `advanceSubscription`.
- Cron Inngest `installment-sweep` (detecta overdue) + `dunning-retry` (D+3/D+7/D+15) + `subscription-advance` (transições de ciclo).
- Adapter DG: eventos `subscription.created`, `subscription.renewed`, `subscription.cancelled`, `installment.paid`, `installment.overdue` processados.
- UI `/billing/subscriptions` lista + detalhe + cancelar.
- UI `/billing/delinquency` dashboard de inadimplência com filtros (marca, idade de atraso, valor) + export CSV.
- E2E `flow-11-subscription-cycle.spec.ts` verde.

## Pré-requisitos (sprints anteriores concluídos)

- Sprint 8 (transaction, snapshot, entitlement, refund, adapter DG, cron Inngest infra).

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-9-01 | Schema `subscription` + CHECKs (period, trial, cancelled) + UNIQUE external | MOD-BILLING | schema | no | — | `20-domain/13-subscription-billing.md` §3.1, §3.4 | `lib/db/schema/billing.ts`, `lib/db/schema/index.ts` | CHECKs barram incoerência; UNIQUE `uq_subscription_external` parcial funciona |
| T-9-02 | Schema `installment` + CHECK parent_exclusive + UNIQUEs de sequência | MOD-BILLING | schema | yes | T-9-01 | `20-domain/13-subscription-billing.md` §3.2; INV-BILL-01 | `lib/db/schema/billing.ts` (adicional) | CHECK barra installment com ambos `transaction_id` e `subscription_id`; `uq_installment_seq_sub` e `uq_installment_seq_trx` funcionam |
| T-9-03 | Schemas `subscription_status_history`, `installment_status_history` + triggers append-only | MOD-BILLING | schema | yes | T-9-01, T-9-02 | `20-domain/13-subscription-billing.md` §3.3 | `lib/db/schema/billing.ts` (adicional), `supabase/migrations/0060_billing_triggers.sql` | UPDATE/DELETE bloqueados |
| T-9-04 | Função `createSubscriptionFromTransaction` | MOD-BILLING | domain | no | T-9-01, T-9-03 | `20-domain/13-subscription-billing.md` §2 interfaces | `lib/domain/billing/create-subscription.ts`, `tests/unit/billing/create.test.ts` | Cria assinatura em `trial` com `trial_ends_at`; emite `TE-SUBSCRIPTION-STARTED` |
| T-9-05 | Função `scheduleInstallments` (parcelamento único OU recorrente) | MOD-BILLING | domain | yes | T-9-02 | `20-domain/13-subscription-billing.md` §2 | `lib/domain/billing/schedule-installments.ts`, `tests/unit/billing/schedule.test.ts` | Dado plano 12x mensal, cria 12 installments em `scheduled`; idempotente sob `external_id` |
| T-9-06 | Funções `handleInstallmentPaid` + `handleInstallmentOverdue` | MOD-BILLING | domain | yes | T-9-05 | `20-domain/13-subscription-billing.md` §6.2 | `lib/domain/billing/handle-installment.ts`, `tests/unit/billing/handle-installment.test.ts` | Paid → emite `TE-INSTALLMENT-PAID`; overdue → emite `TE-INSTALLMENT-OVERDUE` |
| T-9-07 | Função `advanceSubscription` (trial→active, active→past_due, past_due→active/cancelled, active→expired) | MOD-BILLING | domain | no | T-9-06 | `20-domain/13-subscription-billing.md` §6.1; `BR-SUBSCRIPTION` | `lib/domain/billing/advance.ts`, `tests/unit/billing/advance.test.ts` | Transições respeitam matriz; INV-BILL-07 preserva entitlement até period_end |
| T-9-08 | Função `cancelSubscription(id, reason)` | MOD-BILLING | domain | yes | T-9-07 | INV-BILL-07; `BR-REFUND` | `lib/domain/billing/cancel.ts`, `tests/unit/billing/cancel.test.ts` | `cancelled_at=now`; entitlements permanecem ativos até `current_period_end` |
| T-9-09 | Cron `installment-sweep` (detecta scheduled→overdue por `due_at < now`) | MOD-BILLING | integration | yes | T-9-06 | `20-domain/13-subscription-billing.md` §7 dunning | `inngest/functions/installment-sweep.ts`, `tests/integration/billing/sweep.test.ts` | Roda a cada hora; marca `overdue` e emite TE; idempotente (já overdue = noop) |
| T-9-10 | Cron `dunning-retry` (D+3, D+7, D+15) | MOD-BILLING | integration | yes | T-9-09 | `20-domain/13-subscription-billing.md` §7 | `inngest/functions/dunning-retry.ts`, `tests/integration/billing/dunning.test.ts` | Após 3 tentativas sem pagamento, chama `cancelSubscription(reason='dunning_exhausted')`; emite `TE-SUBSCRIPTION-PAST-DUE` e `TE-SUBSCRIPTION-CANCELLED` |
| T-9-11 | Cron `subscription-advance` (rolar ciclo em `current_period_end` para assinaturas com renovação automática) | MOD-BILLING | integration | yes | T-9-07 | OQ-BILL-02 | `inngest/functions/subscription-advance.ts`, `tests/integration/billing/advance-cycle.test.ts` | Atualiza `current_period_start/end` + emite `TE-SUBSCRIPTION-RENEWED`; sem renovação automática vai a `expired` |
| T-9-12 | Extensão adapter Digital Guru: eventos `subscription.*` + `installment.*` | integração | integration | yes | T-9-04, T-9-05, T-9-06 | `40-integrations/01-digital-guru.md` eventos recorrentes | `lib/integrations/digital-guru/map.ts` (adicional), `lib/integrations/digital-guru/handler.ts` (adicional), `tests/integration/integrations/dg-subscription.test.ts` | Idempotente; `installment.paid` chama `handleInstallmentPaid`; `subscription.cancelled` chama `cancelSubscription` |
| T-9-13 | Server Actions billing: cancelar assinatura, retry manual de parcela | MOD-BILLING | api | yes | T-9-08, T-9-10 | `BR-RBAC` (só financial/admin) | `app/(app)/billing/actions.ts` | Commercial tentando cancelar retorna 403 |
| T-9-14 | UI `/billing/subscriptions` lista + detalhe | MOD-BILLING | ui | yes | T-9-13 | `70-ux` | `app/(app)/billing/subscriptions/page.tsx`, `app/(app)/billing/subscriptions/[id]/page.tsx`, `components/billing/subscription-card.tsx`, `components/billing/installment-table.tsx` | Detalhe mostra parcelas + status + próximo billing |
| T-9-15 | UI `/billing/delinquency` dashboard + filtros + export CSV | MOD-BILLING | ui | yes | T-9-13 | `OQ-BILL-03`; dashboards específicos | `app/(app)/billing/delinquency/page.tsx`, `components/billing/delinquency-table.tsx`, `components/billing/delinquency-filters.tsx`, `app/(app)/billing/delinquency/export/route.ts` | Filtros: marca, idade de atraso (buckets 0-30, 31-60, 61-90, >90), faixa de valor; export CSV funciona |
| T-9-16 | Extensão MOD-REFUND: `approveRefund` cancela assinatura associada | MOD-REFUND | integration | yes | T-9-08 | `20-domain/14-refund.md` §7 passo 7 | `lib/domain/refund/approve.ts` (extensão já preparada em T-8-18, agora ativada) | Teste `refund.approve.cancels-subscription` verde |
| T-9-17 | Schemas zod dos TEs subscription/installment | MOD-TIMELINE | domain | yes | — | `30-contracts/03-timeline-event-catalog.md` | `lib/timeline/schemas/subscription-*.ts`, `lib/timeline/schemas/installment-*.ts` | 6 schemas; 1 teste cada |
| T-9-18 | E2E `flow-11-subscription-cycle.spec.ts` | MOD-BILLING | test | yes | T-9-11, T-9-14, T-9-15 | `FLOW-11`; `BR-SUBSCRIPTION` | `tests/e2e/flow-11-subscription-cycle.spec.ts` | Cenários: trial→active por payment; active→past_due por overdue; past_due→active por retry sucedido; past_due→cancelled após D+15; cancel preserva entitlement até period_end |
| T-9-19 | Teste integração idempotência DG subscription events | integração | test | yes | T-9-12 | `BR-INTEGRATION-IDEMPOTENCY` | `tests/integration/integrations/dg-subscription-idempotency.test.ts` | Mesmo `installment.paid` 3x = 1 mudança de estado |

## Ondas de paralelização sugeridas

**Onda A (serial):** T-9-01 (estabelece `billing.ts`).

**Onda B (serial em `billing.ts`):** T-9-02 → T-9-03.

**Onda C (paralelo, 3 subagents, depende de B):** T-9-04, T-9-05, T-9-17
→ Create-subscription, schedule-installments, schemas zod. Arquivos disjuntos.

**Onda D (paralelo, 2 subagents, depende de C):** T-9-06, T-9-16
→ Handle-installment + refund-integration.

**Onda E (serial, depende de D):** T-9-07 (advance é núcleo).

**Onda F (paralelo, 3 subagents, depende de E):** T-9-08, T-9-09, T-9-12
→ Cancel, sweep cron, DG events extension. Arquivos disjuntos.

**Onda G (paralelo, 3 subagents, depende de F):** T-9-10, T-9-11, T-9-13
→ Dunning cron, advance cron, server actions.

**Onda H (paralelo, 2 subagents, depende de G):** T-9-14, T-9-15.

**Onda I (paralelo, 2 subagents, depende de H):** T-9-18, T-9-19.

## Critério de aceite do sprint (DoD)

- [x] Todos os T-IDs em `completed`.
- [x] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [x] E2E FLOW-11 verde em todos os 7 cenários (5 BRs + 2 INV-BILL-07).
- [x] Crons rodam com time-mocking via `now?: Date` injetado — testes de integração verdes.
- [x] Dashboard de inadimplência com índice `idx_subscription_contact` + filtros por URL params.
- [x] Export CSV com RBAC (admin vê tudo; financial/commercial filtrado por brand_id).
- [x] Deploy: migrations aplicadas em Supabase; FLOW-11 7/7 verde (2026-04-25).

## Riscos e mitigação

- **Time-mocking de crons frágil.** Mitigação: T-9-10 e T-9-11 usam `Date` injetado como dependência pura; teste de integração usa fixtures com `due_at` no passado.
- **Dunning duplicado em race de webhook.** Mitigação: `uq_installment_external` + `retry_count` incrementado atomicamente.
- **Entitlement revogado prematuramente em cancelamento.** Mitigação: INV-BILL-07 explícito em teste E2E; T-9-08 nunca chama `revokeByTransaction`.
- **Renovação automática cria nova subscription vs atualiza (OQ-BILL-02).** Mitigação: T-9-11 atualiza (proposta da OQ); se negócio decidir outro, tarefa-follow-up.
- **Dashboard lento com 10k+ assinaturas.** Mitigação: índice `idx_subscription_contact (contact_id, status)` + materialized view (Sprint 10).

## Open Questions

- `OQ-SPRINT9-01` — período de dunning (D+3/D+7/D+15) é fixo global ou configurável por marca/oferta? Fase 1 global (OQ-BILL-03).
- `OQ-SPRINT9-02` — `subscription.paused` entra agora ou Fase 2 (OQ-BILL-01)? Fase 1 ignora.
- `OQ-SPRINT9-03` — notificação ao contato em past_due é responsabilidade de MOD-AUTOMATION (Sprint 11)? Hoje sim, só emite TE.
