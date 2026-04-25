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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de marcas">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-muted-foreground"
              >
                Nome
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-muted-foreground"
              >
                Slug
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-muted-foreground"
              >
                Cor principal
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left font-medium text-muted-foreground"
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
                  className="px-4 py-8 text-center text-muted-foreground/60"
                >
                  Nenhuma marca cadastrada.
                </td>
              </tr>
            ) : (
              brands.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    <div className="flex items-center gap-2">
                      {b.primaryColor && (
                        <span
                          className="inline-block h-3 w-3 rounded-full border border-border flex-shrink-0"
                          style={{ backgroundColor: b.primaryColor }}
                          aria-hidden="true"
                        />
                      )}
                      {b.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {b.slug}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.primaryColor ?? (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
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
