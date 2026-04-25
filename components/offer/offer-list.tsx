'use client'

/**
 * OfferList — Client Component com tabela de ofertas e filtros.
 * Filtros: marca (brand_id) + status (offer_status).
 * T-6-17 — spec: docs/20-domain/10-offer-engine.md
 */

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import type { Route } from 'next'
import { Badge } from '@/components/ui/badge'

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
  draft: 'bg-slate-100 text-slate-600 hover:bg-slate-100',
  active: 'bg-green-100 text-green-700 hover:bg-green-100',
  paused: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100',
  archived: 'bg-red-100 text-red-600 hover:bg-red-100',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function OfferList({
  offers,
  brands,
  selectedBrandId,
  selectedStatus,
}: OfferListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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
            className="text-xs font-medium text-slate-600"
          >
            Marca
          </label>
          <select
            id="filter-brand"
            value={selectedBrandId}
            onChange={(e) => updateFilter('brand_id', e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            className="text-xs font-medium text-slate-600"
          >
            Status
          </label>
          <select
            id="filter-status"
            value={selectedStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="h-9 rounded-md border border-input bg-white px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 py-16 text-center">
          <p className="text-sm font-medium text-slate-600">
            Nenhuma oferta encontrada
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Ajuste os filtros ou crie uma nova oferta.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Nome
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden md:table-cell">
                  Marca
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden md:table-cell">
                  Slug
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">
                  Criada em
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offers.map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/offers/${o.id}` as Route}
                      className="font-medium text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded"
                    >
                      {o.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">
                    {o.brandName}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 hidden md:table-cell">
                    {o.slug}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={STATUS_CLASS[o.status] ?? ''}
                    >
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 hidden sm:table-cell">
                    <time dateTime={o.createdAt.toISOString()}>
                      {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                    </time>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/offers/${o.id}` as Route}
                      className="text-xs text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 rounded px-1"
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
      )}
    </div>
  )
}
