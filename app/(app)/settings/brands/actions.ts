'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const createBrandSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').max(100, 'Nome muito longo'),
  slug: z
    .string()
    .min(2, 'Slug deve ter ao menos 2 caracteres')
    .max(60, 'Slug muito longo')
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Slug deve ser kebab-case (letras minúsculas, números e hífens)'),
  primaryColor: z.string().optional(),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * createBrand — cria uma nova marca.
 * Guard: user.write (admin + 2FA) — BR-RBAC
 */
export async function createBrand(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: user.write exige admin com 2FA
    await requirePermission(ctx, 'user.write', { kind: 'global' })

    const input = createBrandSchema.parse(rawInput)

    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(brand)
        .values({
          name: input.name,
          slug: input.slug,
          primaryColor: input.primaryColor ?? null,
        })
        .returning()

      // BR-AUDIT §3: audit dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'brand',
        resourceId: created!.id,
        before: {},
        after: { name: input.name, slug: input.slug },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created!
    })

    revalidatePath('/settings/brands')
    return result
  })
}

/**
 * listBrands — lista todas as marcas ativas (sem soft-delete).
 * Leitura — sem audit (BR-AUDIT §3).
 */
export async function listBrands() {
  return toActionResult(async () => {
    await requireSession()
    const rows = await db
      .select()
      .from(brand)
      .orderBy(brand.name)
    // Filtra soft-deleted em memória (deletedAt IS NULL = ativa)
    return rows.filter((b) => b.deletedAt === null)
  })
}
