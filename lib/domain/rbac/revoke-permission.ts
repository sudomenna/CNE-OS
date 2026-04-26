/**
 * MOD-RBAC — revokePermission
 *
 * T-15-01
 * docs/50-business-rules/BR-RBAC.md
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado no DB).
 *
 * Zero I/O direto: consome tx para DB.
 */

import { and, eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { permission, rolePermission } from '@/lib/db/schema/rbac'
import { role } from '@/lib/db/schema/organization'
import { logAudit } from '@/lib/audit/log'
import { RoleNotFound, PermissionNotFound, CannotModifyAdminRole } from './errors'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type RevokePermissionParams = {
  actorUserId: string
  roleId: string
  permissionId: string
}

// ---------------------------------------------------------------------------
// revokePermission
// ---------------------------------------------------------------------------

/**
 * Revoga uma permissão de um role.
 *
 * Passos:
 * 1. Verifica que o role existe
 * 2. BR-RBAC: lança CannotModifyAdminRole se role.kind === 'admin'
 * 3. Verifica que a permission existe
 * 4. DELETE FROM role_permission WHERE roleId=... AND permissionId=... (idempotente)
 * 5. Append audit_log (action='rbac.revoke')
 *
 * @param tx           Transação DB ativa (ADR-11)
 * @param params       actorUserId, roleId, permissionId
 * @returns            void
 * @throws             RoleNotFound se role não existe
 * @throws             PermissionNotFound se permission não existe
 * @throws             CannotModifyAdminRole se role.kind === 'admin'
 */
export async function revokePermission(tx: DbTx, params: RevokePermissionParams): Promise<void> {
  const { actorUserId, roleId, permissionId } = params

  // -------------------------------------------------------------------------
  // Passo 1: verificar que o role existe
  // -------------------------------------------------------------------------
  const roleRows = await tx
    .select({ id: role.id, kind: role.kind })
    .from(role)
    .where(eq(role.id, roleId))
    .limit(1)

  const foundRole = roleRows[0]
  if (!foundRole) {
    throw new RoleNotFound(roleId)
  }

  // -------------------------------------------------------------------------
  // Passo 2: BR-RBAC — revoke em admin é sempre proibido
  // BR-RBAC: admin role cannot have permissions revoked
  // -------------------------------------------------------------------------
  if (foundRole.kind === 'admin') {
    throw new CannotModifyAdminRole(roleId)
  }

  // -------------------------------------------------------------------------
  // Passo 3: verificar que a permission existe
  // -------------------------------------------------------------------------
  const permRows = await tx
    .select({ id: permission.id })
    .from(permission)
    .where(eq(permission.id, permissionId))
    .limit(1)

  if (!permRows[0]) {
    throw new PermissionNotFound(permissionId)
  }

  // -------------------------------------------------------------------------
  // Passo 4: DELETE (idempotente — sem erro se não existia)
  // -------------------------------------------------------------------------
  await tx
    .delete(rolePermission)
    .where(and(eq(rolePermission.roleId, roleId), eq(rolePermission.permissionId, permissionId)))

  // -------------------------------------------------------------------------
  // Passo 5: Append audit_log
  // BR-RBAC §5: toda ação crítica autorizada gera linha em audit_log
  // -------------------------------------------------------------------------
  await logAudit(tx, {
    actorUserId,
    actionKind: 'other',
    resourceKind: 'role_permission',
    resourceId: roleId,
    before: {
      action: 'rbac.revoke',
      roleId,
      permissionId,
      target: `role:${roleId}/permission:${permissionId}`,
    },
  })
}
