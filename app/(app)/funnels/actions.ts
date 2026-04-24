'use server'

/**
 * MOD-FUNNEL — Server Actions: CRUD de funil + movimentação de oportunidades
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §2
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * RBAC: docs/50-business-rules/BR-RBAC.md
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { funnel, funnelStage } from '@/lib/db/schema/funnel'
import type { Funnel, FunnelStage } from '@/lib/db/schema/funnel'
import {
  enterFunnel,
  moveStage,
  setOpportunityLabel,
  markWon,
  markLost,
} from '@/lib/domain/funnel'
import type { FunnelOpportunityLabel, EnterFunnelResult } from '@/lib/domain/funnel'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const createFunnelSchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  name: z.string().min(2, 'Nome do funil deve ter pelo menos 2 caracteres').max(200),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  offerId: z.string().uuid('offerId deve ser UUID').nullable().optional(),
  // Estágios iniciais opcionais — ao menos 1 é criado automaticamente se ausente
  initialStages: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        position: z.number().int().nonnegative(),
        isTerminal: z.boolean().default(false),
      }),
    )
    .min(1, 'Forneça pelo menos 1 estágio inicial')
    .optional(),
})

const createFunnelStageSchema = z.object({
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  name: z.string().min(1, 'Nome do estágio é obrigatório').max(200),
  position: z.number().int().nonnegative('Posição deve ser inteiro não-negativo'),
  isTerminal: z.boolean().default(false),
})

const enterFunnelSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  initialStageId: z.string().uuid().nullable().optional(),
  entryCampaignId: z.string().uuid().nullable().optional(),
  entryCreativeId: z.string().uuid().nullable().optional(),
  entryOrigin: z.string().max(100).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
})

const moveStageSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  toStageId: z.string().uuid('toStageId deve ser UUID'),
  reason: z.string().max(500).optional(),
})

const setOpportunityLabelSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  label: z.enum(['open', 'negotiating', 'concluded', 'won', 'lost', 'reopened']),
})

const markWonSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  transactionId: z.string().uuid('transactionId deve ser UUID'),
  conversionOrigin: z.string().max(100).nullable().optional(),
  conversionCampaignId: z.string().uuid().nullable().optional(),
  conversionCreativeId: z.string().uuid().nullable().optional(),
})

const markLostSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  reason: z.string().min(1, 'Motivo da perda é obrigatório').max(1000),
})

// ---------------------------------------------------------------------------
// createFunnelAction
// ---------------------------------------------------------------------------

/**
 * Cria um funil com estágios iniciais.
 * Guard: funnel.create
 */
export async function createFunnelAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<{ funnel: Funnel; stages: FunnelStage[] }>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createFunnelSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.create', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      // INSERT funnel
      const [newFunnel] = await tx
        .insert(funnel)
        .values({
          brandId: input.brandId,
          name: input.name,
          slug: input.slug,
          offerId: input.offerId ?? null,
          isActive: true,
        })
        .returning()

      if (!newFunnel) {
        throw new ActionError('INTERNAL', 'createFunnel: INSERT retornou vazio')
      }

      // INSERT estágios iniciais (padrão: 3 estágios se não informados)
      const stagesToCreate = input.initialStages ?? [
        { name: 'Novo', position: 0, isTerminal: false },
        { name: 'Em andamento', position: 1, isTerminal: false },
        { name: 'Concluído', position: 2, isTerminal: true },
      ]

      const newStages = await tx
        .insert(funnelStage)
        .values(
          stagesToCreate.map((s) => ({
            funnelId: newFunnel.id,
            name: s.name,
            position: s.position,
            isTerminal: s.isTerminal,
          })),
        )
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'funnel',
        resourceId: newFunnel.id,
        after: { id: newFunnel.id, name: newFunnel.name, slug: newFunnel.slug, brandId: newFunnel.brandId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { funnel: newFunnel, stages: newStages }
    })

    revalidatePath('/funnels')
    return result
  })
}

// ---------------------------------------------------------------------------
// createFunnelStageAction
// ---------------------------------------------------------------------------

/**
 * Adiciona um estágio a um funil existente.
 * Guard: funnel.create
 */
