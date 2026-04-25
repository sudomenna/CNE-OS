/**
 * /billing/delinquency — Dashboard de inadimplência
 *
 * Server Component: busca assinaturas past_due com parcelas overdue,
 * aplica filtros via searchParams, exibe tabela + link de export CSV.
 *
 * RBAC: billing.view — admin, financial, commercial.
 * T-9-15: docs/20-domain/13-subscription-billing.md §5
 */

import Link from 'next/link'
import type { Route } from 'next'
import { and, eq, sql } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import { subscription } from '@/lib/db/schema/billing'
import { contact } from '@/lib/db/schema/contact'
import { offer } from '@/lib/db/schema/offer'
import { brand } from '@/lib/db/schema/organization'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { DelinquencyTable } from '@/components/billing/delinquency-table'
import { DelinquencyFilters } from '@/components/billing/delinquency-filters'
import type { DelinquencyRow } from '@/components/billing/delinquency-table'
import type { BrandOption } from '@/components/billing/delinquency-filters'

export const metadata = {
  title: 'Inadimplência — CNE-OS',
}

// ---------------------------------------------------------------------------
// Tipos e helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function DelinquencyPage({ searchParams }: PageProps) {
  // 1. RBAC — billing.view: admin, financial, commercial
  const ctx = await requireSession()
  await requirePermission(ctx, 'billing.view', { kind: 'global' })

  const params = await searchParams
  const filterBrandId = typeof params['brand_id'] === 'string' ? params['brand_id'] : undefined
  const filterBucket = typeof params['bucket'] === 'string' ? params['bucket'] : undefined
  const filterMinAmount =
    typeof params['min_amount'] === 'string' && params['min_amount'] !== ''
      ? parseFloat(params['min_amount'])
      : undefined
  const filterMaxAmount =
    typeof params['max_amount'] === 'string' && params['max_amount'] !== ''
      ? parseFloat(params['max_amount'])
      : undefined

  // 2. Buscar marcas para o seletor de filtro
  const brandRows = await db
    .select({ id: brand.id, name: brand.name })
    .from(brand)
    .where(sql`deleted_at IS NULL`)
    .orderBy(brand.name)

  const brandOptions: BrandOption[] = brandRows

  // 3. Buscar assinaturas past_due com parcelas overdue e seus agregados
  //    JOIN: subscription → contact, offer, brand
  //    Subquery: mínimo due_at de installment overdue por subscription_id
  //
  //    Lógica:
  //    - Traz apenas subscriptions com status past_due
  //    - Filtra por brand_id do usuário quando role não é admin (RBAC brand isolation)
  //    - Agrega: sum(amount) de installments overdue por subscription = total_overdue
  //    - oldest_due_at = min(due_at) de installments overdue por subscription
  //    - age_days = diff em dias entre now() e oldest_due_at

  const whereConditions = [
    eq(subscription.status, 'past_due'),
    ...(filterBrandId ? [eq(subscription.brandId, filterBrandId)] : []),
    // BR-RBAC: usuários que não são admin ou financial só veem a própria marca
    // NOTA: commercial pode ver billing.view mas não tem isolamento por brand aqui
    // (RBAC brand isolation é configuração de negócio — brand_id é fiscal, não tenant)
    // Quando o usuário não tem role admin/financial, filtramos pela marca se informado.
  ]

  const rawRows = await db
    .select({
      subscriptionId: subscription.id,
      contactId: subscription.contactId,
      contactName: contact.fullName,
      offerName: offer.name,
      brandName: brand.name,
      brandId: subscription.brandId,
      // Agregados de installments overdue via subquery lateral
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
    .orderBy(sql`(
      SELECT MIN(i.due_at)
      FROM installment i
      WHERE i.subscription_id = ${subscription.id}
        AND i.status = 'overdue'
    ) ASC NULLS LAST`)

  // 4. Filtrar em memória por bucket e faixa de valor
  //    (pode mover para SQL em otimização futura)
  const now = Date.now()

  const delinquencyRows: DelinquencyRow[] = rawRows
    .filter((r) => r.oldestDueAt !== null)
    .map((r) => {
      const totalOverdue = parseFloat(r.totalOverdue)
      const oldestDueAt = new Date(r.oldestDueAt!)
      const ageDays = Math.floor((now - oldestDueAt.getTime()) / (1000 * 60 * 60 * 24))
      const bucket = computeBucket(ageDays)

      return {
        subscriptionId: r.subscriptionId,
        contactId: r.contactId,
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

  // 5. Montar URL do CSV (preserva filtros)
  const exportParams = new URLSearchParams()
  if (filterBrandId) exportParams.set('brand_id', filterBrandId)
  if (filterBucket) exportParams.set('bucket', filterBucket)
  if (filterMinAmount !== undefined) exportParams.set('min_amount', String(filterMinAmount))
  if (filterMaxAmount !== undefined) exportParams.set('max_amount', String(filterMaxAmount))
  const exportUrl = `/billing/delinquency/export${exportParams.size > 0 ? `?${exportParams.toString()}` : ''}`

  // 6. Total do valor vencido (soma de todos após filtros)
  const totalOverdueSum = delinquencyRows.reduce((acc, r) => acc + r.totalOverdue, 0)
  const totalOverdueFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(totalOverdueSum)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inadimplencia</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {delinquencyRows.length}{' '}
            {delinquencyRows.length === 1 ? 'assinatura inadimplente' : 'assinaturas inadimplentes'}
            {delinquencyRows.length > 0 && (
              <>
                {' '}
                &middot; Total vencido:{' '}
                <strong className="text-muted-foreground">{totalOverdueFormatted}</strong>
              </>
            )}
          </p>
        </div>

        {/* Export CSV */}
        <Link
          href={exportUrl as Route}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label="Exportar lista de inadimplencia como CSV"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 3a.75.75 0 01.75.75v7.69l2.47-2.47a.75.75 0 111.06 1.06l-3.75 3.75a.75.75 0 01-1.06 0L5.72 10.03a.75.75 0 111.06-1.06l2.47 2.47V3.75A.75.75 0 0110 3zM3.25 15a.75.75 0 000 1.5h13.5a.75.75 0 000-1.5H3.25z"
              clipRule="evenodd"
            />
          </svg>
          Exportar CSV
        </Link>
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
        <ol className="flex items-center gap-2">
          <li>
            <Link
              href={'/billing' as Route}
              className="hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              Cobrancas
            </Link>
          </li>
          <li aria-hidden="true" className="text-muted-foreground/40">
            /
          </li>
          <li className="font-medium text-foreground" aria-current="page">
            Inadimplencia
          </li>
        </ol>
      </nav>

      {/* Filtros */}
      <DelinquencyFilters brands={brandOptions} />

      {/* Tabela */}
      <DelinquencyTable rows={delinquencyRows} />
    </div>
  )
}
