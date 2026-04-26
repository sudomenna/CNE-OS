'use client'

/**
 * OfferList — Client Component com tabela de ofertas e filtros.
 * Filtros: marca (brand_id) + status (offer_status).
 * T-6-17 — spec: docs/20-domain/10-offer-engine.md
 * T-16-05 — ColumnsCustomizer integrado (standalone, ADR-19)
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'
import { ColumnsCustomizer } from '@/components/ui/columns-customizer'
import { useColumnVisibility } from '@/lib/hooks/use-column-visibility'
import { OFFER_COLUMNS, OFFERS_LIST_TABLE_ID } from '@/components/offer/offer-columns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfferRow {
  id: string
  name: string
  slug: string
  status: 'draft' | 'active' | 'paused' | 'archived'
  createdAt: Date
  brandId: string
  brandName: string
}

interface BrandOption {
  id: string
  name: string
}

interface OfferListProps {
  offers: OfferRow[]
  brands: BrandOption[]
  selectedBrandId: string
  selectedStatus: string
  userId: string
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Arquivada',
}

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground hover:bg-muted',
  active: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50',
  paused: 'bg-amber-50 text-amber-700 hover:bg-amber-50',
  archived: 'bg-red-50 text-red-600 hover:bg-red-50',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfferList({
  offers,
  brands,
  selectedBrandId,
  selectedStatus,
  userId,
}: OfferListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ADR-19: hook gerencia visibilidade por (userId × tableId) no localStorage
  const { visibleColumnIds, isVisible, toggle, reset } = useColumnVisibility({
    tableId: OFFERS_LIST_TABLE_ID,
    userId,
    columns: OFFER_COLUMNS,
  })

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`${pathname}?${params.toString()}` as Route)
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        {/* Filtro por marca */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-brand"
            className="text-xs font-medium text-muted-foreground"
          >
            Marca
          </label>
          <select
            id="filter-brand"
            value={selectedBrandId}
            onChange={(e) => updateFilter('brand_id', e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Todas as marcas</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro por status */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="filter-status"
            className="text-xs font-medium text-muted-foreground"
          >
            Status
          </label>
          <select
            id="filter-status"
            value={selectedStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="h-9 rounded-md border border-input bg-card px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Todos os status</option>
            <option value="draft">Rascunho</option>
            <option value="active">Ativa</option>
            <option value="paused">Pausada</option>
            <option value="archived">Arquivada</option>
          </select>
        </div>
      </div>

      {/* Tabela */}
      {offers.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-muted-foreground">
            Nenhuma oferta encontrada
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Ajuste os filtros ou crie uma nova oferta.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Toolbar com customizador de colunas */}
          <div className="flex items-center justify-end">
            <ColumnsCustomizer
              tableId={OFFERS_LIST_TABLE_ID}
              userId={userId}
              columns={OFFER_COLUMNS}
              visibleColumnIds={visibleColumnIds}
              onToggle={toggle}
              onReset={reset}
            />
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full text-sm" aria-label="Lista de ofertas">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {/* Nome — alwaysVisible */}
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Nome
                  </th>

                  {/* Marca */}
                  {isVisible('brand') && (
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell"
                    >
                      Marca
                    </th>
                  )}

                  {/* Slug */}
                  {isVisible('slug') && (
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden md:table-cell"
                    >
                      Slug
                    </th>
                  )}

                  {/* Status */}
                  {isVisible('status') && (
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      Status
                    </th>
                  )}

                  {/* Criada em */}
                  {isVisible('createdAt') && (
                    <th
                      scope="col"
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hidden sm:table-cell"
                    >
                      Criada em
                    </th>
                  )}

                  {/* Ações — alwaysVisible */}
                  <th scope="col" className="w-10">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {offers.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/50 transition-colors">
                    {/* Nome — alwaysVisible */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/offers/${o.id}` as Route}
                        className="font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {o.name}
                      </Link>
                    </td>

                    {/* Marca */}
                    {isVisible('brand') && (
                      <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                        {o.brandName}
                      </td>
                    )}

                    {/* Slug */}
                    {isVisible('slug') && (
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground/60 hidden md:table-cell">
                        {o.slug}
                      </td>
                    )}

                    {/* Status */}
                    {isVisible('status') && (
                      <td className="px-4 py-3">
                        <Badge
                          variant="secondary"
                          className={STATUS_CLASS[o.status] ?? ''}
                        >
                          {STATUS_LABEL[o.status] ?? o.status}
                        </Badge>
                      </td>
                    )}

                    {/* Criada em */}
                    {isVisible('createdAt') && (
                      <td className="px-4 py-3 text-xs text-muted-foreground/60 hidden sm:table-cell">
                        <time dateTime={o.createdAt.toISOString()}>
                          {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                        </time>
                      </td>
                    )}

                    {/* Ações — alwaysVisible */}
                    <td className="px-4 py-3">
                      <Link
                        href={`/offers/${o.id}` as Route}
                        className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                        aria-label={`Ver detalhes da oferta ${o.name}`}
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
