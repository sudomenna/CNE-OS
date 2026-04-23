/**
 * Seed: permission catalogue + role_permission matrix (Fase 1)
 * Task: T-0-07
 *
 * Inserts 18 permissions and all role_permission pairs per the canonical
 * RBAC matrix in docs/50-business-rules/BR-RBAC.md.
 *
 * Safe to run multiple times — both inserts use onConflictDoNothing().
 */
import { db } from '@/lib/db/client'
import { permission, rolePermission } from '@/lib/db/schema/rbac'
import { role } from '@/lib/db/schema/organization'

// ---------------------------------------------------------------------------
// Canonical action catalogue — BR-RBAC.md Fase 1
// ---------------------------------------------------------------------------

const ACTIONS = [
  { action: 'billing.view', requires_2fa: false },
  { action: 'refund.open', requires_2fa: true },
  { action: 'refund.approve', requires_2fa: true },
  { action: 'offer.write', requires_2fa: true },
  { action: 'offer.condition.write', requires_2fa: false },
  { action: 'coupon.write', requires_2fa: false },
  { action: 'campaign.write', requires_2fa: false },
  { action: 'creative.write', requires_2fa: false },
  { action: 'funnel.write', requires_2fa: false },
  { action: 'contact.merge', requires_2fa: false },
  { action: 'contact.unmerge', requires_2fa: true },
  { action: 'contact.impersonate', requires_2fa: true },
  { action: 'contact.bulk_edit', requires_2fa: true },
  { action: 'integration.configure', requires_2fa: true },
  { action: 'user.write', requires_2fa: true },
  { action: 'inbox.reply', requires_2fa: false },
  { action: 'ticket.open', requires_2fa: false },
  { action: 'ticket.cancel', requires_2fa: false },
] as const

// ---------------------------------------------------------------------------
// Permission matrix: action → role_kind[]  (BR-RBAC.md §Fase 1)
// ---------------------------------------------------------------------------

export const MATRIX: Record<string, string[]> = {
  'billing.view':           ['admin', 'financial', 'commercial'],
  'refund.open':            ['admin', 'financial'],
  'refund.approve':         ['admin', 'financial'],
  'offer.write':            ['admin', 'commercial'],
  'offer.condition.write':  ['admin', 'marketing', 'commercial'],
  'coupon.write':           ['admin', 'commercial'],
  'campaign.write':         ['admin', 'marketing', 'commercial'],
  'creative.write':         ['admin', 'marketing'],
  'funnel.write':           ['admin', 'marketing', 'commercial'],
  'contact.merge':          ['admin', 'financial', 'marketing', 'support', 'commercial'],
  'contact.unmerge':        ['admin', 'financial'],
  'contact.impersonate':    ['admin', 'financial', 'support', 'commercial'],
  'contact.bulk_edit':      ['admin', 'financial', 'support', 'commercial'],
  'integration.configure':  ['admin'],
  'user.write':             ['admin'],
  'inbox.reply':            ['admin', 'financial', 'marketing', 'support', 'commercial'],
  'ticket.open':            ['admin', 'financial', 'marketing', 'support', 'commercial'],
  'ticket.cancel':          ['admin', 'financial', 'support', 'commercial'],
}

// ---------------------------------------------------------------------------
// seedPermissions
// ---------------------------------------------------------------------------

export async function seedPermissions() {
  // 1. Insert all 18 permissions (idempotent)
  await db
    .insert(permission)
    .values(
      ACTIONS.map((a) => ({
        action: a.action,
        requires2fa: a.requires_2fa,
      })),
    )
    .onConflictDoNothing()

  // 2. Fetch role ids keyed by kind
  const roles = await db.select({ id: role.id, kind: role.kind }).from(role)
  const roleByKind: Record<string, string> = Object.fromEntries(
    roles.map((r) => [r.kind, r.id]),
  )

  // 3. Fetch permission ids keyed by action (covers rows that already existed)
  const allPerms = await db
    .select({ id: permission.id, action: permission.action })
    .from(permission)
  const permByAction: Record<string, string> = Object.fromEntries(
    allPerms.map((p) => [p.action, p.id]),
  )

  // 4. Build and insert role_permission pairs (idempotent)
  const pairs: { roleId: string; permissionId: string }[] = []
  for (const [action, roleKinds] of Object.entries(MATRIX)) {
    for (const kind of roleKinds) {
      const roleId = roleByKind[kind]
      const permissionId = permByAction[action]
      if (roleId && permissionId) {
        pairs.push({ roleId, permissionId })
      }
    }
  }

  if (pairs.length > 0) {
    await db.insert(rolePermission).values(pairs).onConflictDoNothing()
  }
}
