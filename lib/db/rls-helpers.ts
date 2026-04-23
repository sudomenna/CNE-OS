/**
 * RLS helpers — Sprint 0 Fase 1
 *
 * Supabase RLS is enforced at the DB level using auth.uid().
 * These helpers provide typed wrappers used in Server Actions
 * to work with the RLS-aware Supabase client.
 *
 * docs/10-architecture/06-auth-rbac-audit.md §2
 * docs/30-contracts/02-db-schema-conventions.md §5
 */

/**
 * Resource kinds that have RLS enabled in Fase 1.
 * Fase 2 will add contact, transaction, entitlement, offer.
 *
 * supabase/migrations/20260423000002_rls_fase1.sql
 */
export const RLS_ENABLED_TABLES = [
  'brand',
  'legal_entity',
  'brand_legal_entity',
  'user_account',
  'role',
  'user_role',
  'permission',
  'role_permission',
  'audit_log',
  'timeline_event',
  'webhook_log',
] as const

export type RlsEnabledTable = (typeof RLS_ENABLED_TABLES)[number]

/**
 * Returns true if the given table has RLS enabled in Fase 1.
 */
export function isRlsEnabled(table: string): table is RlsEnabledTable {
  return RLS_ENABLED_TABLES.includes(table as RlsEnabledTable)
}

/**
 * Error thrown when an RLS policy blocks access.
 * Supabase returns a 403-equivalent error; this normalizes it.
 */
export class RlsPolicyError extends Error {
  constructor(
    public readonly table: string,
    public readonly operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE',
  ) {
    super(`RLS policy denied ${operation} on ${table}`)
    this.name = 'RlsPolicyError'
  }
}
