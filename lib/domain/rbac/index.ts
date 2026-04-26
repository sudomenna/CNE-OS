/**
 * MOD-RBAC — Interface pública do módulo
 *
 * T-15-01
 * Alinhado com docs/30-contracts/07-module-interfaces.md §MOD-RBAC (a ser documentado em T-15-06)
 *
 * ADR-10: funções retornam Promise<T> e lançam DomainError.
 * ADR-11: funções mutativas recebem tx: DbTx como primeiro argumento.
 */

// Concessão de permissão a role
export { grantPermission } from './grant-permission'
export type { GrantPermissionParams } from './grant-permission'

// Revogação de permissão de role
export { revokePermission } from './revoke-permission'
export type { RevokePermissionParams } from './revoke-permission'

// Listagem da matriz role × permission
export { listRoleMatrix } from './list-role-matrix'
export type { RoleMatrix, RoleMatrixRole, RoleMatrixPermission, RoleMatrixAssignment } from './list-role-matrix'

// Erros tipados (ADR-10)
export { RbacDomainError, RoleNotFound, PermissionNotFound, CannotModifyAdminRole } from './errors'
