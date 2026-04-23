# Sprint 8 — Snapshot + Digital Guru + Entitlement + Refund  (duração: 3 semanas)

## Objetivo

Entregar o núcleo transacional do produto: **transação + snapshot imutável**, integração com **Digital Guru** (webhook + mapper + reprocessador), **entitlement** com consolidação e revogação, e **refund** end-to-end com cascata atômica de efeitos. Este sprint é onde tudo o que foi preparado (MOD-OFFER, MOD-CONTACT, MOD-FUNNEL, MOD-CATALOG) converge: uma venda aprovada via webhook DG gera snapshot congelado, incrementa contador, concede direitos (consolidando com existentes), reclassifica contato, fecha oportunidade, aplica auto_tag. Um reembolso executa a cascata inversa sem mutar snapshot. Notazz é tratado como envio externo simplificado (outbound via Inngest, sem receber emissão de volta na Fase 1).

Ao final, os fluxos `FLOW-05` (ingest venda), `FLOW-06` (consolidação de direitos), `FLOW-07` (reembolso end-to-end) e `FLOW-12` (webhook reprocess) rodam em E2E com provedor mockado e real (staging).

## Entregáveis (outcomes)

- Schemas `transaction`, `transaction_snapshot` (append-only com trigger), `transaction_snapshot_flag_history`, `transaction_item`, `transaction_status_history`.
- Schema `customer_entitlement`, `entitlement_history`, `entitlement_status_history` com índice único parcial de unicidade ativa por ref.
- Schema `refund`, `refund_effect_log`, `refund_status_history`.
- Adapter Digital Guru: route handler, validação assinatura, mapper para modelo canônico, processador Inngest idempotente, DLQ para reprocess.
- Função pura `composeSnapshot(transactionId)` + `approveTransaction` orquestrando 12 passos atômicos.
- Função pura `consolidate(existing, incoming)` + `grantFromTransaction` + `revokeByTransaction`.
- Funções `openRefund`, `approveRefund`, `rejectRefund`, `markProcessed` com cascata atômica.
- UI `/transactions` lista + detalhe (com snapshot viewer read-only) + modal "reembolsar".
- UI wizard de reembolso com confirmação e diff de efeitos.
- UI `/webhooks` DLQ reprocess manual.
- Notazz outbound: função `sendInvoiceRequest` disparada pós-aprovação (Inngest), idempotente.
- E2E FLOW-05, FLOW-06, FLOW-07, FLOW-12 verdes.

## Pré-requisitos (sprints anteriores concluídos)

- Sprint 0 (`webhook_log`, `timeline_event`).
- Sprint 1-2 (contact + reclassify).
- Sprint 5 (funnel — para `markWon` pós-aprovação).
- Sprint 6-7 (offer engine — `selectCondition`, `incrementSalesCounter`, `getIssuingLegalEntity`).

## Tarefas

