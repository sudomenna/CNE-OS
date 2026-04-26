import { listBrands } from './actions'
import { CreateBrandForm } from './create-brand-form'
import { BrandsList } from '@/components/settings/brands-list'
import { requireSession } from '@/lib/auth/session'

export const metadata = {
  title: 'Marcas — Configurações',
}

export default async function BrandsPage() {
  const [result, session] = await Promise.all([
    listBrands(),
    requireSession().catch(() => null),
  ])

  const brands = result.ok ? result.data : []
  const userId = session?.user.id ?? 'anonymous'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Marcas</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie as marcas da CNE Educação.</p>
        </div>
        <CreateBrandForm />
      </div>

      {!result.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar as marcas. Tente recarregar a página.
        </div>
      )}

      <BrandsList brands={brands} userId={userId} />
    </div>
  )
}
