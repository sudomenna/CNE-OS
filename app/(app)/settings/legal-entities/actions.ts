'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { legalEntity, brandLegalEntity, brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const createLegalEntitySchema = z.object({
  cnpj: z
    .string()
    .length(14, 'CNPJ deve ter exatamente 14 dígitos numéricos')
    .regex(/^\d{14}$/, 'CNPJ deve conter somente dígitos'),
  companyName: z
    .string()
    .min(2, 'Razão social deve ter ao menos 2 caracteres')
    .max(200, 'Razão social muito longa'),
  tradeName: z.string().max(200, 'Nome fantasia muito longo').optional(),
  brandId: z.string().uuid('ID de marca inválido'),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * createLegalEntity — cria entidade fiscal e vincula à marca informada.
 * Guard: user.write (admin + 2FA) — BR-RBAC
 * INV-ORG-02: CNPJ com 14 dígitos numéricos (enforced pelo CHECK do DB e Zod aqui)
 */
export async function createLegalEntity(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: user.write exige admin com 2FA
    await requirePermission(ctx, 'user.write', { kind: 'global' })

    const input = createLegalEntitySchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      // Insere entidade fiscal
      const [created] = await tx
        .insert(legalEntity)
        .values({
          cnpj: input.cnpj,
          companyName: input.companyName,
          tradeName: input.tradeName ?? null,
        })
        .returning()

      // Vincula à marca (is_default = false por padrão — admin promove manualmente)
      await tx.insert(brandLegalEntity).values({
        brandId: input.brandId,
        legalEntityId: created!.id,
        isDefault: false,
      })

      // BR-AUDIT §3: audit dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'legal_entity',
        resourceId: created!.id,
        before: {},
        after: {
          cnpj: input.cnpj,
          companyName: input.companyName,
          brandId: input.brandId,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created!
    })

    revalidatePath('/settings/legal-entities')
    return result
  })
}

/**
 * listLegalEntities — lista todas as entidades fiscais com a marca associada.
 * Leitura — sem audit (BR-AUDIT §3).
 */
export async function listLegalEntities() {
  return toActionResult(async () => {
    await requireSession()

    const rows = await db
      .select({
        id: legalEntity.id,
        cnpj: legalEntity.cnpj,
        companyName: legalEntity.companyName,
        tradeName: legalEntity.tradeName,
        createdAt: legalEntity.createdAt,
        brandId: brandLegalEntity.brandId,
        isDefault: brandLegalEntity.isDefault,
        brandName: brand.name,
        brandSlug: brand.slug,
      })
      .from(legalEntity)
      .leftJoin(brandLegalEntity, eq(brandLegalEntity.legalEntityId, legalEntity.id))
      .leftJoin(brand, eq(brand.id, brandLegalEntity.brandId))
      .orderBy(legalEntity.companyName)

    return rows
  })
}

/**
 * listBrandsForSelect — retorna marcas ativas para o select do formulário.
 */
export async function listBrandsForSelect() {
  return toActionResult(async () => {
    await requireSession()
    const rows = await db
      .select({ id: brand.id, name: brand.name, slug: brand.slug })
      .from(brand)
      .orderBy(brand.name)
    return rows // brand.deletedAt não projetado nessa query — Sprint 0 retorna todos
  })
}
