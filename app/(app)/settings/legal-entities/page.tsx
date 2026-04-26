import { listLegalEntities, listBrandsForSelect } from './actions'
import { CreateLegalEntityForm } from './create-legal-entity-form'
import { LegalEntitiesList } from '@/components/settings/legal-entities-list'
import { requireSession } from '@/lib/auth/session'

export const metadata = {
  title: 'CNPJs — Configurações',
}

export default async function LegalEntitiesPage() {
  const [entitiesResult, brandsResult, session] = await Promise.all([
    listLegalEntities(),
    listBrandsForSelect(),
    requireSession().catch(() => null),
  ])

  const entities = entitiesResult.ok ? entitiesResult.data : []
  const brands = brandsResult.ok ? brandsResult.data : []
  const userId = session?.user.id ?? 'anonymous'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CNPJs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Entidades fiscais emissoras de notas fiscais.
          </p>
        </div>
        <CreateLegalEntityForm brands={brands} />
      </div>

      {!entitiesResult.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar as entidades fiscais. Tente recarregar a página.
        </div>
      )}

      <LegalEntitiesList entities={entities} userId={userId} />
    </div>
  )
}
