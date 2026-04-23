# Critérios de aceite consolidados por sprint (DoD)

Referência única de **Definition of Done** por sprint. Cada item é verificável via comando, teste nomeado ou inspeção em staging. Se algum item falha, sprint **não** fecha.

## Critérios globais aplicáveis a TODOS os sprints

Obrigatórios antes de fechar qualquer sprint:

- [ ] Todos os T-IDs listados na tabela do sprint em status `completed`.
- [ ] `pnpm typecheck` sem erro.
- [ ] `pnpm lint` sem erro.
- [ ] `pnpm test` (vitest unit + integration) verde.
- [ ] `pnpm test:e2e` dos fluxos críticos do sprint verde.
- [ ] CI GitHub Actions verde no merge para `main`.
- [ ] Deploy em staging verde e smoke tests manuais passando.
- [ ] Nenhuma OQ nova **bloqueante** (P0) — OQs existentes listadas no sprint são aceitáveis se classificadas P1/P2.
- [ ] Review de segurança aprovado quando o sprint toca: auth, RBAC, RLS, webhooks, reembolso, snapshot.
- [ ] Zero `console.log` em código de produção; logs via `lib/logger` (Axiom).
- [ ] Zero TODOs `@critical` ou `@security` no diff.

---

## Sprint 0 — Foundations

- [ ] `pnpm dev` sobe o app sem erro.
- [ ] Login com email/senha + magic link funciona.
- [ ] TOTP 2FA configurável e requerido para papéis admin/financial.
- [ ] Admin seed cria marca + CNPJ + convida usuário via UI.
- [ ] RLS bloqueia atendente da marca A de ver dados da marca B em `SELECT contact` (teste integração com 2 JWTs).
- [ ] `emitTimelineEvent` valida payload por `kind` e bloqueia `kind` desconhecido.
- [ ] Triggers `audit_log`, `timeline_event`, `webhook_log` rejeitam UPDATE e DELETE.
- [ ] `requireSession()` e `requirePermission('x')` lançam 401/403 quando aplicável; 3 testes passam.
- [ ] CI roda typecheck + lint + test em PR.
- [ ] Sentry recebe erro propositalmente lançado em Server Action.

---

## Sprint 1-2 — CRM Core

- [ ] Os 8 casos da tabela de decisão `BR-IDENTITY` têm teste nomeado correspondente em `tests/unit/contact/identity.test.ts`.
- [ ] `resolveContactIdentity` não cria duplicata quando CPF matches mesmo com telefone/e-mail distintos.
- [ ] Normalização: telefone `(11) 98888-7777` → `+5511988887777`; e-mail com maiúsculas vira lowercase+trim; CPF sem máscara com 11 dígitos.
- [ ] Índice `uq_contact_cpf` barra 2º contato com mesmo CPF (exceto mergeados/deletados).
- [ ] Trigger append-only rejeita UPDATE em `contact_status_history`.
- [ ] `mergeContacts` move transações, conversas, tickets, tags do secundário; secundário recebe `merged_into_id`.
- [ ] `undoMerge` restaura FKs e zera `merged_into_id`; 2º undo falha por `uq_contact_merge_undo_merge`.
- [ ] UI `/contacts/[id]` mostra timeline consolidada (principal + mergeados).
- [ ] RBAC: commercial tentando `undoMerge` recebe 403; admin consegue.
- [ ] E2E `identity-resolution.spec.ts` e `merge-manual.spec.ts` verdes.
- [ ] Classificação: compra de produto `kind='course'` eleva contato para `student` e grava history.

---

## Sprint 3-4 — Inbox + Tickets

