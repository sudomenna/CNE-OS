/**
 * MOD-BILLING — handleInstallmentPaid + handleInstallmentOverdue
 *
 * T-9-06
 * docs/20-domain/13-subscription-billing.md §6.2, §9
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (funções mutam estado no DB).
 *
 * Zero I/O direto: consome tx para DB e emitFn (injetável em testes) para timeline.
 */

import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { installment, installmentStatusHistory } from '@/lib/db/schema/billing'
import type { Installment } from '@/lib/db/schema/billing'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Erros tipados (ADR-10)
// ---------------------------------------------------------------------------

export class InstallmentDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstallmentDomainError'
  }
}

export class InstallmentNotFoundError extends InstallmentDomainError {
  readonly installmentId: string

  constructor(installmentId: string) {
    super(`installment ${installmentId} not found`)
    this.name = 'InstallmentNotFoundError'
    this.installmentId = installmentId
  }
}

export class InvalidStatusTransitionError extends InstallmentDomainError {
  readonly fromStatus: string
  readonly toStatus: string

  constructor(fromStatus: string, toStatus: string) {
    super(`invalid installment status transition: ${fromStatus} → ${toStatus}`)
    this.name = 'InvalidStatusTransitionError'
    this.fromStatus = fromStatus
    this.toStatus = toStatus
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
// handleInstallmentPaid
// ---------------------------------------------------------------------------

/**
 * Marca uma parcela como paga.
 *
 * Lógica (§6.2):
 *   1. Busca installment por id. Se não encontrada, lança InstallmentNotFoundError.
 *   2. Se já está `paid`, retorna idempotentemente (sem UPDATE).
 *   3. Se status não é `scheduled` ou `overdue`, lança InvalidStatusTransitionError.
 *   4. Atualiza status = 'paid', paid_at = paidAt ?? now(), updated_at = now().
 *   5. Insere registro em installment_status_history (INV-BILL-06).
 *   6. Emite TE-INSTALLMENT-PAID (§9).
 *   7. Retorna installment atualizado.
 *
 * @param tx            Transação DB ativa (ADR-11)
 * @param installmentId UUID da parcela
 * @param paidAt        Timestamp de pagamento (default: now())
 * @param emit          Injeção da função de emissão (default: emitTimelineEvent)
 */
export async function handleInstallmentPaid(
  tx: DbTx,
  installmentId: string,
  paidAt?: Date,
  emit: EmitFn = emitTimelineEvent,
): Promise<Installment> {
  // 1. Buscar installment
  const rows = await tx
    .select()
    .from(installment)
    .where(eq(installment.id, installmentId))
    .limit(1)

  const inst = rows[0]
  if (!inst) {
    throw new InstallmentNotFoundError(installmentId)
  }

  // 2. Idempotência: se já paid, retorna sem UPDATE
  // BR-INTEGRATION-IDEMPOTENCY: ação já concluída, retorna estado atual
  if (inst.status === 'paid') {
    return inst
  }

  // 3. Verificar transição válida: scheduled → paid, overdue → paid
  // docs/20-domain/13-subscription-billing.md §6.2
  if (inst.status !== 'scheduled' && inst.status !== 'overdue') {
    throw new InvalidStatusTransitionError(inst.status, 'paid')
  }

  const oldStatus = inst.status
  const now = new Date()
  const resolvedPaidAt = paidAt ?? now

  // 4. Atualizar status
  const updated = await tx
    .update(installment)
    .set({
      status: 'paid',
      paidAt: resolvedPaidAt,
      updatedAt: now,
    })
    .where(eq(installment.id, installmentId))
    .returning()

  const updatedInst = updated[0]!

  // 5. Inserir em installment_status_history (INV-BILL-06: toda mudança de status grava linha)
  await tx.insert(installmentStatusHistory).values({
    installmentId,
    oldStatus,
    newStatus: 'paid',
    note: 'installment_paid',
  })

  // 6. Emitir TE-INSTALLMENT-PAID (§9)
  const contactId = updatedInst.subscriptionId ?? updatedInst.transactionId ?? installmentId

  await emit(
    {
      contactId,
      kind: 'installment_paid',
      source: 'MOD-BILLING',
      actorSystem: 'handleInstallmentPaid',
      subjectKind: 'installment',
      subjectId: installmentId,
      payload: {
        installmentId,
        subscriptionId: updatedInst.subscriptionId ?? undefined,
        transactionId: updatedInst.transactionId ?? undefined,
        amount: parseFloat(updatedInst.amount),
        paidAt: updatedInst.paidAt!.toISOString(),
      },
    },
    tx,
  )

  // 7. Retornar installment atualizado
  return updatedInst
}

// ---------------------------------------------------------------------------
// handleInstallmentOverdue
// ---------------------------------------------------------------------------

/**
 * Marca uma parcela como vencida (overdue).
 *
 * Lógica (§6.2):
 *   1. Busca installment por id. Se não encontrada, lança InstallmentNotFoundError.
 *   2. Se já está `overdue`, retorna idempotentemente (sem UPDATE).
 *   3. Se status não é `scheduled`, lança InvalidStatusTransitionError.
 *   4. Atualiza status = 'overdue', updated_at = now().
 *   5. Insere registro em installment_status_history (INV-BILL-06).
 *   6. Emite TE-INSTALLMENT-OVERDUE (§9).
 *   7. Retorna installment atualizado.
 *
 * @param tx            Transação DB ativa (ADR-11)
 * @param installmentId UUID da parcela
 * @param emit          Injeção da função de emissão (default: emitTimelineEvent)
 */
export async function handleInstallmentOverdue(
  tx: DbTx,
  installmentId: string,
  emit: EmitFn = emitTimelineEvent,
): Promise<Installment> {
  // 1. Buscar installment
  const rows = await tx
    .select()
    .from(installment)
    .where(eq(installment.id, installmentId))
    .limit(1)

  const inst = rows[0]
  if (!inst) {
    throw new InstallmentNotFoundError(installmentId)
  }

  // 2. Idempotência: se já overdue, retorna sem UPDATE
  // BR-INTEGRATION-IDEMPOTENCY: ação já concluída, retorna estado atual
  if (inst.status === 'overdue') {
    return inst
  }

  // 3. Verificar transição válida: scheduled → overdue
  // docs/20-domain/13-subscription-billing.md §6.2
  if (inst.status !== 'scheduled') {
    throw new InvalidStatusTransitionError(inst.status, 'overdue')
  }

  const now = new Date()

  // 4. Atualizar status
  const updated = await tx
    .update(installment)
    .set({
      status: 'overdue',
      updatedAt: now,
    })
    .where(eq(installment.id, installmentId))
    .returning()

  const updatedInst = updated[0]!

  // 5. Inserir em installment_status_history (INV-BILL-06: toda mudança de status grava linha)
  await tx.insert(installmentStatusHistory).values({
    installmentId,
    oldStatus: 'scheduled',
    newStatus: 'overdue',
    note: 'installment_overdue',
  })

  // 6. Emitir TE-INSTALLMENT-OVERDUE (§9)
  await emit(
    {
      contactId: updatedInst.subscriptionId ?? updatedInst.transactionId ?? installmentId,
      kind: 'installment_overdue',
      source: 'MOD-BILLING',
      actorSystem: 'handleInstallmentOverdue',
      subjectKind: 'installment',
      subjectId: installmentId,
      payload: {
        installmentId,
        subscriptionId: updatedInst.subscriptionId ?? undefined,
        transactionId: updatedInst.transactionId ?? undefined,
        amount: parseFloat(updatedInst.amount),
        dueAt: updatedInst.due_at.toISOString(),
      },
    },
    tx,
  )

  // 7. Retornar installment atualizado
  return updatedInst
}
