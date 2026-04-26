'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { requireSession } from '@/lib/auth/session'
import { toActionResult, type ActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'
import { grantPermission, revokePermission, listRoleMatrix } from '@/lib/domain/rbac'
import type { RoleMatrix } from '@/lib/domain/rbac'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const permissionMutationSchema = z.object({
  roleId: z.string().uuid('roleId deve ser UUID'),
  permissionId: z.string().uuid('permissionId deve ser UUID'),
})

// ---------------------------------------------------------------------------
// Guard helper
// ---------------------------------------------------------------------------

/**
 * Verificação RBAC para gerenciamento da matriz de permissões.
 *
 * BR-RBAC: não há Action específica para 'rbac.manage' na matriz canônica.
 * Registrado como OQ-RBAC-MANAGE-01 em docs/90-meta/03-open-questions-log.md.
 * Fallback: somente admin pode alterar a matriz (equivale a user.write em severidade).
 *
 * Se 'rbac.manage' for adicionada à matriz no futuro, substituir este guard
 * por requirePermission(ctx, 'rbac.manage', { kind: 'global' }).
 */
async function requireRbacAdmin(ctx: Awaited<ReturnType<typeof requireSession>>): Promise<void> {
  // BR-RBAC: somente admin pode gerenciar a matriz role × permission
  if (ctx.user.role !== 'admin') {
    throw new ActionError('UNAUTHORIZED', 'Apenas administradores podem gerenciar permissões', {
      rule: 'BR-RBAC',
    })
  }
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * grantPermissionAction — concede uma permission a um role.
 *
 * Guard: admin apenas (BR-RBAC — ver nota em requireRbacAdmin, OQ-RBAC-MANAGE-01).
 * Audit: gerado pelo domínio grantPermission() internamente.
 */
export async function grantPermissionAction(rawInput: unknown): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: somente admin gerencia matriz de permissões (OQ-RBAC-MANAGE-01)
    await requireRbacAdmin(ctx)

    const input = permissionMutationSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      await grantPermission(tx, {
        actorUserId: ctx.user.id,
        roleId: input.roleId,
        permissionId: input.permissionId,
      })
    })

    revalidatePath('/settings/permissions')
  })
}

/**
 * revokePermissionAction — revoga uma permission de um role.
 *
 * Guard: admin apenas (BR-RBAC — ver nota em requireRbacAdmin, OQ-RBAC-MANAGE-01).
 * Audit: gerado pelo domínio revokePermission() internamente.
 * Lança BUSINESS_RULE_VIOLATED se tentar revogar do role admin (CannotModifyAdminRole).
 */
export async function revokePermissionAction(rawInput: unknown): Promise<ActionResult<void>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: somente admin gerencia matriz de permissões (OQ-RBAC-MANAGE-01)
    await requireRbacAdmin(ctx)

    const input = permissionMutationSchema.parse(rawInput)

    await db.transaction(async (tx) => {
      await revokePermission(tx, {
        actorUserId: ctx.user.id,
        roleId: input.roleId,
        permissionId: input.permissionId,
      })
    })

    revalidatePath('/settings/permissions')
  })
}

/**
 * getRoleMatrixAction — retorna a matriz completa de roles × permissions.
 *
 * Leitura — sem audit (BR-AUDIT §3).
 * Guard: admin apenas (mesma restrição que mutações).
 */
export async function getRoleMatrixAction(): Promise<ActionResult<RoleMatrix>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    // BR-RBAC: somente admin pode visualizar a matriz de permissões
    await requireRbacAdmin(ctx)

    return listRoleMatrix()
  })
}
