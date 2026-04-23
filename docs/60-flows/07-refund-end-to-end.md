# FLOW-07: Reembolso end-to-end (crítico)

## Gatilho / pré-condições

Solicitação de reembolso criada por usuário com papel `admin`, `financial` ou `support`:

- manual via UI de transação;
- automático (system-opened) por `chargeback` do provedor (proposta `OQ-BR-REFUND-05`);
- via ticket `category='refund'` resolvido com ação de refund.

Pré-condições: `transaction.status='approved'`; snapshot existente; solicitante com 2FA recentemente verificado para aprovar — [`BR-RBAC`](../50-business-rules/BR-RBAC.md).

## Atores

- humano: solicitante (`support`/`financial`/`admin`) e aprovador (`admin`/`financial`).
- sistema: `MOD-REFUND` (orquestra), `MOD-TRANSACTION`, `MOD-ENTITLEMENT`, `MOD-CONTACT`, `MOD-FUNNEL`, `MOD-BILLING`, `MOD-TIMELINE`.
- integração: Digital Guru (notificação de estorno financeiro ao provedor — assíncrono, fora da transação SQL).

## Passos

Fluxo dividido em **abertura** (sem efeito cascata) e **aprovação** (cascata atômica).

### Abertura

1. Operador abre formulário de refund em `transaction` aprovada.
2. `MOD-RBAC.can(user, 'refund.open')` — obrigatório.
3. INSERT `refund` com `status='requested'`, `reason`, `amount` (total; parcial é `OQ-BR-REFUND-01`), `requested_by_user_id`.
4. Nenhum efeito cascata; `transaction` permanece `approved`. Notifica aprovadores.

### Aprovação (ordem canônica de 8 passos da [`BR-REFUND`](../50-business-rules/BR-REFUND.md))

Tudo dentro de `db.transaction(async (tx) => { ... })`:

