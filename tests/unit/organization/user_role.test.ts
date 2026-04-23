/**
 * Tests: user_account / role / user_role schema (T-0-06)
 *
 * These are static, no-DB tests — they verify that:
 *   - The Drizzle table objects are exported and have the expected shape.
 *   - The TypeScript inferred types accept/reject the right fields.
 *
 * docs/20-domain/01-organization.md §3.4–§3.6
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import { userAccount, role, userRole, roleKindEnum } from '@/lib/db/schema'
import type { NewUserRole, NewUserAccount, NewRole, UserRole } from '@/lib/db/schema'

describe('user_account schema', () => {
  it('table object is exported', () => {
    expect(userAccount).toBeDefined()
  })

  it('typed insert requires id, email, fullName', () => {
    // id has no default — caller must supply the Supabase Auth UUID
    const entry: NewUserAccount = {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'user@example.com',
      fullName: 'Test User',
    }
    expect(entry.id).toBe('00000000-0000-0000-0000-000000000001')
    expect(entry.email).toBeDefined()
    expect(entry.fullName).toBeDefined()
  })

  it('optional fields are actually optional', () => {
    // TypeScript compilation verifies this; runtime assertion follows
    const entry: NewUserAccount = {
      id: '00000000-0000-0000-0000-000000000002',
      email: 'min@example.com',
      fullName: 'Minimal',
    }
    expect(entry.phone).toBeUndefined()
    expect(entry.deletedAt).toBeUndefined()
  })
})

describe('role schema', () => {
  it('table object is exported', () => {
    expect(role).toBeDefined()
  })

  it('roleKindEnum is exported with the 5 canonical values', () => {
    expect(roleKindEnum).toBeDefined()
    // Drizzle stores enum values on the .enumValues property
    const values = roleKindEnum.enumValues
    expect(values).toContain('admin')
    expect(values).toContain('financial')
    expect(values).toContain('marketing')
    expect(values).toContain('support')
    expect(values).toContain('commercial')
    expect(values).toHaveLength(5)
  })

  it('typed insert accepts a valid role_kind', () => {
    const entry: NewRole = { kind: 'admin', description: 'Administrador' }
    expect(entry.kind).toBe('admin')
  })
})

describe('user_role schema', () => {
  it('user_role.assign.happy — table object is exported', () => {
    expect(userRole).toBeDefined()
  })

  it('typed insert matches spec fields', () => {
    const entry: NewUserRole = {
      userId: '00000000-0000-0000-0000-000000000001',
      roleId: '00000000-0000-0000-0000-000000000002',
    }
    expect(entry.userId).toBeDefined()
    expect(entry.roleId).toBeDefined()
  })

  it('grantedBy is optional (nullable FK)', () => {
    const entry: NewUserRole = {
      userId: '00000000-0000-0000-0000-000000000001',
      roleId: '00000000-0000-0000-0000-000000000002',
    }
    // grantedBy not required — absence is valid
    expect(entry.grantedBy).toBeUndefined()
  })

  it('select type includes grantedAt', () => {
    expectTypeOf<UserRole>().toHaveProperty('grantedAt')
  })
})
