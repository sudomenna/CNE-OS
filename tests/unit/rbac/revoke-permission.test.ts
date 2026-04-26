/**
 * Unit tests — revokePermission
 *
 * T-15-01
 * BR-RBAC: revogação de permissão de role
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
//   delete → where                  (para delete role_permission)
//   insert → values                 (para audit_log via logAudit)
// ---------------------------------------------------------------------------

type RevokeChainConfig = {
  roleRows?: typeof regularRole[] | typeof adminRole[]
  permRows?: typeof permRow[]
}

function buildMockTx({
  roleRows = [regularRole] as RevokeChainConfig['roleRows'],
  permRows = [permRow],
}: RevokeChainConfig = {}): DbTx {
  let selectCallCount = 0

  const limit = vi.fn().mockImplementation(() => {
    const callIndex = selectCallCount++
    if (callIndex === 0) return Promise.resolve(roleRows)
    return Promise.resolve(permRows)
  })
  const where = vi.fn().mockReturnValue({ limit })
  const from = vi.fn().mockReturnValue({ where })
  const select = vi.fn().mockReturnValue({ from })

  // delete chain: delete → where
  const deleteWhere = vi.fn().mockResolvedValue(undefined)
  const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere })

  // insert chain for audit_log
  const values = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn().mockReturnValue({ values })

  return { select, delete: deleteFn, insert } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const { revokePermission } = await import('@/lib/domain/rbac/revoke-permission')
const { RoleNotFound, PermissionNotFound, CannotModifyAdminRole } = await import('@/lib/domain/rbac/errors')

describe('BR-RBAC — revokePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1 — happy path: remove linha ────────────────────────────────────

  it(
    'given existing role and permission ' +
      'when revokePermission ' +
      'then deletes role_permission row',
    async () => {
      const tx = buildMockTx()
      const deleteFn = (tx as unknown as { delete: ReturnType<typeof vi.fn> }).delete

      await expect(
        revokePermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).resolves.toBeUndefined()

      expect(deleteFn).toHaveBeenCalledOnce()
    },
  )

  // ── Caso 2 — idempotência: revoke quando não existia não falha ────────────

  it(
    'given permission not currently assigned ' +
      'when revokePermission ' +
      'then resolves without error (idempotent)',
    async () => {
      const tx = buildMockTx()

      await expect(
        revokePermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).resolves.toBeUndefined()
    },
  )

  // ── Caso 3 — admin role: lança CannotModifyAdminRole ─────────────────────

  it(
    'given role.kind === admin ' +
      'when revokePermission ' +
      'then throws CannotModifyAdminRole',
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
      const deleteWhere = vi.fn().mockResolvedValue(undefined)
      const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere })
      const values = vi.fn().mockResolvedValue(undefined)
      const insert = vi.fn().mockReturnValue({ values })

      const tx = { select, delete: deleteFn, insert } as unknown as DbTx

      await expect(
        revokePermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ADMIN_ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(CannotModifyAdminRole)
    },
  )

  it(
    'given role.kind === admin ' +
      'when revokePermission ' +
      'then error message references roleId',
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
      const deleteWhere = vi.fn().mockResolvedValue(undefined)
      const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere })
      const values = vi.fn().mockResolvedValue(undefined)
      const insert = vi.fn().mockReturnValue({ values })

      const tx = { select, delete: deleteFn, insert } as unknown as DbTx

      await expect(
        revokePermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ADMIN_ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(ADMIN_ROLE_ID)
    },
  )

  // ── Caso 4 — role inexistente lança RoleNotFound ──────────────────────────

  it(
    'given non-existent roleId ' +
      'when revokePermission ' +
      'then throws RoleNotFound',
    async () => {
      const tx = buildMockTx({ roleRows: [] })

      await expect(
        revokePermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(RoleNotFound)
    },
  )

  // ── Caso 5 — permission inexistente lança PermissionNotFound ─────────────

  it(
    'given non-existent permissionId ' +
      'when revokePermission ' +
      'then throws PermissionNotFound',
    async () => {
      const tx = buildMockTx({ permRows: [] })

      await expect(
        revokePermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID }),
      ).rejects.toThrow(PermissionNotFound)
    },
  )

  // ── Caso 6 — audit_log é gerado ──────────────────────────────────────────

  it(
    'given successful revoke ' +
      'when revokePermission ' +
      'then audit log insert is called',
    async () => {
      const tx = buildMockTx()
      const insertFn = (tx as unknown as { insert: ReturnType<typeof vi.fn> }).insert

      await revokePermission(tx, { actorUserId: ACTOR_USER_ID, roleId: ROLE_ID, permissionId: PERMISSION_ID })

      // insert is called once for audit_log
      expect(insertFn).toHaveBeenCalledOnce()
    },
  )
})
