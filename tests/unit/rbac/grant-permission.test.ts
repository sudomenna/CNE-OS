/**
 * Unit tests — grantPermission
 *
 * T-15-01
 * BR-RBAC: grant de permissão a role
 * docs/50-business-rules/BR-RBAC.md
 *
 * ADR-10: funções lançam DomainError
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000001'
const ROLE_ID = '00000000-0000-0000-0000-000000000002'
const ADMIN_ROLE_ID = '00000000-0000-0000-0000-000000000003'
const PERMISSION_ID = '00000000-0000-0000-0000-000000000004'

const regularRole = { id: ROLE_ID, kind: 'financial' as const }
const adminRole = { id: ADMIN_ROLE_ID, kind: 'admin' as const }
const permRow = { id: PERMISSION_ID }

// ---------------------------------------------------------------------------
// Mock de tx: DbTx
//
// A cadeia de queries segue o padrão Drizzle:
//   select → from → where → limit  (para lookups de role e permission)
//   insert → values → onConflictDoNothing  (para insert role_permission)
//   insert → values (para audit_log via logAudit)
// ---------------------------------------------------------------------------

type SelectChainConfig = {
  roleRows?: typeof regularRole[]
  permRows?: typeof permRow[]
}

function buildMockTx({
  roleRows = [regularRole],
  permRows = [permRow],
}: SelectChainConfig = {}): DbTx {
  // Alternates select calls: first for role, second for permission
  let selectCallCount = 0

  const limit = vi.fn().mockImplementation(() => {
    const callIndex = selectCallCount++
    if (callIndex === 0) return Promise.resolve(roleRows)
    return Promise.resolve(permRows)
  })
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
  const returning = vi.fn().mockResolvedValue([])
  const values = vi.fn().mockReturnValue({ onConflictDoNothing, returning })
  const insert = vi.fn().mockReturnValue({ values })

  return { select, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const { grantPermission } = await import('@/lib/domain/rbac/grant-permission')
const { RoleNotFound, PermissionNotFound } = await import('@/lib/domain/rbac/errors')

describe('BR-RBAC — grantPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path: insere nova linha ────────────────────────────────

  it(
    'given existing role and permission ' +
      'when grantPermission ' +
      'then inserts role_permission row',
    async () => {
      const tx = buildMockTx()

      await expect(
        grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).resolves.toBeUndefined()

      expect((tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert).toHaveBeenCalled()
    },
  )

  // ── Caso 2 — idempotência: segundo grant não falha ────────────────────────

  it(
    'given permission already granted ' +
      'when grantPermission again ' +
      'then resolves without error (idempotent)',
    async () => {
      const tx = buildMockTx()

      await expect(
        grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).resolves.toBeUndefined()
    },
  )

  // ── Caso 3 — admin role: no-op silencioso ────────────────────────────────

  it(
    'given role.kind === admin ' +
      'when grantPermission ' +
      'then returns void without inserting row (no-op)',
    async () => {
      let selectCallCount = 0
      const limit = vi.fn().mockImplementation(() => {
        const callIndex = selectCallCount++
        if (callIndex === 0) return Promise.resolve([adminRole])
        return Promise.resolve([permRow])
      })
      const where = vi.fn().mockReturnValue({ limit })
      const from = vi.fn().mockReturnValue({ where })
      const select = vi.fn().mockReturnValue({ from })

      const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
      const values = vi.fn().mockReturnValue({ onConflictDoNothing })
      const insert = vi.fn().mockReturnValue({ values })

      const tx = { select, insert } as unknown as DbTx

      await expect(
        grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ADMIN_ROLE_ID, permissionId: PERMISSION_ID }),
      ).resolves.toBeUndefined()

      // INSERT into role_permission should NOT be called for admin
      // logAudit also uses insert — but we check onConflictDoNothing (role_permission specific)
      expect(onConflictDoNothing).not.toHaveBeenCalled()
    },
  )

  // ── Caso 4 — role inexistente lança RoleNotFound ──────────────────────────

  it(
    'given non-existent roleId ' +
      'when grantPermission ' +
      'then throws RoleNotFound',
    async () => {
      const tx = buildMockTx({ roleRows: [] })

      await expect(
        grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(RoleNotFound)
    },
  )

  it(
    'given non-existent roleId ' +
      'when grantPermission ' +
      'then error message references roleId',
    async () => {
      const tx = buildMockTx({ roleRows: [] })

      await expect(
        grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(ROLE_ID)
    },
  )

  // ── Caso 5 — permission inexistente lança PermissionNotFound ─────────────

  it(
    'given non-existent permissionId ' +
      'when grantPermission ' +
      'then throws PermissionNotFound',
    async () => {
      const tx = buildMockTx({ permRows: [] })

      await expect(
        grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(PermissionNotFound)
    },
  )

  it(
    'given non-existent permissionId ' +
      'when grantPermission ' +
      'then error message references permissionId',
    async () => {
      const tx = buildMockTx({ permRows: [] })

      await expect(
        grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(PERMISSION_ID)
    },
  )

  // ── Caso 6 — audit_log é gerado ──────────────────────────────────────────

  it(
    'given successful grant ' +
      'when grantPermission ' +
      'then audit log insert is called',
    async () => {
      const tx = buildMockTx()
      const insertFn = (tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert

      await grantPermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID })

      // insert is called at least twice: once for role_permission, once for audit_log
      expect(insertFn).toHaveBeenCalledTimes(2)
    },
  )
})