| ID | Título | Módulo | Tipo | Parallel-safe | Depends-on | Specs referenciadas | Arquivos editados (Ownership) | Critério de aceite |
|---|---|---|---|---|---|---|---|---|
| T-8-01 | Schema `transaction` + índices (external UNIQUE, offer-per-contact UNIQUE, contact time, offer) | MOD-TRANSACTION | schema | no | — | `20-domain/11-transaction-snapshot.md` §3.1, §3.6; `BR-OFFER-UNIQUENESS`; `BR-INTEGRATION-IDEMPOTENCY` | `lib/db/schema/transaction.ts`, `lib/db/schema/index.ts` | Todos os índices aplicados; CHECK de coerência approved/refused verde |
| T-8-02 | Schema `transaction_snapshot` append-only + trigger de imutabilidade + FK deferrable | MOD-TRANSACTION | schema | yes | T-8-01 | `20-domain/11-transaction-snapshot.md` §3.2; `BR-SNAPSHOT-IMMUTABILITY` | `lib/db/schema/transaction.ts` (adicional), `supabase/migrations/0050_snapshot_immutable.sql` | Trigger `trg_transaction_snapshot_immutable` barra UPDATE/DELETE; FK `fk_transaction_snapshot` deferrable |
| T-8-03 | Schema `transaction_snapshot_flag_history` + `transaction_item` + `transaction_status_history` | MOD-TRANSACTION | schema | yes | T-8-01 | `20-domain/11-transaction-snapshot.md` §3.3-§3.5 | `lib/db/schema/transaction.ts` (adicional) | `transaction_item.delivery_status` com CHECK text (enum pendente em OQ-TRX-02) |
| T-8-04 | Schema `customer_entitlement` + índice único parcial `uq_customer_entitlement_active_per_ref` | MOD-ENTITLEMENT | schema | no | T-8-01 | `20-domain/12-entitlement.md` §3.1, §3.4; INV-ENT-01 | `lib/db/schema/entitlement.ts`, `lib/db/schema/index.ts` | Índice barra 2º ativo mesmo ref; CHECK `ck_customer_entitlement_ends_after_started` funciona |
| T-8-05 | Schema `entitlement_history` + `entitlement_status_history` + triggers append-only | MOD-ENTITLEMENT | schema | yes | T-8-04 | `20-domain/12-entitlement.md` §3.2-§3.3 | `lib/db/schema/entitlement.ts` (adicional), `supabase/migrations/0051_entitlement_triggers.sql` | UPDATE/DELETE bloqueados; `origin_transaction_id` imutável via trigger |
| T-8-06 | Schema `refund` + `refund_effect_log` + `refund_status_history` | MOD-REFUND | schema | no | T-8-01 | `20-domain/14-refund.md` §3, §3.4 | `lib/db/schema/refund.ts`, `lib/db/schema/index.ts`, `supabase/migrations/0052_refund_triggers.sql` | `uq_refund_active_per_transaction` parcial barra concorrência; CHECK refund status verde |
| T-8-07 | Função pura `composeSnapshot(transactionId)` — serializa offer+condition+items+rules+payment + source | MOD-TRANSACTION | domain | no | T-8-02, T-8-03 | `20-domain/11-transaction-snapshot.md` §3.2 schema payload | `lib/domain/transaction/snapshot.ts`, `tests/unit/transaction/snapshot.test.ts` | Payload segue schema `TransactionSnapshotPayload v1`; snapshot congela `offer.name` atual (mudança futura em offer não afeta) |
| T-8-08 | Função pura `consolidate(existing, incoming)` — 5 casos de BR-ENTITLEMENT-CONSOLIDATION | MOD-ENTITLEMENT | domain | yes | — | `BR-ENTITLEMENT-CONSOLIDATION` | `lib/domain/entitlement/consolidate.ts`, `tests/unit/entitlement/consolidate.test.ts` | Retorna `'create'|'extend_expiration'|'promote_perpetuous'|'merge_quantity'|'reactivate'|'noop'`; 8 testes Given/When/Then |
| T-8-09 | Função `grantFromTransaction(transactionId)` (aplica consolidate por item + emite TE) | MOD-ENTITLEMENT | domain | no | T-8-04, T-8-05, T-8-08 | `20-domain/12-entitlement.md` §10 fluxo | `lib/domain/entitlement/grant.ts`, `tests/integration/entitlement/grant.test.ts` | 1 entitlement por item do snapshot; emite `TE-ENTITLEMENT-GRANTED`/`EXTENDED` conforme resultado |
| T-8-10 | Função `revokeByTransaction(transactionId, reason)` | MOD-ENTITLEMENT | domain | yes | T-8-09 | `20-domain/12-entitlement.md` §2 | `lib/domain/entitlement/revoke.ts`, `tests/unit/entitlement/revoke.test.ts` | Marca todos os direitos com `origin_transaction_id=X` como `revoked`; grava `entitlement_history` |
| T-8-11 | Função `approveTransaction(transactionId)` — orquestra 12 passos atômicos | MOD-TRANSACTION | domain | no | T-8-07, T-8-09 | `20-domain/11-transaction-snapshot.md` §10 fluxo | `lib/domain/transaction/approve.ts`, `tests/integration/transaction/approve.test.ts` | Passos em 1 transação SQL: FOR UPDATE, BR-OFFER-UNIQUENESS, selectCondition, incrementSalesCounter, composeSnapshot, INSERT snapshot, INSERT items, UPDATE transaction, grantFromTransaction, reclassify, markWon, emit TEs; falha = rollback total |
| T-8-12 | Função `refuseTransaction`, `createPendingTransaction`, `flagSnapshotRefunded` | MOD-TRANSACTION | domain | yes | T-8-01, T-8-02 | `20-domain/11-transaction-snapshot.md` §2 interfaces | `lib/domain/transaction/create-pending.ts`, `lib/domain/transaction/refuse.ts`, `lib/domain/transaction/flag-snapshot.ts`, `tests/unit/transaction/**` | `flagSnapshotRefunded` escreve em `transaction_snapshot_flag_history` sem tocar payload |
| T-8-13 | Adapter Digital Guru: route handler + validação assinatura + `webhook_log` UNIQUE | integração | integration | yes | — | `40-integrations/01-digital-guru.md`; `BR-INTEGRATION-IDEMPOTENCY` | `app/api/webhooks/digital-guru/route.ts`, `lib/integrations/digital-guru/verify-signature.ts`, `tests/integration/integrations/dg-signature.test.ts` | Assinatura inválida retorna 401; duplicate `external_event_id` retorna 200 noop |
| T-8-14 | Adapter Digital Guru: mapper (DG event → domínio canônico) | integração | integration | yes | — | `40-integrations/01-digital-guru.md` mapeamento | `lib/integrations/digital-guru/map.ts`, `tests/unit/integrations/dg-map.test.ts` | Mapeia 6 eventos Fase 1 (`purchase.approved`, `purchase.pending`, `purchase.refused`, `purchase.refunded`, `subscription.*` stub, `installment.*` stub) |
| T-8-15 | Processador Inngest Digital Guru (consome `webhook_log`, despacha para domínio) | integração | integration | no | T-8-11, T-8-12, T-8-13, T-8-14 | `FLOW-05`; `FLOW-12` | `inngest/functions/digital-guru-process.ts`, `lib/integrations/digital-guru/handler.ts`, `tests/integration/integrations/dg-handler.test.ts` | Retry com backoff exponencial 5x; após falha → DLQ (`webhook_log.status='failed'`); idempotente no `external_event_id` |
| T-8-16 | UI `/transactions` lista + detalhe + snapshot viewer read-only | MOD-TRANSACTION | ui | yes | T-8-11 | `70-ux` | `app/(app)/transactions/page.tsx`, `app/(app)/transactions/[id]/page.tsx`, `components/transaction/snapshot-viewer.tsx`, `components/transaction/transaction-list.tsx` | Detalhe mostra payload do snapshot formatado em árvore; botão "reembolsar" aparece só se status=approved e sem refund ativo |
| T-8-17 | UI `/webhooks` lista + detalhe + botão "reprocessar" (FLOW-12) | integração | ui | yes | T-8-15 | `FLOW-12` | `app/(app)/settings/webhooks/page.tsx`, `app/(app)/settings/webhooks/[id]/page.tsx`, `app/(app)/settings/webhooks/actions.ts` | Admin reprocessa evento DLQ; novo attempt registrado; emite TE |
| T-8-18 | Função `openRefund`, `approveRefund`, `rejectRefund`, `markProcessed` | MOD-REFUND | domain | no | T-8-06, T-8-10, T-8-11, T-8-12 | `20-domain/14-refund.md` §7 ordem canônica; `BR-REFUND` | `lib/domain/refund/open.ts`, `lib/domain/refund/approve.ts`, `lib/domain/refund/reject.ts`, `lib/domain/refund/mark-processed.ts`, `tests/integration/refund/**` | `approveRefund` executa 8 efeitos em 1 transação; falha em 1 = rollback total |
| T-8-19 | Server Actions + UI wizard reembolso (3 passos: motivo → efeitos previstos → confirmar) | MOD-REFUND | ui | yes | T-8-18, T-8-16 | `BR-RBAC`; `BR-REFUND` | `app/(app)/transactions/[id]/refund/page.tsx`, `app/(app)/transactions/[id]/refund/actions.ts`, `components/refund/wizard.tsx`, `components/refund/effects-preview.tsx` | Commercial tentando aprovar retorna 403; admin vê preview com lista de direitos que serão revogados |
| T-8-20 | Notazz outbound stub (envio de pedido de NF pós-aprovação) | integração | integration | yes | T-8-11 | `40-integrations/notazz.md`; ADR-02 (CNPJ fixo) | `lib/integrations/notazz/send.ts`, `inngest/functions/notazz-send.ts`, `tests/unit/integrations/notazz.test.ts` | Pós-aprovação dispara envio assíncrono com `external_id` idempotente; falha → retry + DLQ |
| T-8-21 | Extensão timeline: schemas zod para `TE-SALE-*`, `TE-ENTITLEMENT-*`, `TE-SUBSCRIPTION-*` (stubs), `TE-REFUND` | MOD-TIMELINE | domain | yes | — | `30-contracts/03-timeline-event-catalog.md` | `lib/timeline/schemas/sale-*.ts`, `lib/timeline/schemas/entitlement-*.ts`, `lib/timeline/schemas/refund-*.ts` | Todos os payloads validam; 1 teste por kind |
| T-8-22 | E2E `flow-05-external-sale-ingest.spec.ts` | MOD-TRANSACTION | test | yes | T-8-15, T-8-16 | `FLOW-05` | `tests/e2e/flow-05-external-sale-ingest.spec.ts` | Webhook mockado DG `purchase.approved` → transação approved + snapshot + entitlement + classify + markWon + auto_tag em <10s |
| T-8-23 | E2E `flow-06-entitlement-consolidation.spec.ts` | MOD-ENTITLEMENT | test | yes | T-8-22 | `FLOW-06`; `BR-ENTITLEMENT-CONSOLIDATION` | `tests/e2e/flow-06-entitlement-consolidation.spec.ts` | 2 compras sucessivas do mesmo produto estendem 1 linha; 3º caso promove perpetuous |
| T-8-24 | E2E `flow-07-refund-end-to-end.spec.ts` | MOD-REFUND | test | yes | T-8-19 | `FLOW-07`; `BR-REFUND`; `BR-SNAPSHOT-IMMUTABILITY` | `tests/e2e/flow-07-refund-end-to-end.spec.ts` | Refund aprovado: snapshot flag em history, direitos revoked, contato reclassificado, oportunidade revertida, assinatura stub cancelada, TEs emitidas, payload snapshot inalterado |
| T-8-25 | E2E `flow-12-webhook-reprocess.spec.ts` | integração | test | yes | T-8-17 | `FLOW-12` | `tests/e2e/flow-12-webhook-reprocess.spec.ts` | Evento DLQ reprocessado via UI cria transação approved sem duplicar |
| T-8-26 | Teste imutabilidade: tentar UPDATE/DELETE em `transaction_snapshot` | MOD-TRANSACTION | test | yes | T-8-02 | INV-TRX-01 | `tests/integration/transaction/snapshot-immutable.test.ts` | 2 testes: UPDATE falha com erro explícito; DELETE falha |

