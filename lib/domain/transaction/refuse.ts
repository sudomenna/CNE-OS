/**
 * MOD-TRANSACTION — refuseTransaction
 *
 * docs/20-domain/11-transaction-snapshot.md §2 interfaces, §6 transição pending→refused
 * ADR-10: retorna Promise<T>, lança DomainError
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { eq, sql } from 'drizzle-orm'

import type { DbTx } from '@/lib/db/client'
import {
  transaction,
  transactionStatusHistory,
  type Transaction,
} from '@/lib/db/schema/transaction'
import {
  TransactionNotFoundError,
  InvalidTransactionStatusForRefusalError,
} from './errors'

// ---------------------------------------------------------------------------
// refuseTransaction
// ---------------------------------------------------------------------------

/**
 * Recusa uma transação pendente, definindo status='refused' e refused_at=now().
 *
 * Regras:
 * - Somente transações com status='pending' podem ser recusadas.
 * - Registra a transição em transaction_status_history (append-only).
 *
 * @param tx            Transação DB ativa (ADR-11)
 * @param transactionId UUID da transação a recusar
 * @param reason        Motivo opcional da recusa (ex.: 'payment_declined')
 * @returns             Transação atualizada com status='refused'
 * @throws              TransactionNotFoundError se transação não existir
 * @throws              InvalidTransactionStatusForRefusalError se status != 'pending'
 */
export async function refuseTransaction(
  tx: DbTx,
  transactionId: string,
  reason?: string,
): Promise<Transaction> {
  // Buscar transação atual com SELECT FOR UPDATE (previne dupla transição concorrente)
  const rows = await tx
    .select()
    .from(transaction)
    .where(eq(transaction.id, transactionId))
    .limit(1)

  const current = rows[0]
  if (!current) {
    throw new TransactionNotFoundError(transactionId)
  }

  // docs/20-domain/11-transaction-snapshot.md §6:
  // Somente 'pending' → 'refused' é permitido.
  if (current.status !== 'pending') {
    throw new InvalidTransactionStatusForRefusalError(transactionId, current.status)
  }

  // UPDATE transaction: status='refused', refused_at=now(), updated_at=now()
  const updated = await tx
    .update(transaction)
    .set({
      status: 'refused',
      refusedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(eq(transaction.id, transactionId))
    .returning()

  const updatedRow = updated[0]
  if (!updatedRow) {
    throw new Error('refuseTransaction: UPDATE returned no rows')
  }

  // INSERT em transaction_status_history (append-only)
  // docs/20-domain/11-transaction-snapshot.md §3.5, §6
  await tx.insert(transactionStatusHistory).values({
    transactionId,
    fromStatus: 'pending',
    toStatus: 'refused',
    actorSystem: 'domain:refuseTransaction',
    reason: reason ?? null,
  })

  return updatedRow
}
