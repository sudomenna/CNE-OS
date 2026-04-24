/**
 * requireSession() — helper canônico para Server Actions.
 * Carrega sessão Supabase + dados do user_account do DB.
 *
 * Spec: docs/10-architecture/06-auth-rbac-audit.md §1.3
 */
import { cookies, headers } from 'next/headers'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { userAccount, userRole, role } from '@/lib/db/schema/organization'
import { createSupabaseServerClient } from '@/lib/auth/supabase-server'
import { ActionError } from '@/lib/actions/errors'
import type { Role } from '@/lib/auth/rbac/types'

export type SessionContext = {
  user: {
    id: string
    role: Role
    has2fa: boolean
    twoFactorRecentlyVerified: boolean // fresh ≤ 5 min
  }
  impersonatingContactId: string | null
  ip: string | null
  userAgent: string | null
  correlationId: string
}

/**
 * Lê o cookie de impersonação (Sprint 0: detecta presença, não valida HMAC).
 * Sprint 1+: validar HMAC com IMPERSONATION_SIGNING_KEY.
 */
async function readImpersonationCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('impersonation')?.value
  if (!raw) return null
  try {
    // Sprint 0: parse simples; Sprint 1+ substituir por verificação HMAC
    const parsed: unknown = JSON.parse(raw)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'contactId' in parsed &&
      typeof (parsed as Record<string, unknown>)['contactId'] === 'string'
    ) {
      return (parsed as { contactId: string }).contactId
    }
    return null
  } catch {
    return null
  }
}

export async function requireSession(): Promise<SessionContext> {
  const supabase = await createSupabaseServerClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error ?? !user) {
    throw new ActionError('UNAUTHORIZED', 'no session')
  }

  // Garantido pelo guard acima
  const userId = user!.id

  const rows = await db
    .select({
      id: userAccount.id,
      isActive: userAccount.isActive,
      deletedAt: userAccount.deletedAt,
      totpEnabled: userAccount.totpEnabled,
      lastLoginAt: userAccount.lastLoginAt,
      roleKind: role.kind,
    })
    .from(userAccount)
    .leftJoin(userRole, eq(userRole.userId, userAccount.id))
    .leftJoin(role, eq(role.id, userRole.roleId))
    .where(eq(userAccount.id, userId))
    .limit(1)

  const row = rows[0]

  if (!row) {
    throw new ActionError('UNAUTHORIZED', 'user not found')
  }

  // BR-RBAC: usuário desativado ou excluído não tem sessão
  if (!row.isActive || row.deletedAt !== null) {
    throw new ActionError('UNAUTHORIZED', 'user disabled')
  }

  if (!row.roleKind) {
    throw new ActionError('UNAUTHORIZED', 'user has no role assigned')
  }

  // Fase 1: twoFactorRecentlyVerified baseia-se em lastLoginAt como proxy
  // (TOTP fresh window não tem coluna dedicada em Sprint 0 — Sprint 1 adiciona two_factor_verified_at)
  // BR-RBAC OQ-01: janela de 5 min
  const twoFactorRecentlyVerified =
    row.totpEnabled &&
    row.lastLoginAt !== null &&
    Date.now() - row.lastLoginAt.getTime() < 5 * 60_000

  const headerStore = await headers()
  const impersonatingContactId = await readImpersonationCookie()

  return {
    user: {
      id: row.id,
      role: row.roleKind as Role,
      has2fa: row.totpEnabled,
      twoFactorRecentlyVerified,
    },
    impersonatingContactId,
    ip: headerStore.get('x-forwarded-for') ?? null,
    userAgent: headerStore.get('user-agent') ?? null,
    correlationId: headerStore.get('x-correlation-id') ?? crypto.randomUUID(),
  }
}
