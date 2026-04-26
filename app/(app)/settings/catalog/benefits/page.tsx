/**
 * MOD-CATALOG — Página de Benefícios Comerciais
 * Server Component: lista benefícios + formulários de criar/editar/arquivar.
 * Spec: docs/20-domain/09-catalog.md §3.3, T-6-04, T-12-26, T-16-13
 */

import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { listBenefitsAction, listBrandsForBenefitSelectAction } from './actions'
import { CatalogBenefitCreateForm } from '@/components/settings/catalog-benefit-form'
import { BenefitsList } from '@/components/settings/benefits-list'

export const metadata = {
  title: 'Benefícios — Catálogo',
}

export default async function BenefitsPage() {
  let ctx
  try {
    ctx = await requireSession()
  } catch {
    redirect('/login')
  }

  const [benefitsResult, brandsResult] = await Promise.all([
    listBenefitsAction(),
    listBrandsForBenefitSelectAction(),
  ])

  const benefits = benefitsResult.ok ? benefitsResult.data : []
  const brands = brandsResult.ok ? brandsResult.data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Benefícios Comerciais</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie benefícios reutilizáveis (grupos VIP, certificados, mentorias) por marca.
          </p>
        </div>
        <CatalogBenefitCreateForm brands={brands} />
      </div>

      {!benefitsResult.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar os benefícios. Tente recarregar a página.
        </div>
      )}

      <BenefitsList rows={benefits} userId={ctx.user.id} />
    </div>
  )
}
