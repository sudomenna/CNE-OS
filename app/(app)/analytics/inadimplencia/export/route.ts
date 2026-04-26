/**
 * GET /analytics/inadimplencia/export — Exporta CSV de inadimplência (parcelas vencidas).
 * T-13-19: docs/80-roadmap/10-sprint-13-rls-flows-p1.md
 *
 * Colunas: installment_id, subscription_id, contact_id, offer_id, due_at, amount, days_overdue
 * RBAC: analytics.read (admin, financial)
 * Máx 10k linhas.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { queryDelinquency } from '@/lib/analytics'

const EXPORT_LIMIT = 10_000

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // RBAC
  try {
    const ctx = await requireSession()
    await requirePermission(ctx, 'analytics.read', { kind: 'global' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const brandId = searchParams.get('brandId') ?? ''

  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')

  const from = fromParam
    ? new Date(fromParam)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const to = toParam ? new Date(toParam) : new Date()

  const rows = await queryDelinquency({ brandId, from, to }).catch(() => [])

  // Aplica limite de exportação
  const limited = rows.slice(0, EXPORT_LIMIT)

  const dateSlug = new Date().toISOString().slice(0, 10)

  const header = [
    'installment_id',
    'subscription_id',
    'contact_id',
    'offer_id',
    'due_at',
    'amount',
    'days_overdue',
  ].join(',')

  const body = limited
    .map((r) =>
      [
        escapeCsv(r.id),
        escapeCsv(r.subscriptionId),
        escapeCsv(r.contactId),
        escapeCsv(r.offerId),
        escapeCsv(r.dueAt),
        r.amount.toFixed(2),
        String(r.daysOverdue),
      ].join(','),
    )
    .join('\n')

  const csv = body.length > 0 ? `${header}\n${body}` : `${header}\n`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="inadimplencia-${dateSlug}.csv"`,
    },
  })
}
