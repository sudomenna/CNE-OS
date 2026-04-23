# BR-REFUND: efeitos do reembolso em cascata

## Enunciado

Ao aprovar um `refund`, o sistema **deve** executar, numa **única transação SQL atômica**, a seguinte sequência ordenada de efeitos:

1. Marcar `refund` como `approved`.
2. Registrar flag `refunded` no histórico do snapshot (sem mutar `transaction_snapshot.payload`).
3. Revogar todos os `customer_entitlement` cuja `origin_transaction_id` é a transação reembolsada.
4. Transicionar `transaction.status` para `refunded` (+ status_history).
5. Reclassificar o contato (pode voltar de `customer`/`student` a `lead` se era a única compra ativa).
6. Reverter oportunidade no funil (label de `won` para `reopened`/`lost`).
7. Cancelar `subscription` vinculada (quando houver).
8. Emitir eventos de timeline correspondentes.

Qualquer falha em qualquer passo ⇒ **ROLLBACK total**; `refund` volta a `requested`; nenhum efeito persiste. Só usuários com papel `admin` ou `financial` podem aprovar refund. Ver [`ADR-02`](../90-meta/04-decision-log.md#adr-02).

## Motivação

Reembolso é a operação cross-módulo mais delicada do sistema: toca snapshot, direitos, contato, funil, cobrança e comunicação. Sem ordem e atomicidade explícitas, produz inconsistências (contato ainda como `student` sem direito ativo; funil mostrando `won` para venda reembolsada; assinatura cobrando após refund). A regra evita isso e casa com [`BR-SNAPSHOT-IMMUTABILITY`](./BR-SNAPSHOT-IMMUTABILITY.md) (nunca UPDATE em payload).

## Escopo

- Módulos afetados: [`MOD-REFUND`](../20-domain/14-refund.md), [`MOD-TRANSACTION`](../20-domain/11-transaction-snapshot.md), [`MOD-ENTITLEMENT`](../20-domain/12-entitlement.md), [`MOD-CONTACT`](../20-domain/02-contact-identity.md), [`MOD-FUNNEL`](../20-domain/08-funnel-opportunity.md), [`MOD-BILLING`](../20-domain/13-subscription-billing.md), [`MOD-TIMELINE`](../20-domain/04-timeline.md).
- Entidades: `refund`, `refund_effect_log`, `transaction`, `transaction_snapshot_flag_history`, `customer_entitlement`, `entitlement_history`, `contact`, `funnel_entry`, `subscription`, `timeline_event`.

## Enforcement

- [ ] DB constraint
- [ ] DB trigger (somente triggers auxiliares em history append-only)
- [x] Função de domínio pura (ordem canônica, orquestração)
- [x] Guard em Server Action (RBAC + abertura de transação SQL)
- [ ] Guard em UI (UI pode esconder botão, mas autoridade é server)

## Contrato TS

```ts
export async function approveRefund(
  refundId: string,
  approverUserId: string,
): Promise<Refund>;
// Throws: InsufficientRole, RefundNotRequested, EffectFailed (rollback já ocorreu).
```

Implementação em `lib/domain/refund/approve.ts`. Abre uma única `db.transaction(async (tx) => { ... })`; todas as subcalls recebem `tx`.

## Ordem canônica (SQL steps dentro da mesma transação)

```sql
BEGIN;

-- Passo 0: lock da refund row para impedir aprovação concorrente
SELECT * FROM refund WHERE id = $refund_id FOR UPDATE;

-- Passo 1: UPDATE refund
UPDATE refund SET status='approved', approved_by_user_id=$u, approved_at=now()
 WHERE id=$refund_id AND status='requested';

-- Passo 2: flag snapshot (history row, NÃO updata transaction_snapshot)
INSERT INTO transaction_snapshot_flag_history
  (snapshot_id, from_flag, to_flag, reason, caused_by_refund_id, changed_by)
VALUES
  ($snapshot_id, (SELECT COALESCE(effective_flag, 'normal') FROM ...), 'refunded', $reason, $refund_id, $u);

INSERT INTO refund_effect_log (refund_id, effect_kind, ref_id, detail)
VALUES ($refund_id, 'snapshot_flagged', $snapshot_id, '{}');

-- Passo 3: revogar entitlements
UPDATE customer_entitlement
   SET status='revoked', updated_at=now(), last_update_transaction_id=$trx_id
 WHERE origin_transaction_id=$trx_id AND status IN ('active','suspended');

INSERT INTO entitlement_status_history (entitlement_id, from_status, to_status, reason, changed_by) ...
INSERT INTO entitlement_history (entitlement_id, "from", "to", reason, caused_by_transaction_id) ...
INSERT INTO refund_effect_log (refund_id, effect_kind, ref_id) ... -- uma por entitlement

-- Passo 4: transition transaction
UPDATE transaction SET status='refunded' WHERE id=$trx_id;
INSERT INTO transaction_status_history (transaction_id, from_status, to_status, reason, changed_by) ...

-- Passo 5: reclassify contact (MOD-CONTACT.reclassify)
-- pode emitir TE-CONTACT-CLASSIFICATION-CHANGED
-- registra em refund_effect_log

-- Passo 6: revert funnel entry (MOD-FUNNEL)
UPDATE funnel_entry SET label='reopened' WHERE won_transaction_id=$trx_id AND label='won';

-- Passo 7: cancel subscription (MOD-BILLING.cancelSubscription)
UPDATE subscription SET status='cancelled', cancelled_at=now(), cancel_reason='refund'
 WHERE origin_transaction_id=$trx_id AND status IN ('trial','active','past_due');

-- Passo 8: emit timeline events (inserts em timeline_event)
INSERT INTO timeline_event (contact_id, kind, source, actor_user_id, subject_kind, subject_id, payload)
 VALUES (..., 'sale_refunded', 'MOD-REFUND', $u, 'transaction', $trx_id,
         jsonb_build_object('transaction_id', $trx_id, 'refund_id', $refund_id, 'reason', $reason));
-- análogos: entitlement_revoked, contact_classification_changed, opportunity_label_changed, subscription_cancelled.

COMMIT;
```

## RBAC

Aprovação: `role_kind IN ('admin','financial')`. Abertura e rejeição: `admin`, `financial`, `support` (configuração em [`BR-RBAC`](./BR-RBAC.md)). Guard verificado em Server Action antes de iniciar a transação SQL.

## Casos de teste (Given/When/Then)

### CT-REFUND-01 — Feliz: tudo executa atomicamente
- **Given** transação T1 `approved` com 2 entitlements ativos; contato `customer`; funnel_entry won; refund `requested`.
- **When** admin aprova.
- **Then** refund `approved`; flag history `refunded`; ambos entitlements `revoked`; T1 `refunded`; contato reclassificado (lead se T1 era única compra); funnel_entry label `reopened`; `TE-SALE-REFUNDED`, `TE-ENTITLEMENT-REVOKED` (x2), `TE-OPPORTUNITY-LABEL-CHANGED`, `TE-CONTACT-CLASSIFICATION-CHANGED` emitidos. `refund_effect_log` lista todos os efeitos.

### CT-REFUND-02 — Rollback em falha do passo 7
- **Given** mesmo cenário + subscription com erro provocado em `cancelSubscription` (ex.: provider offline).
- **When** aprovação.
- **Then** transação SQL rollback: refund volta a `requested`, snapshot sem flag refunded, entitlements `active`, transação T1 `approved`. Erro propaga para UI. Logs mostram qual passo falhou.

### CT-REFUND-03 — RBAC bloqueia aprovação
- **Given** usuário com papel `commercial`.
- **When** tenta aprovar.
- **Then** `InsufficientRole`; refund inalterado; sem transação SQL aberta.

### CT-REFUND-04 — Snapshot permanece imutável
- **Given** snapshot do refund aprovado.
- **When** inspeciona `transaction_snapshot` após.
- **Then** `payload` idêntico ao original; linha `transaction_snapshot_flag_history` com `to_flag='refunded'`.

### CT-REFUND-05 — Recompra habilitada após refund
- **Given** refund aprovado.
- **When** contato tenta comprar a mesma oferta novamente.
- **Then** INSERT permitido (transação anterior agora `refunded`, fora do índice parcial único). Ver [`BR-OFFER-UNIQUENESS`](./BR-OFFER-UNIQUENESS.md).

### CT-REFUND-06 — Subscription cancelada preserva direito até period_end (regra de subscription, observada aqui)
- **Given** assinatura active com `current_period_end=futuro`; refund aprovado.
- **When** aprovação cancela subscription.
- **Then** subscription `cancelled`, `cancelled_at=now()`. (Direitos já foram revogados no Passo 3 pela regra de refund — ver OQ-BR-REFUND-02.)

### CT-REFUND-07 — Rejeição não toca nada
- **Given** refund `requested`.
- **When** admin rejeita.
- **Then** refund `rejected`, `rejected_at=now()`; nenhum outro efeito.

## Rastreabilidade

- Teste esperado: `tests/integration/refund/refund-approve.test.ts` (cenários happy + rollback simulado em cada passo).
- Referenciada em: [`MOD-REFUND §7`](../20-domain/14-refund.md#7-efeitos-colaterais-ao-aprovar-ordem-canônica), [`BR-SNAPSHOT-IMMUTABILITY`](./BR-SNAPSHOT-IMMUTABILITY.md), [`BR-OFFER-UNIQUENESS`](./BR-OFFER-UNIQUENESS.md), [`BR-CONTACT-CLASSIFICATION`](./BR-CONTACT-CLASSIFICATION.md), [`BR-SUBSCRIPTION`](./BR-SUBSCRIPTION.md).
- ADR: [`ADR-02`](../90-meta/04-decision-log.md#adr-02).
- PRD origem: §10.3 (implicitamente, exceção da compra única) + `snazzy-creek-review.md` §1 (decisão formal).

## Open Questions

- `OQ-BR-REFUND-01` — refund **parcial** (amount < total) gera mesma cascata? Proposta Fase 1: não revoga direitos, apenas registra financeiro.
- `OQ-BR-REFUND-02` — refund cancela subscription imediatamente (como posto) ou no fim do `current_period_end` como o cancelamento manual? Proposta: imediatamente (refund é disputa, não saída natural).
- `OQ-BR-REFUND-03` — tag `auto_tag` de benefício é removida do contato no refund? Hoje não; decisão de negócio.
- `OQ-BR-REFUND-04` — reversão no funil: label `reopened` existe no enum `funnel_opportunity_label`? Hoje enum tem `open`, `negotiating`, `concluded`, `won`, `lost`. **Não tem `reopened`** — BR referencia comportamento que exige extensão do enum (tarefa serial) ou uso de `open` como proxy.
- `OQ-BR-REFUND-05` — chargeback dispara fluxo de refund automaticamente? Proposta: sim, como refund "system-opened" sem RBAC humano.
