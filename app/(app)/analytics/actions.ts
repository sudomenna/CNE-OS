'use server'

/**
 * MOD-ANALYTICS — Server Actions + helpers para filtros globais persistidos
 * T-12-27: docs/80-roadmap/09-sprint-12-ui-gaps.md
 *
 * Filtros globais de analytics persistidos em cookie 'cne_analytics_filters'.
 * Não é mutação de dado de domínio — sem audit, sem RBAC além de requireSession().
 */

import { cookies } from 'next/headers'
import { z } from 'zod'
import { isNull } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { toActionResult, ActionError } from '@/lib/actions/result'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

export type AnalyticsPeriod = '7d' | '30d' | '90d'

export type AnalyticsFilters = {
  brandId: string | null
  period: AnalyticsPeriod
}

const COOKIE_NAME = 'cne_analytics_filters'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 dias em segundos

const DEFAULT_FILTERS: AnalyticsFilters = {
  brandId: null,
  period: '30d',
}

const analyticsFiltersSchema = z.object({
  brandId: z.string().uuid().nullable(),
  period: z.enum(['7d', '30d', '90d']),
})

// ---------------------------------------------------------------------------
// getAnalyticsFilters — leitura de cookie (não-action, helper server-side)
// ---------------------------------------------------------------------------

/**
 * Lê o cookie 'cne_analytics_filters' e retorna os filtros com defaults seguros.
 * Pode ser chamado diretamente de Server Components (não é action).
 */
export async function getAnalyticsFilters(): Promise<AnalyticsFilters> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(COOKIE_NAME)?.value
  if (!raw) return DEFAULT_FILTERS
  try {
    const parsed: unknown = JSON.parse(raw)
    const result = analyticsFiltersSchema.safeParse(parsed)
    if (!result.success) return DEFAULT_FILTERS
    return result.data
  } catch {
    return DEFAULT_FILTERS
  }
}

// ---------------------------------------------------------------------------
// saveAnalyticsFiltersAction — Server Action que grava cookie
// ---------------------------------------------------------------------------

const saveFiltersInputSchema = z.object({
  brandId: z.string().uuid().nullable(),
  period: z.enum(['7d', '30d', '90d']),
})

export async function saveAnalyticsFiltersAction(
  input: { brandId: string | null; period: string },
) {
  return toActionResult(async () => {
    await requireSession()

    const parsed = saveFiltersInputSchema.safeParse(input)
    if (!parsed.success) {
      throw new ActionError('VALIDATION', 'Filtros inválidos', {
        issues: parsed.error.issues,
      })
    }

    const cookieStore = await cookies()
    cookieStore.set(COOKIE_NAME, JSON.stringify(parsed.data), {
      maxAge: COOKIE_MAX_AGE,
      path: '/',
      httpOnly: false, // acessível por client para leitura opcional
      sameSite: 'lax',
    })

    return parsed.data
  })
}

// ---------------------------------------------------------------------------
// listBrandsForAnalytics — lista marcas ativas para o filtro global
// ---------------------------------------------------------------------------

export async function listBrandsForAnalytics(): Promise<
  { id: string; name: string }[]
> {
  await requireSession()

  const rows = await db
    .select({ id: brand.id, name: brand.name })
    .from(brand)
    .where(isNull(brand.deletedAt))
    .orderBy(brand.name)

  return rows
}
