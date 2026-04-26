'use server'

import { db } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { toActionResult } from '@/lib/actions/result'
import { isNull } from 'drizzle-orm'

/**
 * listBrandsForSwitcher — retorna lista de marcas ativas para o Brand Switcher da topbar.
 * Não filtra por usuário — brand_id é para contexto fiscal, não RBAC.
 * Leitura — sem audit (BR-AUDIT §3).
 */
export async function listBrandsForSwitcher(): Promise<
  { ok: true; data: { id: string; name: string }[] } | { ok: false; error: { code: string; message: string; correlationId: string } }
> {
  return toActionResult(async () => {
    await requireSession()

    const rows = await db
      .select({ id: brand.id, name: brand.name })
      .from(brand)
      .where(isNull(brand.deletedAt))
      .orderBy(brand.name)

    return rows
  })
}