export async function createFunnelStageAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<FunnelStage>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createFunnelStageSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.create', { kind: 'funnel', id: input.funnelId })

    const result = await db.transaction(async (tx) => {
      const [newStage] = await tx
        .insert(funnelStage)
        .values({
          funnelId: input.funnelId,
          name: input.name,
          position: input.position,
          isTerminal: input.isTerminal,
        })
        .returning()

      if (!newStage) {
        throw new ActionError('INTERNAL', 'createFunnelStage: INSERT retornou vazio')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'funnel_stage',
        resourceId: newStage.id,
        after: { id: newStage.id, funnelId: newStage.funnelId, name: newStage.name, position: newStage.position },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return newStage
    })

    revalidatePath(`/funnels/${input.funnelId}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// enterFunnelAction
// ---------------------------------------------------------------------------

/**
 * Entra um contato no funil (idempotente — retorna entrada existente se já ativa).
 * Guard: funnel.manage
 */
export async function enterFunnelAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<EnterFunnelResult>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = enterFunnelSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.manage', { kind: 'funnel', id: input.funnelId })

    const result = await db.transaction(async (tx) => {
      const entryResult = await enterFunnel(tx, {
        contactId: input.contactId,
        funnelId: input.funnelId,
        initialStageId: input.initialStageId ?? null,
        entryCampaignId: input.entryCampaignId ?? null,
        entryCreativeId: input.entryCreativeId ?? null,
        entryOrigin: input.entryOrigin ?? null,
        ownerUserId: input.ownerUserId ?? null,
        actorUserId: ctx.user.id,
      })

      if (entryResult.created) {
        await logAudit(tx, {
          actorUserId: ctx.user.id,
          actionKind: 'create',
          resourceKind: 'funnel_entry',
          resourceId: entryResult.entry.id,
          after: {
            id: entryResult.entry.id,
            funnelId: input.funnelId,
            contactId: input.contactId,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          context: { correlationId: ctx.correlationId },
        })
      }

      return entryResult
    })

    revalidatePath(`/funnels/${input.funnelId}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// moveStageAction
// ---------------------------------------------------------------------------

/**
 * Move uma oportunidade para outro estágio (drag-drop no kanban).
 * Guard: funnel.manage
 *
 * // BR-FUNNEL-OPPORTUNITY: drag-drop usa SELECT FOR UPDATE via tx
 * O domínio moveStage carrega a entry dentro da mesma transação, garantindo
 * lock pessimista sobre a linha quando o DB usa READ COMMITTED com FOR UPDATE.
 */
export async function moveStageAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = moveStageSchema.parse(rawInput)

    // Guard aplicado antes da transação para falhar cedo (BR-RBAC)
    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    await db.transaction(async (tx) => {
      // BR-FUNNEL-OPPORTUNITY: drag-drop usa SELECT FOR UPDATE via tx
      // moveStage executa SELECT da entry dentro da mesma transação SQL,
      // garantindo consistência de leitura e prevenindo atualização concorrente
      // de current_stage_id sem lock explícito.
      await moveStage(tx, input.entryId, input.toStageId, input.reason)

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: { to_stage_id: input.toStageId, reason: input.reason ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })
    })

    // Revalidação ampla — entry pertence a algum funil (ID não disponível sem query extra)
    revalidatePath('/funnels', 'layout')
  })
}

// ---------------------------------------------------------------------------
// setOpportunityLabelAction
// ---------------------------------------------------------------------------

/**
 * Altera a etiqueta macro de uma oportunidade.
 * Guard: funnel.manage
 */
export async function setOpportunityLabelAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = setOpportunityLabelSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    await db.transaction(async (tx) => {
      await setOpportunityLabel(tx, {
        entryId: input.entryId,
        label: input.label as FunnelOpportunityLabel,
        actorUserId: ctx.user.id,
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: { label: input.label },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })
    })

    revalidatePath('/funnels', 'layout')
  })
}

// ---------------------------------------------------------------------------
// markWonAction
// ---------------------------------------------------------------------------

/**
 * Marca uma oportunidade como ganha, vinculando a transação aprovada.
 * Guard: funnel.close
 * INV-FUNNEL-05: exige transactionId não-vazio.
 */
export async function markWonAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = markWonSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.close', { kind: 'global' })

    await db.transaction(async (tx) => {
      await markWon(tx, {
        entryId: input.entryId,
        transactionId: input.transactionId,
        conversionOrigin: input.conversionOrigin ?? null,
        conversionCampaignId: input.conversionCampaignId ?? null,
        conversionCreativeId: input.conversionCreativeId ?? null,
        actorUserId: ctx.user.id,
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: {
          label: 'won',
          transaction_id: input.transactionId,
          conversion_origin: input.conversionOrigin ?? null,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, rule: 'BR-FUNNEL-OPPORTUNITY' },
      })
    })

    revalidatePath('/funnels', 'layout')
  })
}

// ---------------------------------------------------------------------------
// markLostAction
// ---------------------------------------------------------------------------

/**
 * Marca uma oportunidade como perdida.
 * Guard: funnel.close
 * INV-FUNNEL-05: exige reason não-vazia.
 */
export async function markLostAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = markLostSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.close', { kind: 'global' })

    await db.transaction(async (tx) => {
      await markLost(tx, {
        entryId: input.entryId,
        reason: input.reason,
        actorUserId: ctx.user.id,
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: { label: 'lost', lost_reason: input.reason },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, rule: 'BR-FUNNEL-OPPORTUNITY' },
      })
    })

    revalidatePath('/funnels', 'layout')
  })
}
