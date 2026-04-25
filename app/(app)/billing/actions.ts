'use server'

/**
 * MOD-BILLING — Server Actions de mutação
 * T-9-13: cancelar assinatura + retry manual de parcela
 *
 * Spec: docs/20-domain/13-subscription-billing.md
 * Contract: docs/30-contracts/05-api-server-actions.md
 * RBAC: billing.cancel e billing.retry — admin e financial com 2FA (BR-RBAC)
 */

import { z } from 'zod'
import { eq } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { installment } from '@/lib/db/schema/billing'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { logAudit } from '@/lib/audit/log'
import { cancelSubscription } from '@/lib/domain/billing/cancel'
import { revalidatePath } from 'next/cache'

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const cancelSubscriptionSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().min(1).max(500),
})

const retryInstallmentSchema = z.object({
  installmentId: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// cancelSubscriptionAction
// ---------------------------------------------------------------------------

/**
 * Cancela uma assinatura.
 *
 * RBAC: billing.cancel — apenas admin e financial (com 2FA).
 * Chama cancelSubscription do domínio dentro de transação.
 * Emissão de TE-SUBSCRIPTION-CANCELLED é feita dentro de cancelSubscription.
 */
export async function cancelSubscriptionAction(rawInput: unknown) {
  return toActionResult(async () => {
    // 1. Sessão
    const ctx = await requireSession()

    // 2. Validar input
    const input = cancelSubscriptionSchema.parse(rawInput)

    // 3. Guard RBAC — billing.cancel: admin e financial com 2FA
    await requirePermission(ctx, 'billing.cancel', { kind: 'global' })

    // 4. Transação: domínio + audit
    const updated = await db.transaction(async (tx) => {
      const sub = await cancelSubscription(tx, input.subscriptionId, input.reason)

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'subscription',
        resourceId: input.subscriptionId,
        before: { status: 'active' },
        after: { status: 'cancelled', cancel_reason: input.reason },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, reason: input.reason },
      })

      return sub
    })

    // 5. Revalidar caches
    revalidatePath('/billing')
    revalidatePath(`/billing/${input.subscriptionId}`)

    return updated
  })
}

// ---------------------------------------------------------------------------
// retryInstallmentAction
// ---------------------------------------------------------------------------

/**
 * Registra tentativa manual de retry de parcela vencida.
 *
 * RBAC: billing.retry — apenas admin e financial (com 2FA).
 * Incrementa retry_count e atualiza last_retry_at.
 * O pagamento real é responsabilidade do provedor externo —
 * esta action apenas registra a tentativa no sistema.
 *
 * Pré-condição: installment.status === 'overdue' (INVALID_STATUS caso contrário).
 */
export async function retryInstallmentAction(rawInput: unknown) {
  return toActionResult(async () => {
    // 1. Sessão
    const ctx = await requireSession()

    // 2. Validar input
    const { installmentId } = retryInstallmentSchema.parse(rawInput)

    // 3. Guard RBAC — billing.retry: admin e financial com 2FA
    await requirePermission(ctx, 'billing.retry', { kind: 'global' })

    // 4. Transação: verificar status, incrementar retry_count + audit
    const updated = await db.transaction(async (tx) => {
      // Buscar installment — verifica existência e status
      const rows = await tx
        .select()
        .from(installment)
        .where(eq(installment.id, installmentId))
        .limit(1)

      const inst = rows[0]
      if (!inst) {
        throw new ActionError('NOT_FOUND', `Parcela ${installmentId} não encontrada`)
      }

      // BR-BILLING: retry manual exige status 'overdue'
      if (inst.status !== 'overdue') {
        throw new ActionError(
          'VALIDATION',
          `Retry apenas permitido em parcelas vencidas. Status atual: ${inst.status}`,
          { rule: 'BR-BILLING' },
        )
      }

      const now = new Date()

      // Incrementar retry_count e registrar last_retry_at
      const result = await tx
        .update(installment)
        .set({
          retryCount: inst.retryCount + 1,
          lastRetryAt: now,
          updatedAt: now,
        })
        .where(eq(installment.id, installmentId))
        .returning()

      const updatedInst = result[0]!

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'installment',
        resourceId: installmentId,
        before: { retry_count: inst.retryCount, last_retry_at: inst.lastRetryAt },
        after: { retry_count: updatedInst.retryCount, last_retry_at: updatedInst.lastRetryAt },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updatedInst
    })

    // 5. Revalidar caches
    revalidatePath('/billing')

    return updated
  })
}
