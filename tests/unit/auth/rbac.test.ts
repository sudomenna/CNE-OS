/**
 * Tests: permission / role_permission schema + RBAC matrix (T-0-07)
 *
 * Static, no-DB tests that verify:
 *   - Drizzle table objects are exported and defined.
 *   - Inferred types accept/reject the right fields.
 *   - The MATRIX seed object is complete and correct per BR-RBAC.md Fase 1.
 *
 * docs/50-business-rules/BR-RBAC.md
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import { permission, rolePermission } from '@/lib/db/schema/rbac'
import type { NewPermission, NewRolePermission, Permission, RolePermission } from '@/lib/db/schema/rbac'
import { MATRIX } from '@/lib/db/seed/permissions'

// ---------------------------------------------------------------------------
// Schema shape tests
// ---------------------------------------------------------------------------

describe('permission schema', () => {
  it('table object is exported and defined', () => {
    expect(permission).toBeDefined()
  })

  it('typed insert requires action; requires2fa defaults to false', () => {
    const entry: NewPermission = { action: 'billing.view' }
    expect(entry.action).toBe('billing.view')
    // requires2fa is optional in insert (has DB default)
    expect(entry.requires2fa).toBeUndefined()
  })

  it('select type includes id, action, requires2fa', () => {
    expectTypeOf<Permission>().toHaveProperty('id')
    expectTypeOf<Permission>().toHaveProperty('action')
    expectTypeOf<Permission>().toHaveProperty('requires2fa')
  })
})

describe('role_permission schema', () => {
  it('table object is exported and defined', () => {
    expect(rolePermission).toBeDefined()
  })

  it('typed insert requires roleId and permissionId', () => {
    const entry: NewRolePermission = {
      roleId: '00000000-0000-0000-0000-000000000001',
      permissionId: '00000000-0000-0000-0000-000000000002',
    }
    expect(entry.roleId).toBeDefined()
    expect(entry.permissionId).toBeDefined()
  })

  it('select type includes roleId and permissionId', () => {
    expectTypeOf<RolePermission>().toHaveProperty('roleId')
    expectTypeOf<RolePermission>().toHaveProperty('permissionId')
  })
})

// ---------------------------------------------------------------------------
// MATRIX completeness tests  (BR-RBAC.md §Fase 1)
// ---------------------------------------------------------------------------

const ALL_ACTIONS = [
  'billing.view',
  'refund.open',
  'refund.approve',
  'offer.write',
  'offer.condition.write',
  'coupon.write',
  'campaign.write',
  'creative.write',
  'funnel.write',
  'contact.merge',
  'contact.unmerge',
  'contact.impersonate',
  'contact.bulk_edit',
  'integration.configure',
  'user.write',
  'inbox.reply',
  'ticket.open',
  'ticket.cancel',
] as const

const ADMIN_ACTIONS = ALL_ACTIONS // admin has every action

const FINANCIAL_ACTIONS = [
  'billing.view',
  'refund.open',
  'refund.approve',
  'contact.merge',
  'contact.unmerge',
  'contact.impersonate',
  'contact.bulk_edit',
  'inbox.reply',
  'ticket.open',
  'ticket.cancel',
] as const

describe('rbac.matrix.seed', () => {
  it('matrix covers all 18 canonical actions', () => {
    for (const action of ALL_ACTIONS) {
      expect(MATRIX).toHaveProperty(action)
    }
    expect(Object.keys(MATRIX)).toHaveLength(18)
  })

  it('every action has at least one role assigned', () => {
    for (const action of ALL_ACTIONS) {
      expect((MATRIX[action] ?? []).length).toBeGreaterThanOrEqual(1)
    }
  })

  it('admin role has all 18 actions', () => {
    for (const action of ADMIN_ACTIONS) {
      expect(MATRIX[action]).toContain('admin')
    }
  })

  it('financial role has exactly the correct 10 actions', () => {
    for (const action of FINANCIAL_ACTIONS) {
      expect(MATRIX[action]).toContain('financial')
    }
    // financial must NOT appear in actions outside its set
    const financialNegativeActions = ALL_ACTIONS.filter(
      (a) => !(FINANCIAL_ACTIONS as readonly string[]).includes(a),
    )
    for (const action of financialNegativeActions) {
      expect(MATRIX[action] ?? []).not.toContain('financial')
    }
  })

  it('refund.open and refund.approve are restricted to admin + financial', () => {
    expect(MATRIX['refund.open']).toEqual(expect.arrayContaining(['admin', 'financial']))
    expect(MATRIX['refund.open']).toHaveLength(2)
    expect(MATRIX['refund.approve']).toEqual(expect.arrayContaining(['admin', 'financial']))
    expect(MATRIX['refund.approve']).toHaveLength(2)
  })

  it('integration.configure and user.write are admin-only', () => {
    expect(MATRIX['integration.configure']).toEqual(['admin'])
    expect(MATRIX['user.write']).toEqual(['admin'])
  })

  it('contact.merge is granted to all 5 roles', () => {
    expect(MATRIX['contact.merge']).toEqual(
      expect.arrayContaining(['admin', 'financial', 'marketing', 'support', 'commercial']),
    )
    expect(MATRIX['contact.merge']).toHaveLength(5)
  })

  it('inbox.reply and ticket.open are granted to all 5 roles', () => {
    for (const action of ['inbox.reply', 'ticket.open'] as const) {
      expect(MATRIX[action]).toEqual(
        expect.arrayContaining(['admin', 'financial', 'marketing', 'support', 'commercial']),
      )
      expect(MATRIX[action]).toHaveLength(5)
    }
  })
})
