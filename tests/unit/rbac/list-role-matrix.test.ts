/**
 * Unit tests — listRoleMatrix
 *
 * T-15-01
 * BR-RBAC: listagem da matriz role × permission
 * docs/50-business-rules/BR-RBAC.md
 *
 * ADR-10: funções lançam DomainError
 * ADR-11: função de leitura pura — usa db singleton
 *
 * Estratégia: mockar @/lib/db/client para que as queries paralelas retornem
 * dados controlados. listRoleMatrix usa Promise.all com 3 queries independentes.
 *
 * Nota sobre o mock: listRoleMatrix faz select({ id, kind, name: role.description }).
 * Drizzle mapeia o campo `description` do schema para a chave `name` no resultado.
 * No mock, `from()` retorna diretamente os objetos — portanto os fixtures já
 * precisam ter a chave `name` (não `description`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures (chaves devem bater com os alias do select em list-role-matrix.ts)
// ---------------------------------------------------------------------------

const ROLE_ADMIN = { id: 'role-admin-0000-0000-0000-000000000001', kind: 'admin', name: 'Administrador' }
const ROLE_FINANCIAL = { id: 'role-financial-0000-000000000002', kind: 'financial', name: 'Financeiro' }

const PERM_BILLING = { id: 'perm-billing-0000-000000000001', action: 'billing.view', requires2fa: false }
const PERM_REFUND = { id: 'perm-refund-0000-0000-000000000002', action: 'refund.approve', requires2fa: true }

const ASSIGNMENT_1 = { roleId: ROLE_ADMIN.id, permissionId: PERM_BILLING.id }
const ASSIGNMENT_2 = { roleId: ROLE_ADMIN.id, permissionId: PERM_REFUND.id }
const ASSIGNMENT_3 = { roleId: ROLE_FINANCIAL.id, permissionId: PERM_BILLING.id }

// ---------------------------------------------------------------------------
// Mock de @/lib/db/client
//
// listRoleMatrix usa Promise.all com três queries independentes:
//   1. roles  — select({ id, kind, name: description }).from(role)
//   2. permissions — select({ id, action, requires2fa }).from(permission)
//   3. assignments — select({ roleId, permissionId }).from(rolePermission)
//
// Cada query segue a chain: select(fields) → from(table)
// O mock usa uma fila de resultados (queryQueue) que é recarregada antes de cada teste.
// ---------------------------------------------------------------------------

// Mutable queue controlada por cada teste
const queryQueue: Array<unknown[]> = []

vi.mock('@/lib/db/client', () => {
  const from = vi.fn(() => Promise.resolve(queryQueue.shift() ?? []))
  const select = vi.fn(() => ({ from }))

  return {
    db: { select },
    DbTx: undefined,
  }
})

// Import AFTER mock (vi.mock é hoisted)
const { listRoleMatrix } = await import('@/lib/domain/rbac/list-role-matrix')

// ---------------------------------------------------------------------------
// Helper: carrega resultados na fila para o próximo listRoleMatrix()
// Os três itens correspondem à ordem: [roles, permissions, assignments]
// ---------------------------------------------------------------------------

function setupQueue(roles: unknown[], permissions: unknown[], assignments: unknown[]) {
  queryQueue.length = 0
  queryQueue.push(roles, permissions, assignments)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-RBAC — listRoleMatrix', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    queryQueue.length = 0
  })

  // ── Caso 1 — retorna estrutura completa com roles, permissions, assignments

  it(
    'given seeded roles and permissions ' +
      'when listRoleMatrix ' +
      'then returns roles array with correct shape',
    async () => {
      setupQueue(
        [ROLE_ADMIN, ROLE_FINANCIAL],
        [PERM_BILLING, PERM_REFUND],
        [ASSIGNMENT_1, ASSIGNMENT_2, ASSIGNMENT_3],
      )

      const matrix = await listRoleMatrix()

      expect(matrix.roles).toHaveLength(2)
      expect(matrix.roles[0]).toMatchObject({ id: ROLE_ADMIN.id, kind: 'admin', name: 'Administrador' })
      expect(matrix.roles[1]).toMatchObject({ id: ROLE_FINANCIAL.id, kind: 'financial', name: 'Financeiro' })
    },
  )

  it(
    'given seeded permissions ' +
      'when listRoleMatrix ' +
      'then returns permissions array with requires2fa flag',
    async () => {
      setupQueue(
        [ROLE_ADMIN],
        [PERM_BILLING, PERM_REFUND],
        [],
      )

      const matrix = await listRoleMatrix()

      expect(matrix.permissions).toHaveLength(2)
      expect(matrix.permissions.find((p) => p.action === 'billing.view')?.requires2fa).toBe(false)
      expect(matrix.permissions.find((p) => p.action === 'refund.approve')?.requires2fa).toBe(true)
    },
  )

  it(
    'given existing role_permission assignments ' +
      'when listRoleMatrix ' +
      'then returns assignments array with roleId and permissionId',
    async () => {
      setupQueue(
        [ROLE_ADMIN, ROLE_FINANCIAL],
        [PERM_BILLING, PERM_REFUND],
        [ASSIGNMENT_1, ASSIGNMENT_2, ASSIGNMENT_3],
      )

      const matrix = await listRoleMatrix()

      expect(matrix.assignments).toHaveLength(3)
      expect(matrix.assignments).toContainEqual({ roleId: ROLE_ADMIN.id, permissionId: PERM_BILLING.id })
      expect(matrix.assignments).toContainEqual({ roleId: ROLE_FINANCIAL.id, permissionId: PERM_BILLING.id })
    },
  )

  // ── Caso 2 — tabelas vazias: estrutura válida com arrays vazios ───────────

  it(
    'given empty tables ' +
      'when listRoleMatrix ' +
      'then returns empty arrays for all three properties',
    async () => {
      setupQueue([], [], [])

      const matrix = await listRoleMatrix()

      expect(matrix.roles).toEqual([])
      expect(matrix.permissions).toEqual([])
      expect(matrix.assignments).toEqual([])
    },
  )

  // ── Caso 3 — shape retornada tem as três propriedades obrigatórias ─────────

  it(
    'given any data ' +
      'when listRoleMatrix ' +
      'then returned object has roles, permissions, and assignments keys',
    async () => {
      setupQueue([], [], [])

      const matrix = await listRoleMatrix()

      expect(matrix).toHaveProperty('roles')
      expect(matrix).toHaveProperty('permissions')
      expect(matrix).toHaveProperty('assignments')
    },
  )

  // ── Caso 4 — name pode ser null ────────────────────────────────────────────

  it(
    'given role with null name ' +
      'when listRoleMatrix ' +
      'then role.name is null',
    async () => {
      setupQueue(
        [{ id: 'role-id-0000-0000', kind: 'marketing', name: null }],
        [],
        [],
      )

      const matrix = await listRoleMatrix()

      expect(matrix.roles[0]?.name).toBeNull()
    },
  )
})
