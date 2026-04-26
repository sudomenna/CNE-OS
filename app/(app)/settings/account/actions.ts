'use server'

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { userAccount } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, 'Nome deve ter ao menos 2 caracteres')
    .max(200, 'Nome deve ter no máximo 200 caracteres'),
  phone: z
    .string()
    .max(30, 'Telefone deve ter no máximo 30 caracteres')
    .optional()
    .nullable(),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * updateProfileAction — atualiza nome e telefone do próprio usuário logado.
 * Guard: profile.write (todos os papéis autenticados) — BR-RBAC
 */
export async function updateProfileAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: profile.write é permitido a todos os papéis autenticados
    await requirePermission(ctx, 'profile.write', { kind: 'global' })

    const input = updateProfileSchema.parse(rawInput)

    // Busca snapshot anterior para audit
    const [before] = await db
      .select({ fullName: userAccount.fullName, phone: userAccount.phone })
      .from(userAccount)
      .where(eq(userAccount.id, ctx.user.id))
      .limit(1)

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(userAccount)
        .set({
          fullName: input.name,
          phone: input.phone ?? null,
          updatedAt: new Date(),
        })
        .where(eq(userAccount.id, ctx.user.id))
        .returning({ id: userAccount.id, fullName: userAccount.fullName, phone: userAccount.phone })

      if (!updated) {
        throw new Error('Usuário não encontrado')
      }

      // BR-AUDIT §3: audit dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'user_account',
        resourceId: ctx.user.id,
        before: { fullName: before?.fullName ?? null, phone: before?.phone ?? null },
        after: { fullName: input.name, phone: input.phone ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath('/settings/account')
    return result
  })
}
