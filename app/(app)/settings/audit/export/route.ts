/**
 * GET /settings/audit/export — gera CSV da trilha de auditoria.
 *
 * Requer: requireSession() + audit.read (admin apenas).
 *
 * Filtros aceitos via searchParams (mesmos da página):
 *   userId, actionKind, resourceKind, resourceId, dateFrom, dateTo
 *
 * Resposta: text/csv com Content-Disposition attachment.
 */
import { NextRequest, NextResponse } from 'next/server'
import { and, desc, eq, gte, ilike, inArray, lte } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { auditLog } from '@/lib/db/schema/audit'
import { userAccount } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { can } from '@/lib/auth/rbac/matrix'

const EXPORT_LIMIT = 10_000

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function rowToCsv(cells: string[]): string {
  return cells.map(escapeCsv).join(',')
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth + RBAC
  let ctx
  try {
    ctx = await requireSession()
  } catch {
    return new NextResponse('Não autorizado.', { status: 401 })
  }

  if (!can(ctx.user, 'audit.read', { kind: 'global' })) {
    return new NextResponse('Acesso negado.', { status: 403 })
  }

  const sp = request.nextUrl.searchParams

  // Build WHERE conditions (same logic as page.tsx)
  const conditions = []

  if (sp.get('userId')?.trim()) {
    const matchingUsers = await db
      .select({ id: userAccount.id })
      .from(userAccount)
      .where(ilike(userAccount.email, `%${sp.get('userId')!.trim()}%`))
      .limit(100)
    const ids = matchingUsers.map((u) => u.id)
    if (ids.length === 0) {
      // No matching user → empty CSV
      const emptyCsv = 'timestamp,actor_email,action_kind,resource_kind,resource_id,changes\n'
      const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`
      return new NextResponse(emptyCsv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }
    if (ids.length === 1) {
      conditions.push(eq(auditLog.actorUserId, ids[0]!))
    } else {
      conditions.push(inArray(auditLog.actorUserId, ids))
    }
  }

  const actionKind = sp.get('actionKind')
  if (actionKind && actionKind !== '_all') {
    conditions.push(
      eq(
        auditLog.actionKind,
        actionKind as (typeof auditLog.actionKind)['_']['data'],
      ),
    )
  }

  const resourceKind = sp.get('resourceKind')
  if (resourceKind && resourceKind !== '_all') {
    conditions.push(eq(auditLog.resourceKind, resourceKind))
  }

  const resourceId = sp.get('resourceId')
  if (resourceId) {
    conditions.push(eq(auditLog.resourceId, resourceId))
  }

  const dateFrom = sp.get('dateFrom')
  if (dateFrom) {
    const from = new Date(dateFrom)
    if (!isNaN(from.getTime())) {
      conditions.push(gte(auditLog.createdAt, from))
    }
  }

  const dateTo = sp.get('dateTo')
  if (dateTo) {
    const to = new Date(dateTo)
    to.setHours(23, 59, 59, 999)
    if (!isNaN(to.getTime())) {
      conditions.push(lte(auditLog.createdAt, to))
    }
  }

  const rows = await db
    .select({
      createdAt: auditLog.createdAt,
      actorEmail: userAccount.email,
      actorSystem: auditLog.actorSystem,
      actionKind: auditLog.actionKind,
      resourceKind: auditLog.resourceKind,
      resourceId: auditLog.resourceId,
      before: auditLog.before,
      after: auditLog.after,
    })
    .from(auditLog)
    .leftJoin(userAccount, eq(userAccount.id, auditLog.actorUserId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(EXPORT_LIMIT)

  // Build CSV
  const header = rowToCsv([
    'timestamp',
    'actor_email',
    'action_kind',
    'resource_kind',
    'resource_id',
    'changes',
  ])

  const lines = rows.map((r) => {
    const changes = JSON.stringify({ before: r.before, after: r.after })
    return rowToCsv([
      r.createdAt.toISOString(),
      r.actorEmail ?? r.actorSystem ?? 'Sistema',
      r.actionKind,
      r.resourceKind,
      r.resourceId ?? '',
      changes,
    ])
  })

  const csv = [header, ...lines].join('\n')
  const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
