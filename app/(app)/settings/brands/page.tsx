import { listBrands } from './actions'
import { CreateBrandForm } from './create-brand-form'

export const metadata = {
  title: 'Marcas — Configurações',
}

export default async function BrandsPage() {
  const result = await listBrands()
  const brands = result.ok ? result.data : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marcas</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie as marcas da CNE Educação.</p>
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

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de marcas">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-slate-600"
              >
                Nome
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-slate-600"
              >
                Slug
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-slate-600"
              >
                Cor principal
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-slate-600"
              >
                Criado em
              </th>
            </tr>
          </thead>
          <tbody>
            {brands.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-400"
                >
                  Nenhuma marca cadastrada.
                </td>
              </tr>
            ) : (
              brands.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    <div className="flex items-center gap-2">
                      {b.primaryColor && (
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-slate-200 flex-shrink-0"
                          style={{ backgroundColor: b.primaryColor }}
                          aria-hidden="true"
                        />
                      )}
                      {b.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">
                    {b.slug}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {b.primaryColor ?? (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(b.createdAt).toLocaleDateString('pt-BR')}
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
