/**
 * MOD-BILLING — scheduleInstallments
 *
 * T-9-05
 * docs/20-domain/13-subscription-billing.md §2 (interface), §3.2 (campos), §5
 * INV-BILL-01: installment vincula-se a exatamente um pai (XOR)
 * INV-BILL-05: idempotência por sequence=1: se já existe, retorna as existentes sem duplicar
 * ADR-10: retorna Promise<T>, lança DomainError
 * ADR-11: tx como primeiro argumento
 */
import { and, eq, isNull } from 'drizzle-orm'

import type { DbTx } from '@/lib/db/client'
import { installment, type Installment, type NewInstallment } from '@/lib/db/schema/billing'

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type InstallmentPlan = {
  /** Número de parcelas — deve ser >= 1. */
  count: number
  /** Intervalo em dias entre parcelas. */
  intervalDays: number
  /** Valor de cada parcela como número (convertido para string numeric(12,2) no insert). */
  amount: number
  /** Vencimento da primeira parcela. */
  firstDueAt: Date
  /** Provedor externo opcional. */
  externalProvider?: string
  /** IDs externos por parcela (um por parcela quando disponível). */
  externalIds?: string[]
}

/** Define qual é o pai da parcela: subscription XOR transaction (INV-BILL-01). */
export type InstallmentParent =
  | { subscriptionId: string }
  | { transactionId: string }

// ---------------------------------------------------------------------------
// scheduleInstallments
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Cria parcelas para uma subscription ou transaction conforme o plano fornecido.
 *
 * Idempotente: se já existir uma parcela com sequence=1 para o mesmo pai,
 * retorna todas as parcelas existentes sem criar duplicatas (INV-BILL-05).
 *
 * @param tx     Transação DB ativa (ADR-11)
 * @param parent Pai das parcelas — subscriptionId XOR transactionId (INV-BILL-01)
 * @param plan   Plano de parcelamento
 * @returns      Array de parcelas criadas ou já existentes
 * @throws       DomainError('INVALID_INSTALLMENT_PLAN') quando count < 1 ou amount < 0
 */
export async function scheduleInstallments(
  tx: DbTx,
  parent: InstallmentParent,
  plan: InstallmentPlan,
): Promise<Installment[]> {
  // ── Validação do plano ──────────────────────────────────────────────────
  if (plan.count < 1) {
    throw new DomainError('INVALID_INSTALLMENT_PLAN: count must be >= 1')
  }
  if (plan.amount < 0) {
    throw new DomainError('INVALID_INSTALLMENT_PLAN: amount must be >= 0')
  }

  // ── Resolver pai (INV-BILL-01: XOR) ────────────────────────────────────
  const parentFilter = resolveParentFilter(parent)

  // ── Idempotência: checar se sequence=1 já existe (INV-BILL-05) ─────────
  // uq_installment_seq_sub / uq_installment_seq_trx garantem unicidade no DB.
  // Este select dá UX melhor antes de tentar o INSERT em batch.
  const existing = await tx
    .select()
    .from(installment)
    .where(and(parentFilter, eq(installment.sequence, 1)))
    .limit(1)

  if (existing.length > 0) {
    // INV-BILL-05: já foram criadas parcelas para este pai — retornar todas as existentes.
    return tx.select().from(installment).where(parentFilter)
  }

  // ── Construir array de NewInstallment ───────────────────────────────────
  const amountStr = plan.amount.toFixed(2)
  const parentValues = resolveParentValues(parent)
  const externalProviderTyped = (plan.externalProvider ?? null) as Installment['externalProvider']

  const rows: NewInstallment[] = []
  for (let i = 1; i <= plan.count; i++) {
    const dueAt = new Date(plan.firstDueAt.getTime() + (i - 1) * plan.intervalDays * MS_PER_DAY)
    const externalId = plan.externalIds?.[i - 1] ?? null

    rows.push({
      ...parentValues,
      sequence: i,
      due_at: dueAt,
      amount: amountStr,
      status: 'scheduled',
      externalProvider: externalProviderTyped,
      externalId,
    })
  }

  // ── INSERT via tx (ADR-11) ──────────────────────────────────────────────
  const inserted = await tx.insert(installment).values(rows).returning()

  return inserted
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Constrói o filtro Drizzle para localizar parcelas do pai.
 * INV-BILL-01: apenas um dos campos está presente.
 */
function resolveParentFilter(
  parent: InstallmentParent,
): ReturnType<typeof eq> {
  if ('subscriptionId' in parent) {
    return and(
      eq(installment.subscriptionId, parent.subscriptionId),
      isNull(installment.transactionId),
    ) as ReturnType<typeof eq>
  }
  return and(
    eq(installment.transactionId, parent.transactionId),
    isNull(installment.subscriptionId),
  ) as ReturnType<typeof eq>
}

/**
 * Retorna os campos de FK para o NewInstallment.
 * INV-BILL-01: exatamente um pai — o outro é NULL.
 */
function resolveParentValues(
  parent: InstallmentParent,
): Pick<NewInstallment, 'subscriptionId' | 'transactionId'> {
  if ('subscriptionId' in parent) {
    return { subscriptionId: parent.subscriptionId, transactionId: null }
  }
  return { transactionId: parent.transactionId, subscriptionId: null }
}

// ---------------------------------------------------------------------------
// DomainError local (segue ADR-10)
// ---------------------------------------------------------------------------

export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DomainError'
  }
}
