'use server'

/**
 * MOD-CATALOG — Server Actions para Benefícios Comerciais
 * Spec: docs/20-domain/09-catalog.md §3.3, §5, §6
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * Guard: catalog.write (admin, marketing) — BR-RBAC
 */

import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { commercialBenefit } from '@/lib/db/schema/catalog'
import { offerConditionItem, offerCondition } from '@/lib/db/schema/offer'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { normalizeSlug } from '@/lib/domain/catalog/normalize'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createBenefitSchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200, 'Nome muito longo'),
  slug: z
    .string()
    .min(2, 'Slug deve ter ao menos 2 caracteres')
    .max(100, 'Slug muito longo')
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug deve ser kebab-case'),
  description: z.string().max(2000).nullable().optional(),
  // INV-CATALOG-06: auto_tag deve ser kebab-case quando presente
  autoTag: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'auto_tag deve ser kebab-case')
    .nullable()
    .optional(),
  defaultDurationMonths: z.number().int().positive().nullable().optional(),
  deliveryStatusRequired: z.boolean().optional().default(false),
})

const archiveBenefitSchema = z.object({
  benefitId: z.string().uuid('benefitId deve ser UUID'),
})

const updateBenefitSchema = z.object({
  benefitId: z.string().uuid('benefitId deve ser UUID'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200, 'Nome muito longo'),
  description: z.string().max(2000).nullable().optional(),
  autoTag: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'auto_tag deve ser kebab-case')
    .nullable()
    .optional(),
  defaultDurationMonths: z.number().int().positive().nullable().optional(),
  deliveryStatusRequired: z.boolean().optional().default(false),
})

// ---------------------------------------------------------------------------
// createBenefitAction
// ---------------------------------------------------------------------------

/**
 * createBenefitAction — cria benefício comercial.
 * Guard: catalog.write (admin, marketing)
 * INV-CATALOG-04: slug único por marca.
 * INV-CATALOG-06: auto_tag kebab-case validado via Zod.
 */
export async function createBenefitAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const input = createBenefitSchema.parse(rawInput)
    const slug = normalizeSlug(input.slug)

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(commercialBenefit)
        .values({
          brandId: input.brandId,
          name: input.name,
          slug,
          description: input.description ?? null,
          autoTag: input.autoTag ?? null,
          defaultDurationMonths: input.defaultDurationMonths ?? null,
          deliveryStatusRequired: input.deliveryStatusRequired ?? false,
          status: 'active',
        })
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'commercial_benefit',
        resourceId: created!.id,
        before: {},
        after: { name: input.name, slug, brandId: input.brandId, autoTag: input.autoTag },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created!
    })

    revalidatePath('/settings/catalog/benefits')
    return result
  })
}

// ---------------------------------------------------------------------------
// archiveBenefitAction
// ---------------------------------------------------------------------------

/**
 * archiveBenefitAction — arquiva benefício comercial.
 * Guard: catalog.write (admin, marketing)
 * docs/20-domain/09-catalog.md §6: benefício com condição ativa não pode ser arquivado.
 */
export async function archiveBenefitAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const { benefitId } = archiveBenefitSchema.parse(rawInput)

    // Guard: verifica se benefício está referenciado em condição ativa
    const activeRefs = await db
      .select({ id: offerConditionItem.id })
      .from(offerConditionItem)
      .innerJoin(offerCondition, eq(offerConditionItem.offerConditionId, offerCondition.id))
      .where(
        and(
          eq(offerConditionItem.commercialBenefitId, benefitId),
          eq(offerCondition.status, 'active'),
          isNull(offerCondition.deletedAt),
        ),
      )
      .limit(1)

    if (activeRefs.length > 0) {
      throw new ActionError('FORBIDDEN', 'Benefício referenciado por condição ativa — remova o item da condição antes de arquivar.', {
        rule: 'INV-CATALOG-05',
      })
    }

    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ status: commercialBenefit.status, name: commercialBenefit.name })
        .from(commercialBenefit)
        .where(eq(commercialBenefit.id, benefitId))
        .limit(1)

      if (!before) {
        throw new ActionError('NOT_FOUND', 'Benefício não encontrado.')
      }

      const [updated] = await tx
        .update(commercialBenefit)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(commercialBenefit.id, benefitId))
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'commercial_benefit',
        resourceId: benefitId,
        before: { status: before.status },
        after: { status: 'archived' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated!
    })

    revalidatePath('/settings/catalog/benefits')
    return result
  })
}

// ---------------------------------------------------------------------------
// updateBenefitAction
// ---------------------------------------------------------------------------

/**
 * updateBenefitAction — atualiza benefício comercial (nome, descrição, autoTag, vigência, entrega).
 * Guard: catalog.write (admin, marketing)
 * slug é imutável após criação (preserva referências de entitlement existentes).
 * INV-CATALOG-06: auto_tag kebab-case validado via Zod.
 */
export async function updateBenefitAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const input = updateBenefitSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          name: commercialBenefit.name,
          description: commercialBenefit.description,
          autoTag: commercialBenefit.autoTag,
          defaultDurationMonths: commercialBenefit.defaultDurationMonths,
          deliveryStatusRequired: commercialBenefit.deliveryStatusRequired,
        })
        .from(commercialBenefit)
        .where(eq(commercialBenefit.id, input.benefitId))
        .limit(1)

      if (!before) {
        throw new ActionError('NOT_FOUND', 'Benefício não encontrado.')
      }

      const [updated] = await tx
        .update(commercialBenefit)
        .set({
          name: input.name,
          description: input.description ?? null,
          autoTag: input.autoTag ?? null,
          defaultDurationMonths: input.defaultDurationMonths ?? null,
          deliveryStatusRequired: input.deliveryStatusRequired ?? false,
          updatedAt: new Date(),
        })
        .where(eq(commercialBenefit.id, input.benefitId))
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'commercial_benefit',
        resourceId: input.benefitId,
        before: { name: before.name, autoTag: before.autoTag },
        after: { name: input.name, autoTag: input.autoTag ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated!
    })

    revalidatePath('/settings/catalog/benefits')
    return result
  })
}

// ---------------------------------------------------------------------------
// listBenefitsAction
// ---------------------------------------------------------------------------

/**
 * listBenefitsAction — lista benefícios comerciais de uma marca.
 * Leitura — sem audit (BR-AUDIT §3).
 */
export async function listBenefitsAction(brandId?: string) {
  return toActionResult(async () => {
    await requireSession()

    const rows = await db
      .select({
        id: commercialBenefit.id,
        name: commercialBenefit.name,
        slug: commercialBenefit.slug,
        description: commercialBenefit.description,
        autoTag: commercialBenefit.autoTag,
        defaultDurationMonths: commercialBenefit.defaultDurationMonths,
        deliveryStatusRequired: commercialBenefit.deliveryStatusRequired,
        status: commercialBenefit.status,
        brandId: commercialBenefit.brandId,
        createdAt: commercialBenefit.createdAt,
      })
      .from(commercialBenefit)
      .where(brandId ? eq(commercialBenefit.brandId, brandId) : undefined)
      .orderBy(commercialBenefit.name)

    return rows
  })
}

// ---------------------------------------------------------------------------
// listBrandsForBenefitSelectAction (helper)
// ---------------------------------------------------------------------------

export async function listBrandsForBenefitSelectAction() {
  return toActionResult(async () => {
    await requireSession()
    const rows = await db
      .select({ id: brand.id, name: brand.name, slug: brand.slug })
      .from(brand)
      .orderBy(brand.name)
    return rows
  })
}