## Ondas de paralelização sugeridas

**Onda A (paralelo, 3 subagents):** T-8-01, T-8-04, T-8-06
→ Schemas raiz de 3 módulos distintos, arquivos disjuntos.

**Onda B (paralelo, 3 subagents em arquivos distintos, serial por arquivo):**
- `transaction.ts`: T-8-02 → T-8-03.
- `entitlement.ts`: T-8-05.
- (refund.ts já tem triggers na T-8-06)
→ 2 subagents (transaction em série, entitlement em paralelo).

**Onda C (paralelo, 4 subagents, depende de B):** T-8-07, T-8-08, T-8-12, T-8-13
→ Compose snapshot, consolidate, create-pending/refuse, adapter DG route. Disjuntos.

**Onda D (paralelo, 3 subagents, depende de C):** T-8-09, T-8-10, T-8-14, T-8-21
→ Grant, revoke, mapper DG, schemas timeline. Disjuntos.

**Onda E (serial, depende de D):** T-8-11 — `approveTransaction` é orquestrador complexo.

**Onda F (paralelo, 2 subagents, depende de E):** T-8-15, T-8-18
→ Handler Inngest DG + domínio refund.

**Onda G (paralelo, 3 subagents, depende de F):** T-8-16, T-8-17, T-8-20
→ UI transactions, UI webhooks, Notazz outbound.

