/**
 * MOD-TRANSACTION — createPendingTransaction
 *
 * docs/20-domain/11-transaction-snapshot.md §2 interfaces, §6 estado pending
 * BR-OFFER-UNIQUENESS: verifica unicidade antes do INSERT
 * ADR-10: retorna Promise<T>, lança DomainError
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { and, eq, sql } from 'drizzle-orm'

import type { DbTx } from '@/lib/db/client'
import { transaction, type Transaction } from '@/lib/db/schema/transaction'
import { DuplicateOfferPurchaseError } from './errors'

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type CreateTransactionInput = {
  contactId: string
  brandId: string
  offerId: string
  offerConditionId: string
  offerPaymentOptionId: string
  /** numeric(12,2) como string — ex.: "1500.00" */
  amount: string
  currency?: string
  externalProvider?: string | null
  externalId?: string | null
  externalFee?: string | null
}

// ---------------------------------------------------------------------------
// createPendingTransaction
// ---------------------------------------------------------------------------

/**
 * Cria uma nova transação com status='pending'.
 *
 * Verifica BR-OFFER-UNIQUENESS antes do INSERT: se o contato já possui uma
 * transação 'approved' para a mesma oferta, lança DuplicateOfferPurchaseError.
 *
 * @param tx    Transação DB ativa (ADR-11)
 * @param input Dados da transação a criar
 * @returns     Transação recém-criada
 * @throws      DuplicateOfferPurchaseError se BR-OFFER-UNIQUENESS seria violada
 */
export async function createPendingTransaction(
  tx: DbTx,
  input: CreateTransactionInput,
): Promise<Transaction> {
  // BR-OFFER-UNIQUENESS: verificar se já existe transação approved para (contact, offer).
  // O índice parcial uq_transaction_unique_offer_per_contact cobre status='approved'.
  // Este check dá UX melhor antes de tentar o INSERT.
  const existing = await tx
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.contactId, input.contactId),
        eq(transaction.offerId, input.offerId),
        sql`${transaction.status} = 'approved'`,
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    // BR-OFFER-UNIQUENESS: contato já tem transação approved para esta oferta.
    throw new DuplicateOfferPurchaseError(input.contactId, input.offerId)
  }

  // INSERT com status='pending' (default do schema)
  const rows = await tx
    .insert(transaction)
    .values({
      contactId: input.contactId,
      brandId: input.brandId,
      offerId: input.offerId,
      offerConditionId: input.offerConditionId,
      offerPaymentOptionId: input.offerPaymentOptionId,
      amount: input.amount,
      currency: input.currency ?? 'BRL',
      externalProvider: (input.externalProvider as Transaction['externalProvider']) ?? null,
      externalId: input.externalId ?? null,
      externalFee: input.externalFee ?? null,
      status: 'pending',
    })
    .returning()

  const row = rows[0]
  if (!row) {
    throw new Error('createPendingTransaction: INSERT returned no rows')
  }

  return row
}