- [ ] Mensagem WhatsApp inbound cria conversa + emite `TE-CONVERSATION-OPENED` + `TE-MESSAGE-INBOUND`.
- [ ] Mensagem inbound em conversa `closed` reabre (nova linha `conversation_status_history`).
- [ ] Mensagem outbound em conversa `closed` é rejeitada.
- [ ] Reentrega 3x do mesmo `external_message_id` em WhatsApp/Instagram/e-mail gera 1 única `message`.
- [ ] Realtime: nova mensagem aparece na UI em <2s sem refresh.
- [ ] Push desktop dispara ao receber atribuição.
- [ ] Ticket aberto a partir de conversa herda `brand_id` e `origin_conversation_id`.
- [ ] Transição ticket `resolved → waiting_reply` é rejeitada.
- [ ] Ticket reaberto mantém histórico anterior.
- [ ] Contato com 3 tickets abertos simultâneos não viola unicidade.
- [ ] E2E FLOW-02 e FLOW-13 verdes.

---

## Sprint 5 — Marketing + Funnels

- [ ] `generateUtm(ctx)` determinista: mesmos inputs → mesmo output.
- [ ] `uq_trackable_link_slug` globalmente único.
- [ ] Rota `/go/[slug]` redireciona 302 e emite `TE-CAMPAIGN-CLICK` assíncrono.
- [ ] `enterFunnel` idempotente: 2ª chamada (mesmo contact, mesmo funil) retorna a existente, não duplica.
- [ ] `uq_funnel_entry_active` barra 2ª oportunidade ativa em `(contact, funnel)`.
- [ ] `markWon(entry, null)` rejeitado; com `transaction_id` preenche `conversion_*`.
- [ ] `markLost(entry, '')` rejeitado — exige motivo.
- [ ] Kanban drag-drop persiste estágio e grava `funnel_entry_stage_history`; erro reverte UI.
- [ ] Score incrementa via `funnel_score_rule` e registra em `funnel_entry_score_history`.
- [ ] Contato pode ter oportunidade ativa em F1 e F2 simultaneamente.
- [ ] E2E FLOW-14 verde.

---

## Sprint 6-7 — Offer Engine

- [ ] Oferta com 5 condições + 3 grupos aninhados + 4 kinds de regra é criada via UI sem reload.
- [ ] `uq_offer_condition_default_per_offer` barra 2 defaults ativos na mesma oferta.
- [ ] `uq_offer_rule_group_root` barra 2º grupo raiz por condição.
- [ ] CHECK `ck_offer_condition_item_ref_exclusive` barra item inconsistente.
- [ ] CHECK `method='installments' AND installments=1` é rejeitado.
- [ ] `selectCondition` aplica priority → advantage_score → created_at; conflito retorna `kind='conflict'` com lista.
- [ ] `evaluateEligibility` suporta AND/OR aninhado e todos os 6 kinds de regra.
- [ ] `incrementSalesCounter` monotônico sob 10 conexões simultâneas (aceita excesso por ADR-07).
- [ ] Simulador retorna resultado correto para todos os 12 contextos canônicos.
- [ ] Tentativa de alterar `issuing_legal_entity_id` após fixture de "venda aprovada" é rejeitada.
- [ ] E2E FLOW-04 verde em 6 cenários.
- [ ] `selectCondition` coverage >95%.

---

## Sprint 8 — Snapshot + Digital Guru + Entitlement + Refund

- [ ] `approveTransaction` executa 12 passos em 1 única transação SQL; falha = rollback total (teste dedicado).
- [ ] UPDATE em `transaction_snapshot` retorna exceção do trigger.
- [ ] DELETE em `transaction_snapshot` retorna exceção do trigger.
- [ ] Snapshot congela `offer.name`: alteração futura em `offer` não muda `snapshot.payload.offer.name`.
- [ ] Webhook DG com assinatura inválida retorna 401.
- [ ] Mesmo `external_event_id` processado 3x = 1 transação approved.
- [ ] `consolidate(existing, incoming)` cobre 8 cenários Given/When/Then.
- [ ] Índice `uq_customer_entitlement_active_per_ref` barra 2º ativo mesmo (contact, brand, ref_kind, ref_id).
- [ ] Refund aprovado: snapshot flag em history, direitos `revoked`, contato reclassificado, oportunidade revertida, assinatura stub cancelada.
- [ ] Refund aprovado: `transaction_snapshot.payload` permanece byte-exato inalterado (hash antes/depois igual).
- [ ] Refund aprovado libera recompra da mesma oferta (BR-OFFER-UNIQUENESS relaxa).
- [ ] Commercial tentando `approveRefund` recebe 403.
- [ ] `uq_refund_active_per_transaction` parcial barra 2º refund ativo.
- [ ] DLQ UI reenfileira evento DG sem duplicar transação.
- [ ] Notazz outbound é idempotente e falha para DLQ.
- [ ] E2E FLOW-05, FLOW-06, FLOW-07, FLOW-12 verdes.
- [ ] Review de segurança aprovado.

