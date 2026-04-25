'use server'

/**
 * MOD-REFUND / T-8-19 — Server Actions para o wizard de reembolso
 *
 * Spec: docs/20-domain/14-refund.md §7
 *       docs/30-contracts/05-api-server-actions.md
 * RBAC: refund.open → admin|financial + 2FA (BR-RBAC)
 *       refund.approve → admin|financial + 2FA (BR-RBAC)
 */

import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/lib/db/client'
import { transaction } from '@/lib/db/schema/transaction'
import { customerEntitlement } from '@/lib/db/schema/entitlement'
import { contact } from '@/lib/db/schema/contact'
import { offer } from '@/lib/db/schema/offer'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { openRefund } from '@/lib/domain/refund'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const getRefundPreviewSchema = z.object({
  transactionId: z.string().uuid(),
})

const submitOpenRefundSchema = z.object({
  transactionId: z.string().uuid(),
  amount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido')
    .refine((v) => parseFloat(v) > 0, 'Valor deve ser maior que zero'),
  reason: z.string().min(10, 'Motivo deve ter ao menos 10 caracteres').max(1000),
})

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EntitlementPreviewItem = {
  id: string
  refKind: string
  refId: string
  kind: string
  status: string
  quantity: number
  startedAt: Date
  endsAt: Date | null
}

export type RefundPreview = {
  transactionId: string
  amount: string
  currency: string
  contactName: string
  offerName: string
  entitlementsToRevoke: EntitlementPreviewItem[]
}

// ---------------------------------------------------------------------------
// getRefundPreview — step 2: exibe efeitos previstos do reembolso
// ---------------------------------------------------------------------------

export async function getRefundPreview(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: preview exige ao menos permissão de abertura
    await requirePermission(ctx, 'refund.open', { kind: 'global' })

    const { transactionId } = getRefundPreviewSchema.parse(rawInput)

    // Buscar dados da transação com joins para contato e oferta
    const trxRows = await db
      .select({
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
        contactName: contact.fullName,
        offerName: offer.name,
      })
      .from(transaction)
      .innerJoin(contact, eq(contact.id, transaction.contactId))
      .innerJoin(offer, eq(offer.id, transaction.offerId))
      .where(eq(transaction.id, transactionId))
      .limit(1)

    const trx = trxRows[0]
    if (!trx) {
      throw new ActionError('NOT_FOUND', `Transação ${transactionId} não encontrada`)
    }

    if (trx.status !== 'approved') {
      throw new ActionError('VALIDATION', 'Apenas transações aprovadas podem ser reembolsadas')
    }

    const contactName = trx.contactName
    const offerName = trx.offerName

    // Buscar entitlements ativos oriundos desta transação (serão revogados no approve)
    const entitlements = await db
      .select({
        id: customerEntitlement.id,
        refKind: customerEntitlement.refKind,
        refId: customerEntitlement.refId,
        kind: customerEntitlement.kind,
        status: customerEntitlement.status,
        quantity: customerEntitlement.quantity,
        startedAt: customerEntitlement.startedAt,
        endsAt: customerEntitlement.endsAt,
      })
      .from(customerEntitlement)
      .where(
        and(
          eq(customerEntitlement.originTransactionId, transactionId),
          inArray(customerEntitlement.status, ['active', 'suspended']),
        ),
      )

    return {
      transactionId,
      amount: trx.amount,
      currency: trx.currency,
      contactName,
      offerName,
      entitlementsToRevoke: entitlements,
    } satisfies RefundPreview
  })
}

// ---------------------------------------------------------------------------
// submitOpenRefund — step 3: confirma abertura do reembolso
// ---------------------------------------------------------------------------

export async function submitOpenRefund(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: refund.open exige admin|financial + 2FA
    await requirePermission(ctx, 'refund.open', { kind: 'global' })

    const { transactionId, amount, reason } = submitOpenRefundSchema.parse(rawInput)

    const newRefund = await db.transaction(async (tx) => {
      const result = await openRefund(tx, transactionId, ctx.user.id, amount, reason)
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'refund',
        resourceId: result.id,
        after: { transactionId, amount, reason },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      })
      return result
    })

    revalidatePath(`/transactions/${transactionId}`)
    revalidatePath(`/transactions/${transactionId}/refund`)

    return { refundId: newRefund.id }
  })
}
