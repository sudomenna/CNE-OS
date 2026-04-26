/**
 * /settings/audit — Trilha de auditoria paginada com filtros.
 *
 * Server Component — lê filtros de searchParams, executa query Drizzle,
 * passa resultado para <AuditLogTable>.
 *
 * RBAC: audit.read (admin apenas).
 */
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { and, desc, eq, gte, ilike, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { auditLog } from '@/lib/db/schema/audit'
import { userAccount } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac/matrix'
import { AuditLogTable, type AuditLogRow } from '@/components/settings/audit-log-table'
import { Button } from '@/components/ui/button'

export const metadata = {
  title: 'Trilha de auditoria — Configurações',
}

const PAGE_SIZE = 50

interface AuditPageProps {
  searchParams: Promise<{
    userId?: string
    actionKind?: string
    resourceKind?: string
    resourceId?: string
    dateFrom?: string
    dateTo?: string
    page?: string
  }>
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  // RBAC: audit.read — admin apenas
  let ctx
  try {
    ctx = await requireSession()
  } catch {
    redirect('/login')
  }

  if (!can(ctx.user, 'audit.read', { kind: 'global' })) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-6 text-sm text-red-700"
      >
        Acesso negado. Apenas administradores podem visualizar a trilha de auditoria.
      </div>
    )
  }

  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const offset = (page - 1) * PAGE_SIZE

  // Build WHERE conditions
  const conditions = []

  // Filter by actor email — join userAccount
  if (params.userId?.trim()) {
    const matchingUsers = await db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(ilike(userAccount.email, `%${params.userId.trim()}%`))
      .limit(100)
    const ids = matchingUsers.map((u) => u.id)
    if (ids.length === 0) {
      // No matching users → return empty result fast
      return (
        <AuditPageShell page={page} rows={[]} hasNext={false} />
      )
    }
    if (ids.length === 1) {
      conditions.push(eq(auditLog.actorUserId, ids[0]!))
    } else {
      conditions.push(inArray(auditLog.actorUserId, ids))
    }
  }

  if (params.actionKind && params.actionKind !== '_all') {
    conditions.push(
      eq(
        auditLog.actionKind,
        params.actionKind as (typeof auditLog.actionKind)['_']['data'],
      ),
    )
  }

  if (params.resourceKind && params.resourceKind !== '_all') {
    conditions.push(eq(auditLog.resourceKind, params.resourceKind))
  }

  if (params.resourceId) {
    conditions.push(eq(auditLog.resourceId, params.resourceId))
  }

  if (params.dateFrom) {
    const from = new Date(params.dateFrom)
    if (!isNaN(from.getTime())) {
      conditions.push(gte(auditLog.createdAt, from))
    }
  }

  if (params.dateTo) {
    // Include full day
    const to = new Date(params.dateTo)
    to.setHours(23, 59, 59, 999)
    if (!isNaN(to.getTime())) {
      conditions.push(lte(auditLog.createdAt, to))
    }
  }

  // Fetch PAGE_SIZE + 1 to detect next page
  const rawRows = await db
    .select({
      id: auditLog.id,
      actorUserId: auditLog.actorUserId,
      actorSystem: auditLog.actorSystem,
      actionKind: auditLog.actionKind,
      resourceKind: auditLog.resourceKind,
      resourceId: auditLog.resourceId,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      actorEmail: userAccount.email,
    })
    .from(auditLog)
    .leftJoin(userAccount, eq(userAccount.id, auditLog.actorUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset)

  const hasNext = rawRows.length > PAGE_SIZE
  const pageRows = rawRows.slice(0, PAGE_SIZE)

  const rows: AuditLogRow[] = pageRows.map((r) => ({
    id: r.id,
    actorEmail: r.actorEmail ?? null,
    actorSystem: r.actorSystem ?? null,
    actionKind: r.actionKind,
    resourceKind: r.resourceKind,
    resourceId: r.resourceId ?? null,
    before: (r.before as Record<string, unknown>) ?? {},
    after: (r.after as Record<string, unknown>) ?? {},
    createdAt: r.createdAt.toISOString(),
  }))

  return (
    <AuditPageShell page={page} rows={rows} hasNext={hasNext} />
  )
}

function AuditPageShell({
  page,
  rows,
  hasNext,
}: {
  page: number
  rows: AuditLogRow[]
  hasNext: boolean
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Trilha de auditoria</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registro imutável de todas as ações realizadas no sistema.
          </p>
        </div>
        <a
          href="/settings/audit/export"
          aria-label="Exportar log de auditoria em CSV"
        >
          <Button variant="outline" size="sm">
            Exportar CSV
          </Button>
        </a>
      </div>

      <Suspense fallback={<div className="text-muted-foreground text-sm">Carregando…</div>}>
        <AuditLogTable rows={rows} page={page} hasNext={hasNext} />
      </Suspense>
    </div>
  )
}
