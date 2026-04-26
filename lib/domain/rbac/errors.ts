/**
 * MOD-RBAC — Typed domain errors
 *
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 * Hierarquia: RbacDomainError → NotFoundError | BusinessRuleViolation
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export class RbacDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RbacDomainError'
  }
}

// ---------------------------------------------------------------------------
// NotFoundError — entidade não encontrada
// ---------------------------------------------------------------------------

/**
 * Lançado quando o role solicitado não é encontrado.
 * ADR-10: NotFoundError
 */
export class RoleNotFound extends RbacDomainError {
  readonly roleId: string

  constructor(roleId: string) {
    super(`role ${roleId} not found`)
    this.name = 'RoleNotFound'
    this.roleId = roleId
  }
}

/**
 * Lançado quando a permission solicitada não é encontrada.
 * ADR-10: NotFoundError
 */
export class PermissionNotFound extends RbacDomainError {
  readonly permissionId: string

  constructor(permissionId: string) {
    super(`permission ${permissionId} not found`)
    this.name = 'PermissionNotFound'
    this.permissionId = permissionId
  }
}

// ---------------------------------------------------------------------------
// BusinessRuleViolation — mutação proibida em role admin
// ---------------------------------------------------------------------------

/**
 * Lançado quando se tenta revogar permissão do role admin.
 * BR-RBAC: admin tem todas as permissões implicitamente; revoke é proibido.
 * ADR-10: BusinessRuleViolation
 */
export class CannotModifyAdminRole extends RbacDomainError {
  readonly roleId: string

  constructor(roleId: string) {
    super(
      `BR-RBAC: cannot revoke permissions from admin role (${roleId}) — ` +
        `admin has all permissions implicitly`,
    )
    this.name = 'CannotModifyAdminRole'
    this.roleId = roleId
  }
}
