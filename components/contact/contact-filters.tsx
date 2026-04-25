'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'

const CLASSIFICATION_OPTIONS = [
  { value: '', label: 'Todas' },
  { value: 'lead', label: 'Lead' },
  { value: 'customer', label: 'Cliente' },
  { value: 'student', label: 'Aluno' },
  { value: 'paid_lead', label: 'Lead Pago' },
] as const

export function ContactFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const currentSearch = searchParams.get('search') ?? ''
  const currentClassification = searchParams.get('classification') ?? ''

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const formData = new FormData(e.currentTarget)
      const search = (formData.get('search') as string).trim()
      const classification = formData.get('classification') as string

      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (classification) params.set('classification', classification)
      params.set('page', '1')

      startTransition(() => {
        router.push(`/contacts?${params.toString()}`)
      })
    },
    [router],
  )

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      aria-label="Filtros de contatos"
    >
      <div className="flex-1">
        <label htmlFor="search" className="mb-1 block text-sm font-medium text-muted-foreground">
          Buscar
        </label>
        <input
          id="search"
          name="search"
          type="search"
          defaultValue={currentSearch}
          placeholder="Nome, CPF, telefone ou e-mail..."
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
          disabled={isPending}
        />
      </div>

      <div className="w-full sm:w-48">
        <label htmlFor="classification" className="mb-1 block text-sm font-medium text-muted-foreground">
          Classificacao
        </label>
        <select
          id="classification"
          name="classification"
          defaultValue={currentClassification}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:opacity-50"
          disabled={isPending}
        >
          {CLASSIFICATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {isPending ? 'Buscando...' : 'Buscar'}
      </button>
    </form>
  )
}
