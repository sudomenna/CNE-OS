/**
 * DB cleanup helpers for integration tests.
 *
 * These functions must NEVER run against production.
 * Guard: throws immediately if NODE_ENV === 'production'.
 *
 * Spec: docs/10-architecture/10-testing-strategy.md §3.3
 */

import { db } from '@/lib/db/client'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'

/**
 * Truncates all domain tables in dependency-safe order (children before parents).
 *
 * Use in integration test `afterEach` to isolate test state.
 * CASCADE handles any FK references not listed explicitly.
 *
 * Requires a test DB — never call in production.
 * docs/10-architecture/10-testing-strategy.md §3.3
 */
export async function resetDb(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('resetDb() must not run in production')
  }

  // Order: children before parents (FK dependencies)
  await db.execute(sql`
    TRUNCATE TABLE
      role_permission,
      user_role,
      webhook_log,
      timeline_event,
      audit_log,
      permission,
      user_account,
      brand_legal_entity,
      legal_entity,
      role,
      brand
    RESTART IDENTITY CASCADE
  `)
}

/**
 * Wraps a test callback in a DB transaction that is always rolled back on exit.
 *
 * Safe to use with a real DB — leaves zero side-effects regardless of whether
 * the callback succeeds or throws.
 *
 * Usage:
 * ```ts
 * await withRollback(async (tx) => {
 *   await tx.insert(brand).values(makeBrand())
 *   const rows = await tx.select().from(brand)
 *   expect(rows).toHaveLength(1)
 * })
 * // DB is untouched after this line
 * ```
 *
 * docs/10-architecture/10-testing-strategy.md §3.3
 */
export async function withRollback<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
  let result: T | undefined
  try {
    await db.transaction(async (tx) => {
      result = await fn(tx)
      // Force rollback even on success so no test leaves DB state
      throw new Error('__rollback__')
    })
  } catch (e) {
    if ((e as Error).message !== '__rollback__') throw e
  }
  // result is always assigned if fn completed without throwing
  return result as T
}
