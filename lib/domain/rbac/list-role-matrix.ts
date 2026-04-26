/**
 * MOD-RBAC — listRoleMatrix
 *
 * T-15-01
 * docs/50-business-rules/BR-RBAC.md
 *
 * ADR-10: lança DomainError, nunca retorna Result<T,E>.
 * ADR-11: função de leitura pura — usa db singleton (sem tx).
 *
 * Zero I/O direto: consome db singleton para consulta.
 */

import { db } from '@/lib/db/client'
import { permission, rolePermission } from '@/lib/db/schema/rbac'
import { role } from '@/lib/db/schema/organization'

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type RoleMatrixRole = {
  id: string
  kind: string
  name: string | null
}

export type RoleMatrixPermission = {
  id: string
  action: string
  requires2fa: boolean
}

export type RoleMatrixAssignment = {
  roleId: string
  permissionId: string
}

export type RoleMatrix = {
  roles: RoleMatrixRole[]
  permissions: RoleMatrixPermission[]
  assignments: RoleMatrixAssignment[]
}

// ---------------------------------------------------------------------------
// listRoleMatrix
// ---------------------------------------------------------------------------

/**
 * Retorna a matriz completa de roles × permissions + assignments actuais.
 *
 * Função de leitura pura — não recebe tx (ADR-11: read-only usa db singleton).
 *
 * @returns RoleMatrix com roles, permissions e assignments actuais do banco
 */
export async function listRoleMatrix(): Promise<RoleMatrix> {
  const [roles, permissions, assignments] = await Promise.all([
    db.select({ id: role.id, kind: role.kind, name: role.description }).from(role),
    db.select({ id: permission.id, action: permission.action, requires2fa: permission.requires2fa }).from(permission),
    db.select({ roleId: rolePermission.roleId, permissionId: rolePermission.permissionId }).from(rolePermission),
  ])

  return {
    roles: roles.map((r) => ({ id: r.id, kind: r.kind, name: r.name })),
    permissions,
    assignments,
  }
}
