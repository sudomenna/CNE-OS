/**
 * RBAC types — shared between matrix.ts, session.ts and permissions.ts.
 * Source of truth: docs/50-business-rules/BR-RBAC.md
 */

export type Role = 'admin' | 'financial' | 'marketing' | 'support' | 'commercial'

export type Action =
  | 'billing.view'
  | 'billing.cancel'
  | 'billing.retry'
  | 'refund.open'
  | 'refund.approve'
  | 'offer.write'
  | 'offer.condition.write'
  | 'coupon.write'
  | 'campaign.write'
  | 'creative.write'
  | 'funnel.write'
  | 'funnel.create'
  | 'funnel.manage'
  | 'funnel.close'
  | 'contact.write'
  | 'contact.merge'
  | 'contact.unmerge'
  | 'contact.impersonate'
  | 'contact.bulk_edit'
  | 'integration.configure'
  | 'webhook.reprocess'
  | 'user.write'
  | 'inbox.reply'
  | 'ticket.open'
  | 'ticket.cancel'
  | 'catalog.write'
  | 'automation.write'
  | 'automation.reprocess'
  | 'profile.write'
  | 'audit.read'
  // BR-RBAC: analytics.read — acesso aos dashboards de analytics
  | 'analytics.read'
  // BR-RBAC: transaction.manage — reemitir/cancelar NF-e (admin e financeiro com 2FA)
  | 'transaction.manage'

export type Resource =
  | { kind: 'global' }
  | { kind: 'contact'; id: string }
  | { kind: 'offer'; id: string }
  | { kind: 'transaction'; id: string }
  | { kind: 'ticket'; id: string }
  | { kind: 'campaign'; id: string }
  | { kind: 'funnel'; id: string }
  | { kind: 'catalog' }
  | { kind: 'automation'; id: string }
