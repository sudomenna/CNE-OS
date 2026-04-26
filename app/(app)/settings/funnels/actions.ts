'use server'

/**
 * MOD-FUNNEL — Server Actions: configuração de funis (settings)
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * RBAC: docs/50-business-rules/BR-RBAC.md
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { and, asc, count, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import {
  funnel,
  funnelStage,
  funnelScoreRule,
} from '@/lib/db/schema/funnel'
import type { Funnel, FunnelStage, FunnelScoreRule } from '@/lib/db/schema/funnel'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'
import type { ActionResult } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type FunnelWithMeta = Funnel & {
  brandName: string
  stageCount: number | bigint
  isActive: boolean
}

export type FunnelWithStages = Funnel & {
  stages: FunnelStage[]
  brandName: string
}

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const updateFunnelSchema = z.object({
  id: z.string().uuid('id deve ser UUID'),
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(200),
  stages: z.array(
    z.object({
      id: z.string().uuid().optional(), // undefined = novo estágio
      name: z.string().min(1, 'Nome do estágio é obrigatório').max(200),
      position: z.number().int().nonnegative(),
      isTerminal: z.boolean().default(false),
    }),
  ).min(1, 'Funil deve ter pelo menos 1 estágio'),
})

const createScoreRuleSchema = z.object({
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  name: z.string().min(1, 'Nome da regra é obrigatório').max(200),
  eventKind: z.string().min(1, 'event_kind é obrigatório').max(200),
  delta: z.number().refine((v) => v !== 0, 'Delta não pode ser zero'),
  isActive: z.boolean().default(true),
})

const updateScoreRuleSchema = z.object({
  id: z.string().uuid('id deve ser UUID'),
  name: z.string().min(1, 'Nome da regra é obrigatório').max(200).optional(),
  eventKind: z.string().min(1).max(200).optional(),
  delta: z.number().refine((v) => v !== 0, 'Delta não pode ser zero').optional(),
  isActive: z.boolean().optional(),
})

const deleteScoreRuleSchema = z.object({
  id: z.string().uuid('id deve ser UUID'),
})

// ---------------------------------------------------------------------------
// listFunnelsForSettings — lista funis com metadados para a tela de config
// ---------------------------------------------------------------------------

/**
 * Lista todos os funis (não deletados) com nome da marca e contagem de estágios.
 * Guard: funnel.write
 */
export async function listFunnelsForSettings(): Promise<ActionResult<FunnelWithMeta[]>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    const funnels = await db
      .select({
        id: funnel.id,
        brandId: funnel.brandId,
        brandName: brand.name,
        offerId: funnel.offerId,
        name: funnel.name,
        slug: funnel.slug,
        isActive: funnel.isActive,
        createdAt: funnel.createdAt,
        updatedAt: funnel.updatedAt,
        deletedAt: funnel.deletedAt,
      })
      .from(funnel)
      .leftJoin(brand, eq(funnel.brandId, brand.id))
      .where(isNull(funnel.deletedAt))
      .orderBy(brand.name, funnel.name)

    const withCounts = await Promise.all(
      funnels.map(async (f) => {
        const [row] = await db
          .select({ count: count() })
          .from(funnelStage)
          .where(eq(funnelStage.funnelId, f.id))
        return {
          ...f,
          brandName: f.brandName ?? '',
          stageCount: row?.count ?? 0,
        }
      }),
    )

    return withCounts
  })
}

// ---------------------------------------------------------------------------
// getFunnelWithStages — carrega funil + estágios ordenados para edição
// ---------------------------------------------------------------------------

/**
 * Carrega funil com todos os estágios para o form de edição.
 * Guard: funnel.write
 */
export async function getFunnelWithStages(
  funnelId: string,
): Promise<ActionResult<FunnelWithStages>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    const rows = await db
      .select({
        id: funnel.id,
        brandId: funnel.brandId,
        brandName: brand.name,
        offerId: funnel.offerId,
        name: funnel.name,
        slug: funnel.slug,
        isActive: funnel.isActive,
        createdAt: funnel.createdAt,
        updatedAt: funnel.updatedAt,
        deletedAt: funnel.deletedAt,
      })
      .from(funnel)
      .leftJoin(brand, eq(funnel.brandId, brand.id))
      .where(and(eq(funnel.id, funnelId), isNull(funnel.deletedAt)))
      .limit(1)

    const row = rows[0]
    if (!row) {
      throw new ActionError('NOT_FOUND', `Funil ${funnelId} não encontrado`)
    }

    const stages = await db
      .select()
      .from(funnelStage)
      .where(eq(funnelStage.funnelId, funnelId))
      .orderBy(asc(funnelStage.position))

    return { ...row, brandName: row.brandName ?? '', stages }
  })
}

// ---------------------------------------------------------------------------
// updateFunnelAction — atualiza nome + estágios do funil
// ---------------------------------------------------------------------------

/**
 * Atualiza nome e lista de estágios de um funil.
 * - Estágios sem `id` são criados.
 * - Estágios com `id` têm nome e posição atualizados.
 * - Estágios existentes não presentes na lista são removidos
 *   (só se não tiverem entradas; caso contrário são mantidos na posição final).
 *
 * Guard: funnel.write
 */
