/**
 * Seed: role catalogue
 * Task: T-0-06
 *
 * Inserts one row per role_kind. Safe to run multiple times (onConflictDoNothing).
 * docs/20-domain/01-organization.md §3.5
 */
import { db } from '@/lib/db/client'
import { role } from '@/lib/db/schema'

export async function seedRoles() {
  await db
    .insert(role)
    .values([
      { kind: 'admin', description: 'Administrador — acesso total' },
      { kind: 'financial', description: 'Financeiro' },
      { kind: 'marketing', description: 'Marketing' },
      { kind: 'support', description: 'Suporte' },
      { kind: 'commercial', description: 'Comercial' },
    ])
    .onConflictDoNothing()
}
