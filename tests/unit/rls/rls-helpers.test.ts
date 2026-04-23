import { describe, it, expect } from 'vitest'
import { isRlsEnabled, RLS_ENABLED_TABLES, RlsPolicyError } from '@/lib/db/rls-helpers'

describe('rls-helpers', () => {
  it('RLS_ENABLED_TABLES has exactly 11 Fase 1 tables', () => {
    expect(RLS_ENABLED_TABLES).toHaveLength(11)
  })

  it('isRlsEnabled returns true for all 11 Fase 1 tables', () => {
    for (const table of RLS_ENABLED_TABLES) {
      expect(isRlsEnabled(table)).toBe(true)
    }
  })

  it('isRlsEnabled returns true for specific known tables', () => {
    expect(isRlsEnabled('brand')).toBe(true)
    expect(isRlsEnabled('legal_entity')).toBe(true)
    expect(isRlsEnabled('brand_legal_entity')).toBe(true)
    expect(isRlsEnabled('user_account')).toBe(true)
    expect(isRlsEnabled('role')).toBe(true)
    expect(isRlsEnabled('user_role')).toBe(true)
    expect(isRlsEnabled('permission')).toBe(true)
    expect(isRlsEnabled('role_permission')).toBe(true)
    expect(isRlsEnabled('audit_log')).toBe(true)
    expect(isRlsEnabled('timeline_event')).toBe(true)
    expect(isRlsEnabled('webhook_log')).toBe(true)
  })

  it('isRlsEnabled returns false for tables not yet in Fase 1', () => {
    // contact, transaction, entitlement, offer are Fase 2
    expect(isRlsEnabled('contact')).toBe(false)
    expect(isRlsEnabled('transaction')).toBe(false)
    expect(isRlsEnabled('entitlement')).toBe(false)
    expect(isRlsEnabled('offer')).toBe(false)
  })

  it('isRlsEnabled returns false for unknown / empty strings', () => {
    expect(isRlsEnabled('')).toBe(false)
    expect(isRlsEnabled('nonexistent_table')).toBe(false)
  })

  it('RlsPolicyError has correct name, table and operation', () => {
    const err = new RlsPolicyError('brand', 'SELECT')
    expect(err.name).toBe('RlsPolicyError')
    expect(err.table).toBe('brand')
    expect(err.operation).toBe('SELECT')
    expect(err.message).toContain('brand')
    expect(err.message).toContain('SELECT')
  })

  it('RlsPolicyError is an instance of Error', () => {
    const err = new RlsPolicyError('audit_log', 'DELETE')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(RlsPolicyError)
  })

  it('RlsPolicyError works for all operation kinds', () => {
    const ops = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'] as const
    for (const op of ops) {
      const err = new RlsPolicyError('user_account', op)
      expect(err.operation).toBe(op)
      expect(err.message).toContain(op)
    }
  })
})
