# BR-SNAPSHOT-IMMUTABILITY: snapshot de transação é append-only

## Enunciado

A tabela `transaction_snapshot` é **append-only**. Nenhuma coluna da linha (especialmente `payload jsonb`) pode ser alterada ou removida após a inserção. Qualquer mudança de estado associada ao snapshot (ex.: marcar como `refunded` ou `disputed`) é registrada em uma tabela separada, `transaction_snapshot_flag_history`, nunca por UPDATE.

## Motivação

- Preservar o contrato comercial da venda como ele foi no momento: oferta, condição, itens, opção de pagamento, CNPJ emissor, regras avaliadas.
- Garantir que mudanças futuras em catálogo/oferta **não** afetem vendas passadas (regra transversal §10.4 do PRD).
- Viabilizar auditoria fiscal e conciliação de reembolsos com dados exatos do momento.
- Impedir classes inteiras de bugs (ex.: corrigir preço retroativamente).

Decisão arquitetural: [`ADR-05`](../90-meta/04-decision-log.md#adr-05).

## Escopo

- Módulo: [`MOD-TRANSACTION`](../20-domain/11-transaction-snapshot.md).
- Entidades: `transaction_snapshot`, `transaction_snapshot_flag_history`.

## Enforcement

- [x] DB trigger (`trg_transaction_snapshot_immutable` bloqueia UPDATE e DELETE)
- [x] DB constraint (UNIQUE em `transaction_id`)
- [ ] Função de domínio pura
- [x] Guard em Server Action (não há rota que faça UPDATE; flag é via INSERT em history)
- [ ] Guard em UI

## Trigger de imutabilidade (SQL canônico)

```sql
CREATE OR REPLACE FUNCTION block_transaction_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transaction_snapshot is append-only (BR-SNAPSHOT-IMMUTABILITY)'
    USING ERRCODE = 'feature_not_supported';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transaction_snapshot_block_update
  BEFORE UPDATE ON transaction_snapshot
  FOR EACH ROW EXECUTE FUNCTION block_transaction_snapshot_mutation();

CREATE TRIGGER trg_transaction_snapshot_block_delete
  BEFORE DELETE ON transaction_snapshot
  FOR EACH ROW EXECUTE FUNCTION block_transaction_snapshot_mutation();
```

Aplicar o mesmo padrão em: `transaction_snapshot_flag_history`, `entitlement_history`, `entitlement_status_history`, `transaction_status_history`, `refund_effect_log`, `subscription_status_history`, `installment_status_history`, `offer_status_history`, `offer_condition_priority_history`, `audit_log`, `webhook_log`, `timeline_event` (conforme [`02-db-schema-conventions.md §6, §8`](../30-contracts/02-db-schema-conventions.md)).

## Mutação controlada de `flag`

A coluna `transaction_snapshot.flag` existe mas **não muda** após INSERT (triggers bloqueiam UPDATE). A flag efetiva em tempo de leitura é:

```sql
-- Valor efetivo da flag
SELECT COALESCE(
  (SELECT to_flag
     FROM transaction_snapshot_flag_history
     WHERE snapshot_id = $1
     ORDER BY created_at DESC
     LIMIT 1),
  ts.flag
) AS effective_flag
FROM transaction_snapshot ts
WHERE ts.id = $1;
```

Camada de domínio expõe helper:

```ts
export async function getEffectiveSnapshotFlag(
  snapshotId: string,
): Promise<'normal' | 'refunded' | 'disputed'>;
```

## Contrato TS (flagar sem mutar)

```ts
// Chamado por MOD-REFUND ao aprovar, e por integração quando recebe chargeback.
export async function flagSnapshot(
  snapshotId: string,
  toFlag: 'refunded' | 'disputed',
  reason: string,
  causedByRefundId?: string,
  changedBy?: string,
  tx?: DrizzleTx,
): Promise<void>; // INSERT em transaction_snapshot_flag_history
```

## Casos de teste (Given/When/Then)

### CT-SNAP-01 — INSERT OK
- **Given** transação `pending` em aprovação; `composeSnapshot` produz payload válido.
- **When** `INSERT INTO transaction_snapshot`.
- **Then** sucesso; linha persistida.

### CT-SNAP-02 — UPDATE falha
- **Given** `transaction_snapshot` existente.
- **When** `UPDATE transaction_snapshot SET payload = ... WHERE id=...`.
- **Then** exceção `feature_not_supported` com mensagem da BR.

### CT-SNAP-03 — DELETE falha
- **Given** snapshot existente.
- **When** `DELETE FROM transaction_snapshot WHERE id=...`.
- **Then** exceção idem.

### CT-SNAP-04 — flag via history mantém payload intacto
- **Given** snapshot `flag='normal'`.
- **When** refund aprovado chama `flagSnapshot(id, 'refunded', 'customer_requested')`.
- **Then** nova linha em `transaction_snapshot_flag_history (from_flag='normal', to_flag='refunded')`; coluna `transaction_snapshot.flag` **permanece** `normal`; `payload` idêntico ao original; `getEffectiveSnapshotFlag` retorna `refunded`.

### CT-SNAP-05 — tentativa de UPDATE de flag via ORM bate no trigger
- **Given** código buggy faz `UPDATE transaction_snapshot SET flag='refunded' WHERE id=...`.
- **When** executado.
- **Then** trigger bloqueia; erro no log aponta para BR-SNAPSHOT-IMMUTABILITY; CI/test detecta.

### CT-SNAP-06 — history também é append-only
- **Given** linha em `transaction_snapshot_flag_history`.
- **When** tentativa de UPDATE ou DELETE.
- **Then** trigger análogo bloqueia.

## Rastreabilidade

- Teste esperado: `tests/integration/transaction/snapshot-immutability.test.ts`.
- Referenciada em: [`MOD-TRANSACTION`](../20-domain/11-transaction-snapshot.md#5-invariantes) (INV-TRX-01), [`BR-REFUND`](./BR-REFUND.md), [`BR-AUDIT`](./BR-AUDIT.md).
- PRD origem: §9.10.1, §10.4.
- ADR: [`ADR-05`](../90-meta/04-decision-log.md#adr-05).

## Open Questions

- `OQ-BR-SNAP-01` — correções de payload (ex.: preço errado registrado) exigem **nova transação** corretora + snapshot novo, nunca UPDATE. Formalizar fluxo de "correção contábil"?
- `OQ-BR-SNAP-02` — purga de dados (LGPD Fase 2) em snapshot: como atender sem quebrar imutabilidade? Proposta: marcar anonimização via history, manter payload criptografado. Fora do escopo Fase 1.
- `OQ-BR-SNAP-03` — índice GIN em `transaction_snapshot.payload` é necessário para queries analíticas? Fase 2.
