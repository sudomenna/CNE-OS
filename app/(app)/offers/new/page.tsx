/**
 * /offers/new — Criação de oferta.
 * Server Component com formulário Client.
 * Exibe o stepper do wizard com Passo 1 ativo (shell visual).
 * Após createOfferAction redireciona para /offers/[id]?step=2.
 *
 * T-12 — spec: docs/70-ux/06-screen-offer-builder.md §1
 * T-6-17 — spec original: docs/20-domain/10-offer-engine.md §3.1
 */

import { isNull } from 'drizzle-orm'
import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import { brand, legalEntity } from '@/lib/db/schema/organization'
import { NewOfferForm } from '@/components/offer/new-offer-form'

export const metadata: Metadata = {
  title: 'Nova Oferta — CNE-OS',
}

// ---------------------------------------------------------------------------
// Static stepper shell (Step 1 active, no interaction needed)
// ---------------------------------------------------------------------------

function NewOfferStepper() {
  const steps = [
    { id: 1, label: 'Oferta' },
    { id: 2, label: 'Condições' },
    { id: 3, label: 'Preview & publicar' },
  ]

  return (
    <nav aria-label="Passos do wizard de oferta">
      <ol className="flex items-center gap-0">
        {steps.map((step, idx) => {
          const isActive = step.id === 1

          return (
            <li key={step.id} className="flex items-center">
              <span
                aria-current={isActive ? 'step' : undefined}
                className={[
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                  isActive
                    ? 'font-semibold text-primary'
                    : 'text-muted-foreground/50',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'border border-muted-foreground/30 text-muted-foreground/50',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {step.id}
                </span>
                {step.label}
              </span>

              {idx < steps.length - 1 && (
                <span aria-hidden="true" className="flex-1 h-px min-w-4 bg-border" />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NewOfferPage() {
  const [brands, legalEntities] = await Promise.all([
    db
      .select({ id: brand.id, name: brand.name })
      .from(brand)
      .where(isNull(brand.deletedAt))
      .orderBy(brand.name),

    db
      .select({ id: legalEntity.id, companyName: legalEntity.companyName })
      .from(legalEntity)
      .orderBy(legalEntity.companyName),
  ])

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link
          href={'/offers' as Route}
          className="hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          Ofertas
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium">Nova Oferta</span>
      </nav>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nova Oferta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Preencha os dados básicos. Condições, itens e opções de pagamento são configuradas
          no próximo passo.
        </p>
      </div>

      {/* Stepper shell — Step 1 ativo */}
      <div className="rounded-lg border border-border bg-card px-4 py-2">
        <NewOfferStepper />
      </div>

      {/* Form */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="max-w-2xl">
          <NewOfferForm brands={brands} legalEntities={legalEntities} redirectStep={2} />
        </div>
      </div>

      {/* Footer — só Cancelar no passo 1 de criação */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        <Link
          href={'/offers' as Route}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          form="new-offer-form"
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Avançar
        </button>
      </div>
    </div>
  )
}