0. **Lock** — `SELECT * FROM refund WHERE id=$ FOR UPDATE` (impede aprovação concorrente).
1. **Passo 1 — marcar refund** — `UPDATE refund SET status='approved', approved_by_user_id=$u, approved_at=now() WHERE id=$ AND status='requested'`. Se 0 linhas afetadas ⇒ `RefundNotRequested`.
2. **Passo 2 — flag snapshot (history, sem UPDATE)** — INSERT em `transaction_snapshot_flag_history(snapshot_id, from_flag, to_flag='refunded', reason, caused_by_refund_id, changed_by)`; INSERT em `refund_effect_log(refund_id, effect_kind='snapshot_flagged', ref_id=snapshot_id)`. `transaction_snapshot.payload` **permanece intocável** — [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md).
3. **Passo 3 — revogar entitlements** — `UPDATE customer_entitlement SET status='revoked', last_update_transaction_id=$trx WHERE origin_transaction_id=$trx AND status IN ('active','suspended')`. INSERT `entitlement_status_history` e `entitlement_history` por linha; INSERT `refund_effect_log(effect_kind='entitlement_revoked', ref_id=entitlement_id)` por linha.
4. **Passo 4 — transicionar transação** — `UPDATE transaction SET status='refunded' WHERE id=$trx`; INSERT `transaction_status_history(approved→refunded, reason, changed_by)`.
5. **Passo 5 — reclassificar contato** — `MOD-CONTACT.reclassify(contactId)` ([`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md)): se era a única venda ativa, pode voltar a `lead`/`paid_lead`; INSERT `contact_status_history`; `TE-CONTACT-CLASSIFICATION-CHANGED` se mudou.
6. **Passo 6 — reverter oportunidade** — `UPDATE funnel_entry SET label='reopened' WHERE transaction_id=$trx AND label='won'` (ou `open` por proxy — `OQ-BR-REFUND-04`); `TE-OPPORTUNITY-LABEL-CHANGED`.
7. **Passo 7 — cancelar assinatura** (se houver) — `UPDATE subscription SET status='cancelled', cancelled_at=now(), cancel_reason='refund' WHERE origin_transaction_id=$trx AND status IN ('trial','active','past_due')`; INSERT `subscription_status_history`. Refund cancela imediatamente (`OQ-BR-REFUND-02` — decisão Fase 1).
8. **Passo 8 — emitir eventos timeline** (na mesma transação SQL):
   - `TE-SALE-REFUNDED`;
   - `TE-ENTITLEMENT-REVOKED` (x N);
   - `TE-CONTACT-CLASSIFICATION-CHANGED` (se aplicável);
   - `TE-OPPORTUNITY-LABEL-CHANGED` (se aplicável);
   - `TE-SUBSCRIPTION-CANCELLED` (se aplicável).

9. **COMMIT.** Fora da transação: enfileirar notificação financeira ao provedor (Inngest + idempotência outbound).

Qualquer falha em qualquer passo ⇒ **ROLLBACK total**. `refund.status` volta a `requested` (porque UPDATE do passo 1 foi revertido); nenhum efeito persistiu. Erro propagado para UI.

### Rejeição

- `admin`/`financial` rejeita: `UPDATE refund SET status='rejected', rejected_at=now()`; zero efeitos cascata.

## Pós-condições (aprovação bem-sucedida)

- `refund.status='approved'` com aprovador registrado.
- `transaction.status='refunded'`, `snapshot.payload` intocável, flag efetiva `refunded`.
- Entitlements afetados `status='revoked'`.
- `contact.classification` recalculada.
- `funnel_entry` com label `reopened` (ou proxy `open`).
- `subscription` cancelada (quando existia).
- `refund_effect_log` lista todos os efeitos para auditoria.
- Recompra habilitada (`transaction` sai do índice parcial único — [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md)).

## Caminhos de erro

| Código | Condição | Ação | Recuperação |
|---|---|---|---|
| E-01 | `RefundNotRequested` (já aprovado/rejeitado) | abort antes dos efeitos | — |
| E-02 | `InsufficientRole` (2FA ausente ou papel sem permissão) | 403; nenhum efeito | autenticar |
| E-03 | falha no passo 7 (provedor de subscription offline) | ROLLBACK total; tudo como antes; alerta | retry manual ou aguardar provedor |
| E-04 | aprovação concorrente por 2 admins | `FOR UPDATE` serializa; segunda recebe `RefundNotRequested` | — |
| E-05 | snapshot flag already `refunded` em history (idempotência) | passo 2 detecta duplicata; aborta sem commit | revisar causa |
| E-06 | refund parcial (`amount < transaction.amount`) | Fase 1: rejeita — proposta `OQ-BR-REFUND-01`; só financial registra | aguardar Fase 2 |

## Regras referenciadas

- [`BR-REFUND`](../50-business-rules/BR-REFUND.md) — ordem canônica.
- [`BR-SNAPSHOT-IMMUTABILITY`](../50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md).
- [`BR-OFFER-UNIQUENESS`](../50-business-rules/BR-OFFER-UNIQUENESS.md) (habilita recompra).
- [`BR-CONTACT-CLASSIFICATION`](../50-business-rules/BR-CONTACT-CLASSIFICATION.md).
- [`BR-SUBSCRIPTION`](../50-business-rules/BR-SUBSCRIPTION.md).
- [`BR-RBAC`](../50-business-rules/BR-RBAC.md).
- [`BR-AUDIT`](../50-business-rules/BR-AUDIT.md).
- [`BR-TIMELINE`](../50-business-rules/BR-TIMELINE.md).

## Eventos emitidos

Ordem:

1. `TE-SALE-REFUNDED`
2. `TE-ENTITLEMENT-REVOKED` (x N)
3. `TE-CONTACT-CLASSIFICATION-CHANGED` (opcional)
4. `TE-OPPORTUNITY-LABEL-CHANGED` (opcional)
5. `TE-SUBSCRIPTION-CANCELLED` (opcional)

## Observabilidade

- Métricas:
  - `refund_requested_total{reason}`;
  - `refund_approved_total`;
  - `refund_rejected_total`;
  - `refund_cascade_rollback_total{failing_step}`;
  - `refund_latency_ms` (abertura → aprovação).
- Logs (`correlation_id`, `refund_id`, `transaction_id`, `contact_id`, `step`, `flow='FLOW-07'`).
- Alertas:
  - PagerDuty: `refund_cascade_rollback_total` > 0 em janela de 15 min (refund é crítico).
  - Sentry: `InsufficientRole` repetido do mesmo usuário (tentativa indevida).
  - Axiom: dashboard de refunds por marca/motivo/dia; `refund rate` por oferta.

## Casos de teste E2E obrigatórios

1. **happy-path-cascata-atomica**
   - Given: T1 aprovada; 2 entitlements ativos; contato `customer`; funnel_entry `won`; subscription ativa; refund `requested`.
   - When: admin (2FA fresh) aprova.
   - Then: refund `approved`; flag_history `refunded`; 2 entitlements `revoked`; T1 `refunded`; contato → `lead`; funnel_entry `reopened`; subscription `cancelled`; 5+ eventos; `refund_effect_log` completo.

2. **rollback-falha-no-passo-7**
   - Given: mesmo setup; mock cancelSubscription lança erro.
   - When: aprovação.
   - Then: ROLLBACK total; refund `requested` novamente; snapshot sem flag refunded; entitlements ativos; T1 approved; funnel won; alerta disparado.

3. **rbac-commercial-bloqueado**
   - Given: `user.role='commercial'`.
   - When: tenta aprovar.
   - Then: 403 `InsufficientRole`; nenhum efeito.

4. **2fa-stale-bloqueia**
   - Given: admin sem 2FA recentemente verificado.
   - When: aprova.
   - Then: 403; nenhum efeito.

5. **snapshot-payload-imutavel**
   - Given: refund aprovado.
   - When: inspeciona `transaction_snapshot.payload`.
   - Then: idêntico ao original; apenas history registra mudança de flag.

6. **recompra-habilitada-apos-refund**
   - Given: T1 (O1) refundada.
   - When: nova compra (C, O1).
   - Then: INSERT permitido; `uq_transaction_unique_offer_per_contact` não cobre T1 (agora `refunded`).

7. **rejeicao-nao-toca-nada**
   - Given: refund `requested`.
   - When: admin rejeita.
   - Then: `refund.status='rejected', rejected_at`; nenhum outro efeito.

8. **aprovacao-concorrente-segunda-falha**
   - Given: 2 admins abrem UI simultaneamente.
   - When: ambos clicam aprovar.
   - Then: primeiro obtém lock + commit; segundo recebe `RefundNotRequested`.

## Open Questions

- `OQ-FLOW-07-01` — refund parcial (amount < total) — Fase 2. Proposta: não dispara revogação de entitlement, só registra financeiro.
- `OQ-FLOW-07-02` — notificação ao provedor (Digital Guru) falha após commit: como reprocessar sem reabrir a cascata? Proposta: job `notifyProviderRefund` com retry, idempotente.
- `OQ-FLOW-07-03` — tag `auto_tag` aplicada no grant é removida no refund? Cruz com `OQ-BR-REFUND-03`. Fase 1: não.
- `OQ-FLOW-07-04` — label `reopened` não existe no enum atual (`OQ-BR-REFUND-04`). Bloqueia teste #1 exato — usar `open` como proxy até enum ser estendido.
