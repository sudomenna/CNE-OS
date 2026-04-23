/**
 * RBAC matrix — função pura, zero I/O, zero imports de DB.
 * Fonte canônica: docs/50-business-rules/BR-RBAC.md §Tabela de decisão
 */
import type { Action, Resource, Role } from '@/lib/auth/rbac/types'

type MatrixEntry = {
  roles: Role[]
  requires2fa: boolean
}

// BR-RBAC: matriz canônica declarativa — alterações aqui requerem atualização de BR-RBAC.md
export const RBAC_MATRIX: Record<Action, MatrixEntry> = {
  'billing.view':          { roles: ['admin', 'financial', 'commercial'],                             requires2fa: false },
  'refund.open':           { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'refund.approve':        { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'offer.write':           { roles: ['admin', 'commercial'],                                          requires2fa: true  },
  'offer.condition.write': { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  'coupon.write':          { roles: ['admin', 'commercial'],                                          requires2fa: false },
  'campaign.write':        { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  'creative.write':        { roles: ['admin', 'marketing'],                                           requires2fa: false },
  'funnel.write':          { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  'contact.merge':         { roles: ['admin', 'financial', 'marketing', 'support', 'commercial'],     requires2fa: false },
  'contact.unmerge':       { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'contact.impersonate':   { roles: ['admin', 'financial', 'support', 'commercial'],                  requires2fa: true  },
  'contact.bulk_edit':     { roles: ['admin', 'financial', 'support', 'commercial'],                  requires2fa: true  },
  'integration.configure': { roles: ['admin'],                                                        requires2fa: true  },
  'user.write':            { roles: ['admin'],                                                        requires2fa: true  },
  'inbox.reply':           { roles: ['admin', 'financial', 'marketing', 'support', 'commercial'],     requires2fa: false },
  'ticket.open':           { roles: ['admin', 'financial', 'marketing', 'support', 'commercial'],     requires2fa: false },
  'ticket.cancel':         { roles: ['admin', 'financial', 'support', 'commercial'],                  requires2fa: false },
}

/**
 * can() — verifica se um usuário tem autorização para executar uma ação sobre um recurso.
 *
 * Função pura: zero I/O, zero estado externo.
 * BR-RBAC: a decisão consulta RBAC_MATRIX, não condicionais por role.
 */
export function can(
  user: { role: Role; has2fa: boolean; twoFactorRecentlyVerified: boolean },
  action: Action,
  _resource: Resource,
): boolean {
  const entry = RBAC_MATRIX[action]
  // CT-AUTH-07: ação inexistente na matriz retorna false
  if (!entry) return false

  // BR-RBAC §1: papel do usuário deve estar na lista de papéis autorizados
  if (!entry.roles.includes(user.role)) return false

  // BR-RBAC §4: ações críticas exigem 2FA fresh (≤ 5 min)
  if (entry.requires2fa && !(user.has2fa && user.twoFactorRecentlyVerified)) return false

  return true
}