---

## Sprint 9 — Subscriptions + Parcelamento + Inadimplência

- [ ] CHECK `ck_installment_parent_exclusive` barra installment com ambos `transaction_id` e `subscription_id`.
- [ ] Cron `installment-sweep` marca parcelas `due_at < now AND status='scheduled'` como `overdue`.
- [ ] Dunning D+3/D+7/D+15 respeitado (teste integração com time-mocking).
- [ ] Após D+15 sem pagamento, assinatura vira `cancelled` com `reason='dunning_exhausted'`.
- [ ] `cancelSubscription` preserva entitlements ativos até `current_period_end` (INV-BILL-07).
- [ ] `uq_installment_external` barra duplicação de parcela via webhook.
- [ ] Dashboard de inadimplência carrega <2s com 1000 assinaturas past_due.
- [ ] Export CSV respeita RLS.
- [ ] Commercial tentando cancelar assinatura recebe 403.
- [ ] E2E FLOW-11 verde em 5 cenários.

---

## Sprint 10 — Analytics

- [ ] Todas as views e MVs passam teste de isolamento multi-marca com 2 JWTs distintos.
- [ ] Cron `analytics-refresh-hourly` roda e loga duração.
- [ ] REFRESH MATERIALIZED VIEW CONCURRENTLY não bloqueia leitura.
- [ ] Cada dashboard (`/analytics/*`) carrega <3s em staging com seed realista.
- [ ] `<GlobalFilters />` persiste estado em URL.
- [ ] Export CSV/XLSX disponível em cada dashboard.
- [ ] E2E analytics-smoke verde.

---

## Sprint 11 — Automações

- [ ] `evalCondition` cobre 15 testes (todos os operadores).
- [ ] `dispatchTrigger` calcula `idempotency_key` determinístico.
- [ ] `uq_automation_execution_idem` barra 2ª execução do mesmo evento.
- [ ] Ação falha 5x → status `failed` + DLQ.
- [ ] DLQ reenfileirável via UI cria nova execução.
- [ ] Hook em `emit.ts` NÃO bloqueia emissor (dispatch assíncrono via Inngest).
- [ ] Loop infinito bloqueado por guard de profundidade máxima.
- [ ] Editor drag-drop em react-flow permite criar fluxo `new_message → condition has_tag → open_ticket` em 2 minutos.
- [ ] Detalhe de execução mostra log por nó (entered/skipped/ok/failed).
- [ ] Cada ação Fase 1 tem 1 teste Given/When/Then dedicado.
- [ ] E2E automation-dispatch verde.
- [ ] Idempotência provada com reentrega 3x.

---

## Observações

1. Qualquer quebra em DoD global bloqueia o sprint inteiro.
2. Reviews de segurança são obrigatórios nos Sprints 0, 8, e 11 (toca auth/RBAC/RLS/webhooks/automação).
3. Deploy em staging é pré-condição de fechamento; produção é decisão separada.
4. Testes de integração que precisam de DB real usam ambiente isolado Supabase test project.
5. Critério "coverage >X%" aplica-se apenas a funções puras de domínio (não a UI nem a adapters).
