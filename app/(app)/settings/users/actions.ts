'use server'

import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import {
  userAccount,
  userRole,
  role,
  roleKindEnum,
} from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'
import { createSupabaseServiceClient } from '@/lib/auth/supabase-server'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const inviteUserSchema = z.object({
  email: z.string().email('E-mail inválido'),
  fullName: z.string().min(2, 'Nome completo deve ter ao menos 2 caracteres').max(200),
  roleKind: z.enum(roleKindEnum.enumValues, {
    errorMap: () => ({ message: 'Papel inválido' }),
  }),
})

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * inviteUser — convida novo usuário interno via Supabase Admin API.
 * Guard: user.write (admin + 2FA) — BR-RBAC
 *
 * Sprint 0: cria user_account provisório com UUID gerado localmente.
 * O ID real (auth.users.id) é sincronizado no primeiro login via callback.
 */
export async function inviteUser(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: user.write exige admin com 2FA
    await requirePermission(ctx, 'user.write', { kind: 'global' })

    const input = inviteUserSchema.parse(rawInput)

    // Busca o role_id correspondente ao roleKind
    const roleRows = await db
      .select({ id: role.id })
      .from(role)
      .where(eq(role.kind, input.roleKind))
      .limit(1)

    const targetRole = roleRows[0]
    if (!targetRole) {
      throw new Error(`Role '${input.roleKind}' não encontrado no catálogo. Verifique o seed.`)
    }

    // Convida via Supabase Admin API
    const supabase = await createSupabaseServiceClient()
    const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      input.email,
      {
        data: {
          full_name: input.fullName,
          role_kind: input.roleKind,
        },
      },
    )

    if (inviteError) {
      throw new Error(`Falha ao enviar convite: ${inviteError.message}`)
    }

    // Sprint 0: usa auth.users.id se disponível; caso contrário UUID provisório
    // O id real é sincronizado no primeiro login (auth callback)
    const userId = inviteData?.user?.id ?? crypto.randomUUID()

    const result = await db.transaction(async (tx) => {
      // Upsert de user_account (provisório — id pode ser substituído no login)
      const [created] = await tx
        .insert(userAccount)
        .values({
          id: userId,
          email: input.email,
          fullName: input.fullName,
          isActive: true,
        })
        .onConflictDoNothing()
        .returning()

      const accountId = created?.id ?? userId

      // Atribui papel
      await tx
        .insert(userRole)
        .values({
          userId: accountId,
          roleId: targetRole.id,
          grantedBy: ctx.user.id,
        })
        .onConflictDoNothing()

      // BR-AUDIT §3: audit dentro da mesma transação
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'user_account',
        resourceId: accountId,
        before: {},
        after: {
          email: input.email,
          fullName: input.fullName,
          roleKind: input.roleKind,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { id: accountId, email: input.email, fullName: input.fullName }
    })

    revalidatePath('/settings/users')
    return result
  })
}

/**
 * listUsers — lista usuários com seus papéis.
 * Leitura — sem audit (BR-AUDIT §3).
 */
export async function listUsers() {
  return toActionResult(async () => {
    await requireSession()

    const rows = await db
      .select({
        id: userAccount.id,
        email: userAccount.email,
        fullName: userAccount.fullName,
        isActive: userAccount.isActive,
        createdAt: userAccount.createdAt,
        deletedAt: userAccount.deletedAt,
        roleKind: role.kind,
      })
      .from(userAccount)
      .leftJoin(userRole, eq(userRole.userId, userAccount.id))
      .leftJoin(role, eq(role.id, userRole.roleId))
      .orderBy(userAccount.fullName)

    // Filtra usuários excluídos (soft-delete)
    return rows.filter((u) => u.deletedAt === null)
  })
}
