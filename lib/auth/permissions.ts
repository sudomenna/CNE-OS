/**
 * requirePermission() — guard de autorização para Server Actions.
 * Spec: docs/10-architecture/06-auth-rbac-audit.md §2.2
 * BR-RBAC: docs/50-business-rules/BR-RBAC.md
 */
import { can } from '@/lib/auth/rbac/matrix'
import { ActionError } from '@/lib/actions/errors'
import type { SessionContext } from '@/lib/auth/session'
import type { Action, Resource } from '@/lib/auth/rbac/types'

// Re-export para consumidores que importam tudo de permissions.ts
export { can } from '@/lib/auth/rbac/matrix'

/**
 * Lança ActionError('UNAUTHORIZED') se o usuário da sessão não tem permissão.
 * Deve ser chamado ANTES de qualquer mutação em Server Actions críticas.
 *
 * BR-RBAC: consulta RBAC_MATRIX via can(); nunca compara role diretamente.
 */
export async function requirePermission(
  ctx: SessionContext,
  action: Action,
  resource: Resource,
): Promise<void> {
  // BR-RBAC: verificação de autorização declarativa via matriz
  if (!can(ctx.user, action, resource)) {
    throw new ActionError('UNAUTHORIZED', `denied: ${action}`, { rule: 'BR-RBAC' })
  }
}
