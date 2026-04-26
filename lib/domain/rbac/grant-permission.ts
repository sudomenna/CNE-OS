/**
 * MOD-RBAC — grantPermission
 *
 * T-15-01
 * docs/50-business-rules/BR-RBAC.md
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado no DB).
 *
 * Zero I/O direto: consome tx para DB.
 */

import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { permission, rolePermission } from '@/lib/db/schema/rbac'
import { role } from '@/lib/db/schema/organization'
import { logAudit } from '@/lib/audit/log'
import { RoleNotFound, PermissionNotFound } from './errors'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type GrantPermissionParams = {
  actorUserId: string
  roleId: string
  permissionId: string
}

// ---------------------------------------------------------------------------
// grantPermission
// ---------------------------------------------------------------------------

/**
 * Concede uma permissão a um role.
 *
 * Passos:
 * 1. Verifica que o role existe
 * 2. Verifica que a permission existe
 * 3. BR-RBAC: se role.kind === 'admin', é no-op silencioso (admin já tem tudo)
 * 4. INSERT INTO role_permission ON CONFLICT DO NOTHING (idempotente)
 * 5. Append audit_log (action='rbac.grant')
 *
 * @param tx           Transação DB ativa (ADR-11)
 * @param params       actorUserId, roleId, permissionId
 * @returns            void
 * @throws             RoleNotFound se role não existe
 * @throws             PermissionNotFound se permission não existe
 */
export async function grantPermission(tx: DbTx, params: GrantPermissionParams): Promise<void> {
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
  // Passo 2: verificar que a permission existe
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
  // Passo 3: BR-RBAC — grant em admin é no-op silencioso
  // Admin tem todas as permissões implicitamente; grant é idempotente/no-op.
  // -------------------------------------------------------------------------
  // BR-RBAC: admin role has all permissions implicitly; grant is a no-op
  if (foundRole.kind === 'admin') {
    return
  }

  // -------------------------------------------------------------------------
  // Passo 4: INSERT ON CONFLICT DO NOTHING (idempotente)
  // -------------------------------------------------------------------------
  await tx.insert(rolePermission).values({ roleId, permissionId }).onConflictDoNothing()

  // -------------------------------------------------------------------------
  // Passo 5: Append audit_log
  // BR-RBAC §5: toda ação crítica autorizada gera linha em audit_log
  // -------------------------------------------------------------------------
  await logAudit(tx, {
    actorUserId,
    actionKind: 'other',
    resourceKind: 'role_permission',
    resourceId: roleId,
    after: {
      action: 'rbac.grant',
      roleId,
      permissionId,
      target: `role:${roleId}/permission:${permissionId}`,
    },
  })
}
