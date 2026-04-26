/**
 * /settings/funnels — Configuração de funis e estágios
 *
 * Server Component: lista funis + botão de editar cada um + botão criar novo.
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md
 * Roadmap: T-12-24, T-16-13
 */

import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/auth/session'
import { CreateFunnelDialog } from '@/components/funnel/create-funnel-dialog'
import { SettingsFunnelsList } from '@/components/settings/settings-funnels-list'
import { listFunnelsForSettings } from './actions'
import { db } from '@/lib/db/client'
import { brand } from '@/lib/db/schema/organization'
import { isNull } from 'drizzle-orm'

export const metadata = {
  title: 'Funis — Configurações',
}

export const dynamic = 'force-dynamic'

export default async function SettingsFunnelsPage() {
  let ctx
  try {
    ctx = await requireSession()
  } catch {
    redirect('/login')
  }

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

      {/* Tabela de funis com customizador de colunas */}
      <SettingsFunnelsList rows={funnels} userId={ctx.user.id} />
    </div>
  )
}
