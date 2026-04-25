'use client'

/**
 * NewOfferForm — formulário de criação de oferta.
 * Campos: nome, slug (auto-gerado via normalizeSlug), marca,
 *         entidade legal emissora, descrição.
 * Ao submeter → chama createOfferAction → redireciona para /offers/[id].
 * T-6-17 — spec: docs/20-domain/10-offer-engine.md §3.1
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useActionState } from 'react'
import type { Route } from 'next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createOfferAction } from '@/app/(app)/offers/actions'
import { normalizeSlug } from '@/lib/domain/catalog/normalize'
import type { ActionResult } from '@/lib/actions/result'
import type { Offer } from '@/lib/db/schema/offer'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BrandOption {
  id: string
  name: string
}

interface LegalEntityOption {
  id: string
  companyName: string
}

interface NewOfferFormProps {
  brands: BrandOption[]
  legalEntities: LegalEntityOption[]
}

type FormState = ActionResult<Offer> | null

// ---------------------------------------------------------------------------
// Action wrapper compatible with useActionState
// ---------------------------------------------------------------------------

async function handleCreateOffer(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  return createOfferAction({
    brandId: formData.get('brandId'),
    issuingLegalEntityId: formData.get('issuingLegalEntityId'),
    name: formData.get('name'),
    slug: formData.get('slug'),
    description: formData.get('description') || null,
    type: 'regular',
  })
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewOfferForm({ brands, legalEntities }: NewOfferFormProps) {
  const router = useRouter()
  const [state, dispatch, isPending] = useActionState<FormState, FormData>(
    handleCreateOffer,
    null,
  )

  // Redirect to detail page on success
  React.useEffect(() => {
    if (state?.ok) {
      router.push(`/offers/${state.data.id}` as Route)
    }
  }, [state, router])

  const errorMessage = state && !state.ok ? state.error.message : null

  // Auto-generate slug from name
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const slugInput = document.getElementById('nof-slug') as HTMLInputElement | null
    if (slugInput && !slugInput.dataset.touched) {
      slugInput.value = normalizeSlug(e.target.value)
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.currentTarget.dataset.touched = 'true'
    // Normalize on blur to final kebab-case
    e.currentTarget.value = e.currentTarget.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-{2,}/g, '-')
  }

  function handleSlugBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.value = normalizeSlug(e.currentTarget.value)
  }

  return (
    <form action={dispatch} className="flex flex-col gap-5">
      {/* Marca */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nof-brandId">
          Marca <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <select
          id="nof-brandId"
          name="brandId"
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Selecione uma marca…</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {/* Entidade legal emissora */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nof-legalEntityId">
          Entidade legal emissora <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <select
          id="nof-legalEntityId"
          name="issuingLegalEntityId"
          required
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <option value="">Selecione a entidade emissora…</option>
          {legalEntities.map((le) => (
            <option key={le.id} value={le.id}>
              {le.companyName}
            </option>
          ))}
        </select>
        <p className="text-xs text-slate-400">
          Imutável após a primeira venda aprovada (INV-OFFER-03).
        </p>
      </div>

      {/* Nome */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nof-name">
          Nome <span aria-hidden="true" className="text-destructive">*</span>
        </Label>
        <Input
          id="nof-name"
          name="name"
          placeholder="Curso Avançado de React"
          required
          minLength={1}
          maxLength={255}
          autoComplete="off"
          onChange={handleNameChange}
        />
      </div>

      {/* Slug */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nof-slug">
          Slug{' '}
          <span className="text-xs text-slate-400 font-normal">
            (auto-gerado; apenas letras minúsculas, números e hífens)
          </span>
        </Label>
        <Input
          id="nof-slug"
          name="slug"
          placeholder="curso-avancado-de-react"
          required
          minLength={1}
          maxLength={120}
          pattern="[a-z0-9][a-z0-9-]*"
          autoComplete="off"
          onChange={handleSlugChange}
          onBlur={handleSlugBlur}
        />
        <p className="text-xs text-slate-400">
          Deve ser único por marca. Usado em URLs e referências internas.
        </p>
      </div>

      {/* Descrição */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nof-description">Descrição</Label>
        <Textarea
          id="nof-description"
          name="description"
          placeholder="Descreva o objetivo comercial desta oferta…"
          rows={3}
          maxLength={2000}
          className="resize-none"
        />
      </div>

      {/* Erro */}
      {errorMessage && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      )}

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Criando…' : 'Criar oferta'}
        </Button>
      </div>
    </form>
  )
}
