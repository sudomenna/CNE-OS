/**
 * MOD-BILLING — createSubscriptionFromTransaction
 *
 * T-9-04
 * docs/20-domain/13-subscription-billing.md §2, §5, §6.1, §9
 * docs/50-business-rules/BR-SUBSCRIPTION.md
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado no DB).
 *
 * Zero I/O direto: consome tx para DB e emitFn (injetável em testes) para timeline.
 */

import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { subscription, subscriptionStatusHistory } from '@/lib/db/schema/billing'
import type { Subscription } from '@/lib/db/schema/billing'
import { transaction } from '@/lib/db/schema/transaction'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Erros tipados (ADR-10)
// ---------------------------------------------------------------------------

export class BillingDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BillingDomainError'
  }
}

export class TransactionNotFoundError extends BillingDomainError {
  readonly transactionId: string

  constructor(transactionId: string) {
    super(`transaction ${transactionId} not found`)
    this.name = 'TransactionNotFoundError'
    this.transactionId = transactionId
  }
}

// ---------------------------------------------------------------------------
// Tipo de dependência injetável para emissão de timeline (facilita testes)
// ---------------------------------------------------------------------------

export type EmitFn = (
  input: TimelineEventInput,
  tx?: DbTx,
) => Promise<unknown>

// ---------------------------------------------------------------------------
// createSubscriptionFromTransaction
// ---------------------------------------------------------------------------

/**
 * Cria uma subscription a partir de uma transação aprovada.
 *
 * Lógica:
 *   1. Busca a transação pelo transactionId. Se não encontrada, lança
 *      TransactionNotFoundError. (ADR-10)
 *   2. Verifica se já existe subscription com origin_transaction_id = transactionId.
 *      Se sim, retorna a existente (idempotente). (BR-SUBSCRIPTION)
 *   3. Monta NewSubscription derivando status de trial_ends_at da transação.
 *      Se a transação não tiver trial_ends_at, status = 'active'.
 *      current_period_end = now() + 30 dias (fallback). (§6.1)
 *   4. Insere em subscription via tx.
 *   5. Insere linha inicial em subscription_status_history (old_status: null). (INV-BILL-06)
 *   6. Emite TE-SUBSCRIPTION-STARTED via emitFn. (§9)
 *   7. Retorna a subscription criada.
 *
 * @param tx              Transação DB ativa (ADR-11)
 * @param transactionId   UUID da transação aprovada
 * @param emit            Injeção da função de emissão (default: emitTimelineEvent)
 */
export async function createSubscriptionFromTransaction(
  tx: DbTx,
  transactionId: string,
  emit: EmitFn = emitTimelineEvent,
): Promise<Subscription> {
  // 1. Buscar a transação
  const trxRows = await tx
    .select()
    .from(transaction)
    .where(eq(transaction.id, transactionId))
    .limit(1)

  const trx = trxRows[0]
  if (!trx) {
    throw new TransactionNotFoundError(transactionId)
  }

  // 2. Idempotência: verificar se subscription já existe para esta transação
  // BR-SUBSCRIPTION: createSubscriptionFromTransaction é idempotente por origin_transaction_id
  const existingRows = await tx
    .select()
    .from(subscription)
    .where(eq(subscription.originTransactionId, transactionId))
    .limit(1)

  if (existingRows[0]) {
    return existingRows[0]
  }

  // 3. Determinar status inicial e datas do período
  // BR-SUBSCRIPTION §tabela-de-decisão linha 1-2:
  //   se trial_ends_at presente → status='trial'; senão → status='active'
  // INV-BILL-03: status='trial' exige trial_ends_at IS NOT NULL
  const now = new Date()

  // trial_ends_at: a transação não armazena este campo diretamente;
  // é derivado de offer/payment_option. Por ora, não há trial na transação base
  // (campo ausente no schema atual). Status inicial = 'active' como fallback seguro.
  // BR-SUBSCRIPTION §6.1: guard "trial se trial_ends_at presente"
  const trialEndsAt: Date | null = null // transação não carrega trial_ends_at na fase 1

  // BR-SUBSCRIPTION: determinar status inicial
  const initialStatus = trialEndsAt != null ? ('trial' as const) : ('active' as const)

  // current_period_end: 30 dias como fallback (OQ-BILL-02 — renovação a definir)
  const currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  // 4. Inserir subscription
  const inserted = await tx
    .insert(subscription)
    .values({
      contactId: trx.contactId,
      brandId: trx.brandId,
      offerId: trx.offerId,
      offerConditionId: trx.offerConditionId,
      offerPaymentOptionId: trx.offerPaymentOptionId,
      originTransactionId: transactionId,
      status: initialStatus,
      currentPeriodStart: now,
      currentPeriodEnd,
      trialEndsAt: trialEndsAt ?? undefined,
    })
    .returning()

  const newSubscription = inserted[0]!

  // 5. Inserir linha inicial em subscription_status_history (INV-BILL-06)
  // old_status = null na primeira linha (criação sem estado anterior)
  await tx.insert(subscriptionStatusHistory).values({
    subscriptionId: newSubscription.id,
    oldStatus: undefined, // null — primeira transição, sem estado anterior
    newStatus: initialStatus,
    note: 'subscription_created',
  })

  // 6. Emitir TE-SUBSCRIPTION-STARTED
  // §9: TE-SUBSCRIPTION-STARTED emitido na criação.
  await emit(
    {
      contactId: trx.contactId,
      brandId: trx.brandId,
      kind: 'subscription_started',
      source: 'MOD-BILLING',
      actorSystem: 'createSubscriptionFromTransaction',
      subjectKind: 'subscription',
      subjectId: newSubscription.id,
      payload: {
        subscriptionId: newSubscription.id,
        contactId: trx.contactId,
        offerId: trx.offerId,
        status: initialStatus,
      },
    },
    tx,
  )

  // 7. Retornar subscription criada
  return newSubscription
}
