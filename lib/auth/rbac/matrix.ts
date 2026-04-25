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
  // BR-RBAC: billing.cancel — cancelar assinatura (admin e financial com 2FA)
  'billing.cancel':        { roles: ['admin', 'financial'],                                           requires2fa: true  },
  // BR-RBAC: billing.retry — retry manual de parcela vencida (admin e financial com 2FA)
  'billing.retry':         { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'refund.open':           { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'refund.approve':        { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'offer.write':           { roles: ['admin', 'commercial'],                                          requires2fa: true  },
  'offer.condition.write': { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  'coupon.write':          { roles: ['admin', 'commercial'],                                          requires2fa: false },
  'campaign.write':        { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  'creative.write':        { roles: ['admin', 'marketing'],                                           requires2fa: false },
  'funnel.write':          { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  // BR-RBAC: funnel.create — criar funis e estágios (admin, marketing configura; commercial opera)
  'funnel.create':         { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  // BR-RBAC: funnel.manage — movimentar oportunidades, alterar estágio e label; metas
  'funnel.manage':         { roles: ['admin', 'marketing', 'commercial'],                             requires2fa: false },
  // BR-RBAC: funnel.close — marcar oportunidade como won ou lost (comercial + admin)
  'funnel.close':          { roles: ['admin', 'commercial'],                                          requires2fa: false },
  'contact.write':         { roles: ['admin', 'financial', 'marketing', 'support', 'commercial'],     requires2fa: false },
  'contact.merge':         { roles: ['admin', 'financial', 'marketing', 'support', 'commercial'],     requires2fa: false },
  'contact.unmerge':       { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'contact.impersonate':   { roles: ['admin', 'financial', 'support', 'commercial'],                  requires2fa: true  },
  'contact.bulk_edit':     { roles: ['admin', 'financial', 'support', 'commercial'],                  requires2fa: true  },
  'integration.configure': { roles: ['admin'],                                                        requires2fa: true  },
  // BR-RBAC: webhook.reprocess — reprocessar webhook DLQ pode disparar venda/entitlement (FLOW-12)
  'webhook.reprocess':     { roles: ['admin', 'financial'],                                           requires2fa: true  },
  'user.write':            { roles: ['admin'],                                                        requires2fa: true  },
  'inbox.reply':           { roles: ['admin', 'financial', 'marketing', 'support', 'commercial'],     requires2fa: false },
  'ticket.open':           { roles: ['admin', 'financial', 'marketing', 'support', 'commercial'],     requires2fa: false },
  'ticket.cancel':         { roles: ['admin', 'financial', 'support', 'commercial'],                  requires2fa: false },
  // BR-RBAC: catalog.write — criar/arquivar produtos, categorias e benefícios (admin e marketing)
  'catalog.write':         { roles: ['admin', 'marketing'],                                           requires2fa: false },
  // BR-RBAC: automation.write — criar/editar/publicar/despublicar/deletar fluxos de automação
  // Commercial não opera automações (operações de configuração de fluxo = admin e marketing)
  'automation.write':      { roles: ['admin', 'marketing'],                                           requires2fa: false },
  // BR-RBAC: automation.reprocess — reenfileirar execução com falha na DLQ (admin)
  'automation.reprocess':  { roles: ['admin'],                                                        requires2fa: false },
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
