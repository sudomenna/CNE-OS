/**
 * MOD-RBAC — Permission & role_permission schema (T-0-07)
 *
 * Tables in this file: permission, role_permission
 *
 * Specs:
 *   docs/50-business-rules/BR-RBAC.md
 *   docs/00-product/03-personas-rbac-matrix.md
 *   docs/30-contracts/02-db-schema-conventions.md
 */
import { boolean, index, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { role } from './organization'

// ---------------------------------------------------------------------------
// permission
// ---------------------------------------------------------------------------

export const permission = pgTable(
  'permission',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    // BR-RBAC: each action string is unique across the system
    action: text('action').notNull(),
    // BR-RBAC: sensitive actions require 2FA before being granted in-request
    requires2fa: boolean('requires_2fa').notNull().default(false),
  },
  (t) => ({
    uqPermissionAction: uniqueIndex('uq_permission_action').on(t.action),
  }),
)

export type Permission = InferSelectModel<typeof permission>
export type NewPermission = InferInsertModel<typeof permission>

// ---------------------------------------------------------------------------
// role_permission  (N×N join — role ↔ permission)
// docs/50-business-rules/BR-RBAC.md — Fase 1 matrix
// ---------------------------------------------------------------------------

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => role.id, {
        // docs/30-contracts/02-db-schema-conventions.md §14
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permission.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.roleId, t.permissionId] }),
    // BR-RBAC: fast lookup of all permissions for a given role
    idxRolePermissionRole: index('idx_role_permission_role').on(t.roleId),
  }),
)

export type RolePermission = InferSelectModel<typeof rolePermission>
export type NewRolePermission = InferInsertModel<typeof rolePermission>