**Onda H (serial, depende de G):** T-8-19 — UI refund depende de UI transactions.

**Onda I (paralelo, 5 subagents, depende de H):** T-8-22, T-8-23, T-8-24, T-8-25, T-8-26.

## Critério de aceite do sprint (DoD)

- [ ] Todos os T-IDs em `completed`.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` verde.
- [ ] 4 E2Es (FLOW-05, 06, 07, 12) verdes.
- [ ] Teste de imutabilidade passa: nenhum path atualiza snapshot.
- [ ] Webhook DG real em staging processa venda de teste sem duplicar.
- [ ] Refund em staging: admin aprova via UI, efeitos cascateiam, snapshot permanece intacto.
- [ ] Notazz outbound dispara em staging e registra em DLQ em caso de erro.
- [ ] Review de segurança obrigatório: assinatura webhook, RLS em transaction, RBAC em refund.
- [ ] Deploy em staging verde.

## Riscos e mitigação

- **`approveTransaction` orquestra 12 passos — falha parcial corrompe estado.** Mitigação: T-8-11 roda tudo em 1 transação SQL com `SERIALIZABLE`; qualquer erro = rollback. Teste de rollback obrigatório (T-8-24).
- **FK circular transaction ↔ snapshot em migration.** Mitigação: T-8-02 usa DEFERRABLE INITIALLY DEFERRED; migration separada cria FK por último.
- **Idempotência DG quebra com reentrega fora de ordem (refund antes de purchase).** Mitigação: T-8-15 detecta ordem faltante, agenda retry, não falha silencioso.
- **Consolidação de entitlements com race (2 compras simultâneas mesmo ref).** Mitigação: T-8-09 usa `SELECT FOR UPDATE` no lookup de existing.
- **Trigger de imutabilidade bloqueia migração futura legítima.** Mitigação: trigger permite contexto `SESSION_USER=migration_admin` ou flag em função de manutenção (documentado em `BR-SNAPSHOT-IMMUTABILITY`).
- **Refund parcial com política indefinida.** Mitigação: OQ-REFUND-02; Fase 1 aceita parcial sem revogar (teste específico).
- **`issuing_legal_entity_id` mutável antes da primeira venda — guard ativado aqui.** Mitigação: T-8-01 ativa trigger completo de INV-OFFER-03 usando fixtures.

## Open Questions

- `OQ-SPRINT8-01` — Notazz inbound (receber confirmação de NF emitida) fica para Fase 2? Hoje só outbound.
- `OQ-SPRINT8-02` — DLQ precisa de retenção/expiração? Hoje persiste indefinidamente em `webhook_log`.
- `OQ-SPRINT8-03` — chargeback do DG vira refund automático ou só marca `status='chargeback'`? Hoje segunda opção (OQ-TRX-04, OQ-REFUND-04).
- `OQ-SPRINT8-04` — `transaction_item.delivery_status` enum pendente (OQ-TRX-02) — decidir antes da Sprint 9 ou viver com CHECK text.
