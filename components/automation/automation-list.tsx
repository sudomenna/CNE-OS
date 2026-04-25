'use client'

/**
 * AutomationList — Client Component com tabela de fluxos de automação.
 * Botão "Nova Automação" chama createFlow action e redireciona para /automations/[id].
 * T-11-11 — spec: docs/20-domain/15-automation.md
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Route } from 'next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { createFlow } from '@/app/(app)/automations/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationFlowRow {
  id: string
  name: string
  isActive: boolean
  brandId: string | null
  brandName: string | null
  createdAt: Date
}

interface AutomationListProps {
  flows: AutomationFlowRow[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AutomationList({ flows }: AutomationListProps) {
  const router = useRouter()
  const [isCreating, setIsCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)

  async function handleCreateFlow() {
    setIsCreating(true)
    setCreateError(null)
    try {
      const result = await createFlow({ name: 'Novo Fluxo' })
      if (!result.ok) {
        setCreateError(result.error.message)
        return
      }
      router.push(`/automations/${result.data.id}` as Route)
    } catch {
      setCreateError('Erro inesperado ao criar fluxo.')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Create button */}
      <div className="flex justify-end">
        <Button onClick={handleCreateFlow} disabled={isCreating}>
          {isCreating ? 'Criando...' : 'Nova Automação'}
        </Button>
      </div>

      {createError && (
        <p role="alert" className="text-sm text-destructive">
          {createError}
        </p>
      )}

      {/* Table */}
      {flows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum fluxo de automação criado ainda
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Clique em "Nova Automação" para começar.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell">
                  Marca
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell">
                  Criado em
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {flows.map((flow) => (
                <tr key={flow.id} className="hover:bg-muted/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/automations/${flow.id}` as Route}
                      className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {flow.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={
                        flow.isActive
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                          : 'bg-muted text-muted-foreground hover:bg-muted'
                      }
                    >
                      {flow.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                    {flow.brandName ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground/60 hidden sm:table-cell">
                    <time dateTime={flow.createdAt.toISOString()}>
                      {new Date(flow.createdAt).toLocaleDateString('pt-BR')}
                    </time>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/automations/${flow.id}` as Route}
                      className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                      aria-label={`Editar fluxo ${flow.name}`}
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
