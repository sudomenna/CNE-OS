/**
 * MOD-CATALOG — Página de Benefícios Comerciais
 * Server Component: lista benefícios + Client Component para criar/arquivar.
 * Spec: docs/20-domain/09-catalog.md §3.3, T-6-04
 */

import { listBenefitsAction, listBrandsForBenefitSelectAction } from './actions'
import { BenefitsClient } from './benefits-client'

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
          <h1 className="text-2xl font-bold text-slate-900">Benefícios Comerciais</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie benefícios reutilizáveis (grupos VIP, certificados, mentorias) por marca.
          </p>
        </div>
        <BenefitsClient brands={brands} mode="create-only" />
      </div>

      {!benefitsResult.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar os benefícios. Tente recarregar a página.
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de benefícios comerciais">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Nome</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Slug</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Tag automática</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Vigência padrão</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">Criado em</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-slate-600">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {benefits.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  Nenhum benefício cadastrado.
                </td>
              </tr>
            ) : (
              benefits.map((b) => (
                <tr
                  key={b.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">{b.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{b.slug}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {b.autoTag ? (
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{b.autoTag}</code>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {b.defaultDurationMonths != null ? (
                      `${b.defaultDurationMonths} meses`
                    ) : (
                      <span className="text-slate-300">Perpétuo</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {b.status === 'archived' ? (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        Arquivado
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Ativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(b.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    {b.status === 'active' && (
                      <BenefitsClient
                        brands={brands}
                        mode="archive-only"
                        benefitId={b.id}
                        benefitName={b.name}
                      />
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
