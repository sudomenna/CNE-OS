'use client'

/**
 * DelinquencyFilters — filtros do dashboard de inadimplência.
 *
 * Client Component: interatividade via URL search params.
 * Props: opções de marca vindas do Server Component pai.
 *
 * T-9-15: docs/20-domain/13-subscription-billing.md §5
 */

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

export type BrandOption = {
  id: string
  name: string
}

export type AgeBucket = '0-30' | '31-60' | '61-90' | '90+'

const AGE_BUCKET_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Todos os atrasos' },
  { value: '0-30', label: '0–30 dias' },
  { value: '31-60', label: '31–60 dias' },
  { value: '61-90', label: '61–90 dias' },
  { value: '90+', label: 'Acima de 90 dias' },
]

interface DelinquencyFiltersProps {
  brands: BrandOption[]
}

export function DelinquencyFilters({ brands }: DelinquencyFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentBrand = searchParams.get('brand_id') ?? ''
  const currentBucket = searchParams.get('bucket') ?? ''
  const currentMinAmount = searchParams.get('min_amount') ?? ''
  const currentMaxAmount = searchParams.get('max_amount') ?? ''

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)
      const brandId = formData.get('brand_id') as string
      const bucket = formData.get('bucket') as string
      const minAmount = formData.get('min_amount') as string
      const maxAmount = formData.get('max_amount') as string

      const params = new URLSearchParams()
      if (brandId) params.set('brand_id', brandId)
      if (bucket) params.set('bucket', bucket)
      if (minAmount) params.set('min_amount', minAmount)
      if (maxAmount) params.set('max_amount', maxAmount)

      startTransition(() => {
        router.push(`/billing/delinquency?${params.toString()}`)
      })
    },
    [router],
  )

  const handleReset = useCallback(() => {
    startTransition(() => {
      router.push('/billing/delinquency')
    })
  }, [router])

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      aria-label="Filtros de inadimplencia"
    >
      {/* Marca */}
      <div className="w-full sm:w-52">
        <label htmlFor="brand_id" className="mb-1 block text-sm font-medium text-muted-foreground">
          Marca
        </label>
        <select
          id="brand_id"
          name="brand_id"
          defaultValue={currentBrand}
          disabled={isPending}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
        >
          <option value="">Todas as marcas</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Bucket de atraso */}
      <div className="w-full sm:w-48">
        <label htmlFor="bucket" className="mb-1 block text-sm font-medium text-muted-foreground">
          Idade do atraso
        </label>
        <select
          id="bucket"
          name="bucket"
          defaultValue={currentBucket}
          disabled={isPending}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
        >
          {AGE_BUCKET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Faixa de valor */}
      <div className="w-full sm:w-36">
        <label htmlFor="min_amount" className="mb-1 block text-sm font-medium text-muted-foreground">
          Valor mínimo (R$)
        </label>
        <input
          id="min_amount"
          name="min_amount"
          type="number"
          min="0"
          step="0.01"
          defaultValue={currentMinAmount}
          placeholder="0,00"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
        />
      </div>

      <div className="w-full sm:w-36">
        <label htmlFor="max_amount" className="mb-1 block text-sm font-medium text-muted-foreground">
          Valor máximo (R$)
        </label>
        <input
          id="max_amount"
          name="max_amount"
          type="number"
          min="0"
          step="0.01"
          defaultValue={currentMaxAmount}
          placeholder="Sem limite"
          disabled={isPending}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
        />
      </div>

      {/* Ações */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {isPending ? 'Filtrando...' : 'Filtrar'}
        </button>

        <button
          type="button"
          onClick={handleReset}
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          Limpar
        </button>
      </div>
    </form>
  )
}
