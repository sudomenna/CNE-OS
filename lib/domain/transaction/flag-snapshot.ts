/**
 * MOD-TRANSACTION — flagSnapshotRefunded
 *
 * docs/20-domain/11-transaction-snapshot.md §2 interfaces, §3.3 flag_history, §6 refunded
 * BR-SNAPSHOT-IMMUTABILITY: NÃO atualiza transaction_snapshot.payload
 * ADR-10: retorna Promise<void>, lança DomainError
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { eq } from 'drizzle-orm'

import type { DbTx } from '@/lib/db/client'
import {
  transactionSnapshot,
  transactionSnapshotFlagHistory,
} from '@/lib/db/schema/transaction'
import { SnapshotNotFoundError } from './errors'

// ---------------------------------------------------------------------------
// flagSnapshotRefunded
// ---------------------------------------------------------------------------

/**
 * Registra flag 'refunded' no histórico do snapshot, sem tocar o payload.
 *
 * Chamado por MOD-REFUND ao aprovar um reembolso.
 * A flag efetiva é lida em tempo de consulta via coalesce(último to_flag, 'normal').
 *
 * BR-SNAPSHOT-IMMUTABILITY: transaction_snapshot.payload é imutável após INSERT.
 * Este método NUNCA faz UPDATE em transaction_snapshot — apenas INSERT em
 * transaction_snapshot_flag_history.
 *
 * @param tx         Transação DB ativa (ADR-11)
 * @param snapshotId UUID do snapshot a sinalizar
 * @param refundId   UUID do refund que originou este flag
 * @returns          void
 * @throws           SnapshotNotFoundError se snapshotId não existir
 */
export async function flagSnapshotRefunded(
  tx: DbTx,
  snapshotId: string,
  refundId: string,
): Promise<void> {
  // Verificar existência do snapshot antes do INSERT
  const rows = await tx
    .select({ id: transactionSnapshot.id })
    .from(transactionSnapshot)
    .where(eq(transactionSnapshot.id, snapshotId))
    .limit(1)

  if (rows.length === 0) {
    throw new SnapshotNotFoundError(snapshotId)
  }

  // BR-SNAPSHOT-IMMUTABILITY: INSERT em flag_history — NUNCA UPDATE em transaction_snapshot
  // docs/20-domain/11-transaction-snapshot.md §3.3
  await tx.insert(transactionSnapshotFlagHistory).values({
    snapshotId,
    fromFlag: 'normal',
    toFlag: 'refunded',
    reason: 'refund_approved',
    causedByRefundId: refundId,
  })
}