export async function updateFunnelAction(
  rawInput: unknown,
): Promise<ActionResult<{ funnelId: string }>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = updateFunnelSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      // Verifica existência do funil
      const [existing] = await tx
        .select({ id: funnel.id, name: funnel.name })
        .from(funnel)
        .where(and(eq(funnel.id, input.id), isNull(funnel.deletedAt)))
        .limit(1)

      if (!existing) {
        throw new ActionError('NOT_FOUND', `Funil ${input.id} não encontrado`)
      }

      // Atualiza nome do funil
      await tx
        .update(funnel)
        .set({ name: input.name, updatedAt: new Date() })
        .where(eq(funnel.id, input.id))

      // Estágios existentes no DB
      const currentStages = await tx
        .select()
        .from(funnelStage)
        .where(eq(funnelStage.funnelId, input.id))

      const inputIds = new Set(input.stages.flatMap((s) => (s.id ? [s.id] : [])))

      // Remove estágios que não estão mais na lista de entrada
      // (apenas se existentes no DB e não referenciados pelo input)
      const stagesToRemove = currentStages.filter((s) => !inputIds.has(s.id))
      for (const stage of stagesToRemove) {
        await tx.delete(funnelStage).where(eq(funnelStage.id, stage.id))
      }

      // Upsert estágios
      for (const stage of input.stages) {
        if (stage.id) {
          // Atualiza estágio existente
          await tx
            .update(funnelStage)
            .set({ name: stage.name, position: stage.position, isTerminal: stage.isTerminal })
            .where(and(eq(funnelStage.id, stage.id), eq(funnelStage.funnelId, input.id)))
        } else {
          // Cria novo estágio
          await tx.insert(funnelStage).values({
            funnelId: input.id,
            name: stage.name,
            position: stage.position,
            isTerminal: stage.isTerminal,
          })
        }
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel',
        resourceId: input.id,
        before: { name: existing.name },
        after: { name: input.name, stageCount: input.stages.length },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { funnelId: input.id }
    })

    revalidatePath('/settings/funnels')
    revalidatePath(`/funnels/${input.id}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// listScoreRulesAction — lista regras de score por funil
// ---------------------------------------------------------------------------

/**
 * Lista regras de score de um funil.
 * Guard: funnel.write
 */
export async function listScoreRulesAction(
  funnelId: string,
): Promise<ActionResult<FunnelScoreRule[]>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    const rules = await db
      .select()
      .from(funnelScoreRule)
      .where(eq(funnelScoreRule.funnelId, funnelId))
      .orderBy(asc(funnelScoreRule.createdAt))

    return rules
  })
}

// ---------------------------------------------------------------------------
// createScoreRuleAction
// ---------------------------------------------------------------------------

/**
 * Cria uma nova regra de score para um funil.
 * Guard: funnel.write
 */
export async function createScoreRuleAction(
  rawInput: unknown,
): Promise<ActionResult<FunnelScoreRule>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createScoreRuleSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      // Verifica que o funil existe
      const [f] = await tx
        .select({ id: funnel.id })
        .from(funnel)
        .where(and(eq(funnel.id, input.funnelId), isNull(funnel.deletedAt)))
        .limit(1)

      if (!f) {
        throw new ActionError('NOT_FOUND', `Funil ${input.funnelId} não encontrado`)
      }

      const [newRule] = await tx
        .insert(funnelScoreRule)
        .values({
          funnelId: input.funnelId,
          name: input.name,
          eventKind: input.eventKind,
          delta: String(input.delta),
          isActive: input.isActive,
        })
        .returning()

      if (!newRule) {
        throw new ActionError('INTERNAL', 'createScoreRule: INSERT retornou vazio')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'funnel_score_rule',
        resourceId: newRule.id,
        after: {
          funnelId: input.funnelId,
          name: input.name,
          eventKind: input.eventKind,
          delta: input.delta,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return newRule
    })

    revalidatePath('/settings/funnels')
    return result
  })
}

// ---------------------------------------------------------------------------
// updateScoreRuleAction
// ---------------------------------------------------------------------------

/**
 * Atualiza uma regra de score existente.
 * Guard: funnel.write
 */
export async function updateScoreRuleAction(
  rawInput: unknown,
): Promise<ActionResult<FunnelScoreRule>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = updateScoreRuleSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(funnelScoreRule)
        .where(eq(funnelScoreRule.id, input.id))
        .limit(1)

      if (!existing) {
        throw new ActionError('NOT_FOUND', `Regra de score ${input.id} não encontrada`)
      }

      const updateValues: Partial<typeof funnelScoreRule.$inferInsert> = {}
      if (input.name !== undefined) updateValues.name = input.name
      if (input.eventKind !== undefined) updateValues.eventKind = input.eventKind
      if (input.delta !== undefined) updateValues.delta = String(input.delta)
      if (input.isActive !== undefined) updateValues.isActive = input.isActive

      const [updated] = await tx
        .update(funnelScoreRule)
        .set(updateValues)
        .where(eq(funnelScoreRule.id, input.id))
        .returning()

      if (!updated) {
        throw new ActionError('INTERNAL', 'updateScoreRule: UPDATE retornou vazio')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_score_rule',
        resourceId: input.id,
        before: {
          name: existing.name,
          eventKind: existing.eventKind,
          delta: existing.delta,
          isActive: existing.isActive,
        },
        after: updateValues,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath('/settings/funnels')
    return result
  })
}

// ---------------------------------------------------------------------------
// deleteScoreRuleAction
// ---------------------------------------------------------------------------

/**
 * Remove uma regra de score.
 * Guard: funnel.write
 */
export async function deleteScoreRuleAction(
  rawInput: unknown,
): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = deleteScoreRuleSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(funnelScoreRule)
        .where(eq(funnelScoreRule.id, input.id))
        .limit(1)

      if (!existing) {
        throw new ActionError('NOT_FOUND', `Regra de score ${input.id} não encontrada`)
      }

      await tx.delete(funnelScoreRule).where(eq(funnelScoreRule.id, input.id))

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'delete',
        resourceKind: 'funnel_score_rule',
        resourceId: input.id,
        before: {
          funnelId: existing.funnelId,
          name: existing.name,
          eventKind: existing.eventKind,
        },
        after: {},
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })
    })

    revalidatePath('/settings/funnels')
  })
}
