/**
 * MOD-CATALOG — Página de Benefícios Comerciais
 * Server Component: lista benefícios + formulários de criar/editar/arquivar.
 * Spec: docs/20-domain/09-catalog.md §3.3, T-6-04, T-12-26
 */

import { listBenefitsAction, listBrandsForBenefitSelectAction } from './actions'
import {
  CatalogBenefitCreateForm,
  CatalogBenefitEditForm,
  CatalogBenefitArchiveDialog,
} from '@/components/settings/catalog-benefit-form'

export const metadata = {
  title: 'Benefícios — Catálogo',
}

export default async function BenefitsPage() {
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

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de benefícios comerciais">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Tag automática</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Vigência padrão</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">Criado em</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {benefits.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground/60">
                  Nenhum benefício cadastrado.
                </td>
              </tr>
            ) : (
              benefits.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.slug}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.autoTag ? (
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{b.autoTag}</code>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {b.defaultDurationMonths != null ? (
                      `${b.defaultDurationMonths} meses`
                    ) : (
                      <span className="text-muted-foreground/40">Perpétuo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {b.status === 'archived' ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Arquivado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CatalogBenefitEditForm benefit={b} />
                      {b.status === 'active' && (
                        <CatalogBenefitArchiveDialog
                          benefitId={b.id}
                          benefitName={b.name}
                        />
                      )}
                    </div>
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
