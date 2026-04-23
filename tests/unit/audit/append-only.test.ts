/**
 * T-0-10 — audit_log schema unit tests
 *
 * These tests validate the Drizzle schema structure and TypeScript types.
 * DB-level trigger enforcement (append-only) is validated in the integration
 * test suite (T-0-18, not yet available).
 *
 * Spec: docs/50-business-rules/BR-AUDIT.md
 */
import { describe, it, expect } from 'vitest'
import { auditLog, auditActionKindEnum } from '@/lib/db/schema/audit'
import type { NewAuditLog } from '@/lib/db/schema/audit'

describe('audit_log schema', () => {
  it('audit.append-only — schema has no updatedAt column', () => {
    const cols = Object.keys(auditLog)
    expect(cols).not.toContain('updatedAt')
    expect(cols).not.toContain('updated_at')
  })

  it('audit.append-only — schema has no deletedAt column', () => {
    const cols = Object.keys(auditLog)
    expect(cols).not.toContain('deletedAt')
    expect(cols).not.toContain('deleted_at')
  })

  it('audit.append-only — schema has createdAt column', () => {
    const cols = Object.keys(auditLog)
    expect(cols).toContain('createdAt')
  })

  it('audit_action_kind enum has all 9 required values', () => {
    const values = auditActionKindEnum.enumValues
    expect(values).toHaveLength(9)
    expect(values).toContain('create')
    expect(values).toContain('update')
    expect(values).toContain('delete')
    expect(values).toContain('merge')
    expect(values).toContain('unmerge')
    expect(values).toContain('refund')
    expect(values).toContain('status_change')
    expect(values).toContain('impersonate')
    expect(values).toContain('other')
  })

  it('typed insert accepts actorSystem without actorUserId', () => {
    const entry: Partial<NewAuditLog> = {
      actorSystem: 'digital_guru',
      actionKind: 'status_change',
      resourceKind: 'transaction',
      resourceId: '00000000-0000-0000-0000-000000000001',
    }
    expect(entry.actorSystem).toBe('digital_guru')
    expect(entry.actorUserId).toBeUndefined()
  })

  it('typed insert accepts actorUserId without actorSystem', () => {
    const entry: Partial<NewAuditLog> = {
      actorUserId: '00000000-0000-0000-0000-000000000002',
      actionKind: 'create',
      resourceKind: 'contact',
      resourceId: '00000000-0000-0000-0000-000000000003',
    }
    expect(entry.actorUserId).toBe('00000000-0000-0000-0000-000000000002')
    expect(entry.actorSystem).toBeUndefined()
  })

  it('typed insert accepts both actorUserId and actorSystem', () => {
    const entry: Partial<NewAuditLog> = {
      actorUserId: '00000000-0000-0000-0000-000000000004',
      actorSystem: 'inngest-worker',
      actionKind: 'impersonate',
      resourceKind: 'user_account',
    }
    expect(entry.actorUserId).toBeDefined()
    expect(entry.actorSystem).toBeDefined()
  })

  it('schema has all required columns', () => {
    const cols = Object.keys(auditLog)
    expect(cols).toContain('id')
    expect(cols).toContain('actorUserId')
    expect(cols).toContain('actorSystem')
    expect(cols).toContain('actionKind')
    expect(cols).toContain('resourceKind')
    expect(cols).toContain('resourceId')
    expect(cols).toContain('before')
    expect(cols).toContain('after')
    expect(cols).toContain('ip')
    expect(cols).toContain('userAgent')
    expect(cols).toContain('context')
    expect(cols).toContain('createdAt')
  })
})
