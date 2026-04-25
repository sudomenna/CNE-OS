'use server'

/**
 * MOD-CATALOG — Server Actions para Categorias de Produto
 * Spec: docs/20-domain/09-catalog.md §3.2
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * Guard: catalog.write (admin, marketing) — BR-RBAC
 */

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { productCategory } from '@/lib/db/schema/catalog'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { normalizeSlug } from '@/lib/domain/catalog/normalize'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createCategorySchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(200, 'Nome muito longo'),
  slug: z
    .string()
    .min(2, 'Slug deve ter ao menos 2 caracteres')
    .max(100, 'Slug muito longo')
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug deve ser kebab-case'),
  parentId: z.string().uuid('parentId deve ser UUID').nullable().optional(),
})

const archiveCategorySchema = z.object({
  categoryId: z.string().uuid('categoryId deve ser UUID'),
})

// ---------------------------------------------------------------------------
// createCategoryAction
// ---------------------------------------------------------------------------

/**
 * createCategoryAction — cria categoria de produto.
 * Guard: catalog.write (admin, marketing)
 * INV-CATALOG-03 (variant): slug único por marca.
 */
export async function createCategoryAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const input = createCategorySchema.parse(rawInput)
    const slug = normalizeSlug(input.slug)

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(productCategory)
        .values({
          brandId: input.brandId,
          name: input.name,
          slug,
          parentId: input.parentId ?? null,
        })
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'product_category',
        resourceId: created!.id,
        before: {},
        after: { name: input.name, slug, brandId: input.brandId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created!
    })

    revalidatePath('/settings/catalog/categories')
    return result
  })
}

// ---------------------------------------------------------------------------
// archiveCategoryAction
// ---------------------------------------------------------------------------

/**
 * archiveCategoryAction — remove categoria (soft-delete via deletedAt não implementado;
 * categoria não tem campo status — apenas apagamos logicamente marcando deletedAt se existir,
 * mas a spec não prevê campo status para product_category).
 *
 * Como product_category não possui campo `status`, arquivamento aqui significa exclusão lógica:
 * deletamos a referência no banco (ON DELETE RESTRICT protege integridade).
 * Se houver produtos filhos, o DB retorna erro de FK.
 *
 * Guard: catalog.write (admin, marketing)
 */
export async function archiveCategoryAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    await requirePermission(ctx, 'catalog.write', { kind: 'catalog' })

    const { categoryId } = archiveCategorySchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ name: productCategory.name, brandId: productCategory.brandId })
        .from(productCategory)
        .where(eq(productCategory.id, categoryId))
        .limit(1)

      if (!before) {
        throw new ActionError('NOT_FOUND', 'Categoria não encontrada.')
      }

      // Nota: product_category usa ON DELETE SET NULL na FK de product.category_id,
      // portanto a exclusão desvincula produtos mas não falha.
      // Subcategorias com parent_id apontando para esta categoria terão parent_id = NULL (SET NULL).
      const [deleted] = await tx
        .delete(productCategory)
        .where(eq(productCategory.id, categoryId))
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'delete',
        resourceKind: 'product_category',
        resourceId: categoryId,
        before: { name: before.name },
        after: { deleted: true },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return deleted!
    })

    revalidatePath('/settings/catalog/categories')
    return result
  })
}

// ---------------------------------------------------------------------------
// listCategoriesAction
// ---------------------------------------------------------------------------

/**
 * listCategoriesAction — lista categorias de produto.
 * Leitura — sem audit (BR-AUDIT §3).
 */
export async function listCategoriesAction(brandId?: string) {
  return toActionResult(async () => {
    await requireSession()

    const rows = await db
      .select({
        id: productCategory.id,
        name: productCategory.name,
        slug: productCategory.slug,
        brandId: productCategory.brandId,
        parentId: productCategory.parentId,
        createdAt: productCategory.createdAt,
      })
      .from(productCategory)
      .where(brandId ? eq(productCategory.brandId, brandId) : undefined)
      .orderBy(productCategory.name)

    return rows
  })
}

// ---------------------------------------------------------------------------
// listBrandsForSelectAction (helper local — evita cross-module import)
// ---------------------------------------------------------------------------

export async function listBrandsForCategorySelectAction() {
  return toActionResult(async () => {
    await requireSession()
    const rows = await db
      .select({ id: brand.id, name: brand.name, slug: brand.slug })
      .from(brand)
      .orderBy(brand.name)
    return rows
  })
}
