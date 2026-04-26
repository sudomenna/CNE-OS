/**
 * /settings/funnels — Configuração de funis e estágios
 *
 * Server Component: lista funis + botão de editar cada um + botão criar novo.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * Roadmap: T-12-24
 */

import { GitMerge } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CreateFunnelDialog } from '@/components/funnel/create-funnel-dialog'
import { FunnelConfigSheet } from '@/components/settings/funnel-config-sheet'
import { listFunnelsForSettings } from './actions'
import { db } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { isNull } from 'drizzle-orm'

export const metadata = {
  title: 'Funis — Configurações',
}

export const dynamic = 'force-dynamic'

export default async function SettingsFunnelsPage() {
  const [funnelsResult, brands] = await Promise.all([
    listFunnelsForSettings(),
    db
      .select({ id: brand.id, name: brand.name })
      .from(brand)
      .where(isNull(brand.deletedAt))
      .orderBy(brand.name),
  ])

  const funnels = funnelsResult.ok ? funnelsResult.data : []

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Funis</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure funis de vendas, estágios e regras de pontuação de oportunidades.
          </p>
        </div>
        <CreateFunnelDialog brands={brands} />
      </div>

      {/* Erro de carregamento */}
      {!funnelsResult.ok && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Não foi possível carregar os funis. Tente recarregar a página.
        </div>
      )}

      {/* Tabela de funis */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <table className="w-full text-sm" aria-label="Lista de funis">
          <thead className="border-b border-border bg-muted/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Nome
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Marca
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Estágios
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-muted-foreground">
                Status
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted-foreground">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {funnels.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-3 text-muted-foreground/60">
                    <GitMerge className="h-8 w-8" aria-hidden="true" />
                    <p className="text-sm">Nenhum funil configurado.</p>
                    <p className="text-xs">
                      Crie o primeiro funil usando o botão acima.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              funnels.map((f) => (
                <tr
                  key={f.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-foreground">
                    {f.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {f.brandName || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {Number(f.stageCount)} estágio{Number(f.stageCount) !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3">
                    {f.isActive ? (
                      <Badge variant="default" className="text-xs">
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">
                        Inativo
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <FunnelConfigSheet funnelId={f.id} funnelName={f.name} />
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
