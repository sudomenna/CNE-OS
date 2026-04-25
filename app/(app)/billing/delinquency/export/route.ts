/**
 * GET /billing/delinquency/export — Download CSV de inadimplência
 *
 * Route Handler (não é Server Action — é download de arquivo via GET).
 * RBAC: billing.view — admin, financial, commercial.
 *
 * Query params: brand_id, bucket, min_amount, max_amount
 * Response: text/csv; attachment; filename=delinquency.csv
 *
 * T-9-15: docs/20-domain/13-subscription-billing.md §5
 */

import { type NextRequest, NextResponse } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { subscription } from '@/lib/db/schema/billing'
import { contact } from '@/lib/db/schema/contact'
import { offer } from '@/lib/db/schema/offer'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'

type AgeBucket = '0-30' | '31-60' | '61-90' | '90+'

function computeBucket(ageDays: number): AgeBucket {
  if (ageDays <= 30) return '0-30'
  if (ageDays <= 60) return '31-60'
  if (ageDays <= 90) return '61-90'
  return '90+'
}

function bucketMatchesFilter(bucket: AgeBucket, filter: string): boolean {
  if (!filter) return true
  return bucket === filter
}

/**
 * Escapa campo para CSV RFC 4180:
 * - wraps em aspas duplas se contém vírgula, aspas ou quebra de linha
 * - duplica aspas internas
 */
function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export async function GET(request: NextRequest) {
  // 1. RBAC — billing.view: admin, financial, commercial
  try {
    const ctx = await requireSession()
    await requirePermission(ctx, 'billing.view', { kind: 'global' })
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Ler filtros da query string
  const { searchParams } = request.nextUrl
  const filterBrandId = searchParams.get('brand_id') ?? undefined
  const filterBucket = searchParams.get('bucket') ?? undefined
  const rawMin = searchParams.get('min_amount')
  const rawMax = searchParams.get('max_amount')
  const filterMinAmount = rawMin !== null && rawMin !== '' ? parseFloat(rawMin) : undefined
  const filterMaxAmount = rawMax !== null && rawMax !== '' ? parseFloat(rawMax) : undefined

  // 3. Buscar dados — mesmo critério da page.tsx
  const whereConditions = [
    eq(subscription.status, 'past_due'),
    ...(filterBrandId ? [eq(subscription.brandId, filterBrandId)] : []),
  ]

  const rawRows = await db
    .select({
      subscriptionId: subscription.id,
      contactName: contact.fullName,
      offerName: offer.name,
      brandName: brand.name,
      totalOverdue: sql<string>`(
        SELECT COALESCE(SUM(i.amount), 0)
        FROM installment i
        WHERE i.subscription_id = ${subscription.id}
          AND i.status = 'overdue'
      )`,
      oldestDueAt: sql<Date | null>`(
        SELECT MIN(i.due_at)
        FROM installment i
        WHERE i.subscription_id = ${subscription.id}
          AND i.status = 'overdue'
      )`,
    })
    .from(subscription)
    .innerJoin(contact, eq(subscription.contactId, contact.id))
    .innerJoin(offer, eq(subscription.offerId, offer.id))
    .innerJoin(brand, eq(subscription.brandId, brand.id))
    .where(and(...whereConditions))

  // 4. Pós-filtro e cálculo de bucket
  const now = Date.now()

  const filtered = rawRows
    .filter((r) => r.oldestDueAt !== null)
    .map((r) => {
      const totalOverdue = parseFloat(r.totalOverdue)
      const oldestDueAt = new Date(r.oldestDueAt!)
      const ageDays = Math.floor((now - oldestDueAt.getTime()) / (1000 * 60 * 60 * 24))
      const bucket = computeBucket(ageDays)

      return {
        contactName: r.contactName,
        offerName: r.offerName,
        brandName: r.brandName,
        totalOverdue,
        oldestDueAt,
        ageDays,
        bucket,
      }
    })
    .filter((r) => bucketMatchesFilter(r.bucket, filterBucket ?? ''))
    .filter((r) => filterMinAmount === undefined || r.totalOverdue >= filterMinAmount)
    .filter((r) => filterMaxAmount === undefined || r.totalOverdue <= filterMaxAmount)

  // 5. Gerar CSV
  const CSV_HEADERS = [
    'contact_name',
    'offer_name',
    'brand_name',
    'total_overdue',
    'oldest_due_at',
    'age_days',
  ].join(',')

  const csvLines = [CSV_HEADERS]

  for (const row of filtered) {
    const line = [
      csvEscape(row.contactName),
      csvEscape(row.offerName),
      csvEscape(row.brandName),
      row.totalOverdue.toFixed(2),
      row.oldestDueAt.toISOString().split('T')[0]!, // YYYY-MM-DD
      String(row.ageDays),
    ].join(',')

    csvLines.push(line)
  }

  const csvContent = csvLines.join('\r\n')

  // 6. Resposta com Content-Disposition para download
  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename=delinquency.csv',
      'Cache-Control': 'no-store',
    },
  })
}
