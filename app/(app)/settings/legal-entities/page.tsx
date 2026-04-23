import { listLegalEntities, listBrandsForSelect } from './actions'
import { CreateLegalEntityForm } from './create-legal-entity-form'

export const metadata = {
  title: 'CNPJs — Configurações',
}

/** Formata CNPJ numérico para exibição: XX.XXX.XXX/XXXX-XX */
function formatCnpj(cnpj: string): string {
  if (cnpj.length !== 14) return cnpj
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`
}

export default async function LegalEntitiesPage() {
  const [entitiesResult, brandsResult] = await Promise.all([
    listLegalEntities(),
    listBrandsForSelect(),
  ])

  const entities = entitiesResult.ok ? entitiesResult.data : []
  const brands = brandsResult.ok ? brandsResult.data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">CNPJs</h1>
          <p className="text-sm text-slate-500 mt-1">
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

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de entidades fiscais">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                CNPJ
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                Razão social
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                Nome fantasia
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                Marca
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                Padrão
              </th>
            </tr>
          </thead>
          <tbody>
            {entities.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Nenhuma entidade fiscal cadastrada.
                </td>
              </tr>
            ) : (
              entities.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-slate-700">
                    {formatCnpj(e.cnpj)}
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {e.companyName}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.tradeName ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {e.brandName ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {e.isDefault ? (
                      <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        Padrão
                      </span>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
