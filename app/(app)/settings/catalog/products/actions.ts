'use server'

/**
 * MOD-CATALOG — Server Actions para Produtos
 * Spec: docs/20-domain/09-catalog.md §2, §5, §6
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * Guard: catalog.write (admin, marketing) — BR-RBAC
 */

import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { product, productCategory, productKindEnum } from '@/lib/db/schema/catalog'
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

const createProductSchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200, 'Nome muito longo'),
  slug: z
    .string()
    .min(2, 'Slug deve ter ao menos 2 caracteres')
    .max(100, 'Slug muito longo')
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug deve ser kebab-case'),
  kind: z.enum(productKindEnum.enumValues),
  categoryId: z.string().uuid('categoryId deve ser UUID').nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
})

const archiveProductSchema = z.object({
  productId: z.string().uuid('productId deve ser UUID'),
})

const updateProductSchema = z.object({
  productId: z.string().uuid('productId deve ser UUID'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200, 'Nome muito longo'),
  kind: z.enum(productKindEnum.enumValues),
  categoryId: z.string().uuid('categoryId deve ser UUID').nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
})

// ---------------------------------------------------------------------------
// createProductAction
// ---------------------------------------------------------------------------

/**
 * createProductAction — cria produto no catálogo.
 * Guard: catalog.write (admin, marketing)
 * INV-CATALOG-03: slug kebab-case normalizado antes de persistir.
 */
export async function createProductAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const input = createProductSchema.parse(rawInput)
    const slug = normalizeSlug(input.slug)

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(product)
        .values({
          brandId: input.brandId,
          name: input.name,
          slug,
          kind: input.kind,
          categoryId: input.categoryId ?? null,
          description: input.description ?? null,
          status: 'active',
        })
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'product',
        resourceId: created!.id,
        before: {},
        after: { name: input.name, slug, kind: input.kind, brandId: input.brandId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created!
    })

    revalidatePath('/settings/catalog/products')
    return result
  })
}

// ---------------------------------------------------------------------------
// archiveProductAction
// ---------------------------------------------------------------------------

/**
 * archiveProductAction — arquiva produto.
 * Guard: catalog.write (admin, marketing)
 * INV-CATALOG-05: produto arquivado não pode ser referenciado por condição ativa nova.
 * Rejeita se produto tiver referência ativa em offer_condition_item de condição ativa.
 */
export async function archiveProductAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const { productId } = archiveProductSchema.parse(rawInput)

    // Guard: verifica se produto está referenciado em condição ativa (status='active')
    // INV-CATALOG-05 / docs/20-domain/09-catalog.md §6
    const activeRefs = await db
      .select({ id: offerConditionItem.id })
      .from(offerConditionItem)
      .innerJoin(offerCondition, eq(offerConditionItem.offerConditionId, offerCondition.id))
      .where(
        and(
          eq(offerConditionItem.productId, productId),
          eq(offerCondition.status, 'active'),
          isNull(offerCondition.deletedAt),
        ),
      )
      .limit(1)

    if (activeRefs.length > 0) {
      // BR-CATALOG: produto referenciado por condição ativa não pode ser arquivado
      throw new ActionError('FORBIDDEN', 'Produto referenciado por condição ativa — remova o item da condição antes de arquivar.', {
        rule: 'INV-CATALOG-05',
      })
    }

    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ status: product.status, name: product.name })
        .from(product)
        .where(eq(product.id, productId))
        .limit(1)

      if (!before) {
        throw new ActionError('NOT_FOUND', 'Produto não encontrado.')
      }

      const [updated] = await tx
        .update(product)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(product.id, productId))
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'product',
        resourceId: productId,
        before: { status: before.status },
        after: { status: 'archived' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated!
    })

    revalidatePath('/settings/catalog/products')
    return result
  })
}

// ---------------------------------------------------------------------------
// updateProductAction
// ---------------------------------------------------------------------------

/**
 * updateProductAction — atualiza produto (nome, tipo, categoria, descrição).
 * Guard: catalog.write (admin, marketing)
 * INV-CATALOG-01: brand_id é imutável — não exposto neste update.
 * slug é imutável após criação para preservar referências externas.
 */
export async function updateProductAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const input = updateProductSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ name: product.name, kind: product.kind, categoryId: product.categoryId, description: product.description, status: product.status })
        .from(product)
        .where(eq(product.id, input.productId))
        .limit(1)

      if (!before) {
        throw new ActionError('NOT_FOUND', 'Produto não encontrado.')
      }

      const [updated] = await tx
        .update(product)
        .set({
          name: input.name,
          kind: input.kind,
          categoryId: input.categoryId ?? null,
          description: input.description ?? null,
          updatedAt: new Date(),
        })
        .where(eq(product.id, input.productId))
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'product',
        resourceId: input.productId,
        before: { name: before.name, kind: before.kind, categoryId: before.categoryId },
        after: { name: input.name, kind: input.kind, categoryId: input.categoryId ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated!
    })

    revalidatePath('/settings/catalog/products')
    return result
  })
}

// ---------------------------------------------------------------------------
// listProductsAction
// ---------------------------------------------------------------------------

/**
 * listProductsAction — lista produtos de uma marca.
 * Leitura — sem audit (BR-AUDIT §3).
 */
export async function listProductsAction(brandId?: string) {
  return toActionResult(async () => {
    await requireSession()

    const rows = await db
      .select({
        id: product.id,
        name: product.name,
        slug: product.slug,
        kind: product.kind,
        status: product.status,
        categoryId: product.categoryId,
        description: product.description,
        brandId: product.brandId,
        createdAt: product.createdAt,
      })
      .from(product)
      .where(brandId ? eq(product.brandId, brandId) : undefined)
      .orderBy(product.name)

    return rows
  })
}

// ---------------------------------------------------------------------------
// listBrandsForSelectAction (helper para o formulário)
// ---------------------------------------------------------------------------

export async function listBrandsForSelectAction() {
  return toActionResult(async () => {
    await requireSession()
    const rows = await db
      .select({ id: brand.id, name: brand.name, slug: brand.slug })
      .from(brand)
      .orderBy(brand.name)
    return rows.filter((b) => b.id != null)
  })
}

// ---------------------------------------------------------------------------
// listCategoriesForSelectAction (helper para o formulário)
// ---------------------------------------------------------------------------

export async function listCategoriesForSelectAction(brandId?: string) {
  return toActionResult(async () => {
    await requireSession()
    const rows = await db
      .select({ id: productCategory.id, name: productCategory.name, brandId: productCategory.brandId })
      .from(productCategory)
      .where(brandId ? eq(productCategory.brandId, brandId) : undefined)
      .orderBy(productCategory.name)
    return rows
  })
}
