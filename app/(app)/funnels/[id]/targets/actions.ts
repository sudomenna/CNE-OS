'use server'

/**
 * MOD-FUNNEL — Server Actions: metas comerciais (sales_target)
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §3
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * RBAC: docs/50-business-rules/BR-RBAC.md
 */

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { salesTarget } from '@/lib/db/schema/funnel'
import type { SalesTarget } from '@/lib/db/schema/funnel'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const createSalesTargetSchema = z.object({
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'periodStart deve estar no formato YYYY-MM-DD'),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'periodEnd deve estar no formato YYYY-MM-DD'),
  targetCount: z
    .number()
    .int()
    .positive('targetCount deve ser inteiro positivo')
    .nullable()
    .optional(),
  targetRevenue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'targetRevenue deve ser valor numérico com até 2 casas decimais')
    .nullable()
    .optional(),
}).refine(
  (data) => data.periodStart <= data.periodEnd,
  { message: 'periodStart deve ser anterior ou igual a periodEnd', path: ['periodEnd'] },
).refine(
  (data) => data.targetCount != null || data.targetRevenue != null,
  { message: 'Pelo menos targetCount ou targetRevenue deve ser informado' },
)

const updateSalesTargetSchema = z.object({
  targetId: z.string().uuid('targetId deve ser UUID'),
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  periodStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'periodStart deve estar no formato YYYY-MM-DD')
    .optional(),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'periodEnd deve estar no formato YYYY-MM-DD')
    .optional(),
  targetCount: z
    .number()
    .int()
    .positive('targetCount deve ser inteiro positivo')
    .nullable()
    .optional(),
  targetRevenue: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, 'targetRevenue deve ser valor numérico com até 2 casas decimais')
    .nullable()
    .optional(),
})

// ---------------------------------------------------------------------------
// createSalesTargetAction
// ---------------------------------------------------------------------------

/**
 * Cria uma meta comercial para um funil em determinado período.
 * Guard: funnel.manage
 */
export async function createSalesTargetAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<SalesTarget>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createSalesTargetSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.manage', { kind: 'funnel', id: input.funnelId })

    const result = await db.transaction(async (tx) => {
      const [newTarget] = await tx
        .insert(salesTarget)
        .values({
          funnelId: input.funnelId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          targetCount: input.targetCount ?? null,
          targetRevenue: input.targetRevenue ?? null,
        })
        .returning()

      if (!newTarget) {
        throw new ActionError('INTERNAL', 'createSalesTarget: INSERT retornou vazio')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'sales_target',
        resourceId: newTarget.id,
        after: {
          id: newTarget.id,
          funnelId: newTarget.funnelId,
          periodStart: newTarget.periodStart,
          periodEnd: newTarget.periodEnd,
          targetCount: newTarget.targetCount,
          targetRevenue: newTarget.targetRevenue,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return newTarget
    })

    revalidatePath(`/funnels/${input.funnelId}/targets`)
    revalidatePath(`/funnels/${input.funnelId}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// updateSalesTargetAction
// ---------------------------------------------------------------------------

/**
 * Atualiza uma meta comercial existente.
 * Guard: funnel.manage
 */
export async function updateSalesTargetAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<SalesTarget>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = updateSalesTargetSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.manage', { kind: 'funnel', id: input.funnelId })

    // Validar consistência de datas se ambas fornecidas
    if (input.periodStart && input.periodEnd && input.periodStart > input.periodEnd) {
      throw new ActionError('VALIDATION', 'periodStart deve ser anterior ou igual a periodEnd')
    }

    const result = await db.transaction(async (tx) => {
      // Carregar meta existente para snapshot de "before" no audit log
      const existingRows = await tx
        .select()
        .from(salesTarget)
        .where(eq(salesTarget.id, input.targetId))

      const existing = existingRows[0]
      if (!existing) {
        throw new ActionError('NOT_FOUND', `Meta ${input.targetId} não encontrada`)
      }

      // Montar patch apenas com campos fornecidos
      const patch: Partial<typeof salesTarget.$inferInsert> = {}
      if (input.periodStart !== undefined) patch.periodStart = input.periodStart
      if (input.periodEnd !== undefined) patch.periodEnd = input.periodEnd
      if (input.targetCount !== undefined) patch.targetCount = input.targetCount
      if (input.targetRevenue !== undefined) patch.targetRevenue = input.targetRevenue

      const [updated] = await tx
        .update(salesTarget)
        .set(patch)
        .where(eq(salesTarget.id, input.targetId))
        .returning()

      if (!updated) {
        throw new ActionError('INTERNAL', 'updateSalesTarget: UPDATE retornou vazio')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'sales_target',
        resourceId: input.targetId,
        before: {
          periodStart: existing.periodStart,
          periodEnd: existing.periodEnd,
          targetCount: existing.targetCount,
          targetRevenue: existing.targetRevenue,
        },
        after: {
          periodStart: updated.periodStart,
          periodEnd: updated.periodEnd,
          targetCount: updated.targetCount,
          targetRevenue: updated.targetRevenue,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath(`/funnels/${input.funnelId}/targets`)
    revalidatePath(`/funnels/${input.funnelId}`)
    return result
  })
}
