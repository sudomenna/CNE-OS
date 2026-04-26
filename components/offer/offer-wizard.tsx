'use client'

/**
 * OfferWizard — shell de wizard de 3 passos para edição de oferta.
 *
 * Passo 1: Oferta (metadados)
 * Passo 2: Condições (ConditionTabs — comportamento idêntico ao atual)
 * Passo 3: Preview & Publicar (DecisionPreview + botão Publicar)
 *
 * Lê query param `step` da URL para inicialização (ex: /offers/[id]?step=2).
 *
 * T-12 — spec: docs/70-ux/06-screen-offer-builder.md §1
 */

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { Route } from 'next'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

import { OfferStep1Form } from '@/components/offer/offer-step1-form'
import { ConditionTabs } from '@/components/offer/condition-tabs'
import type { ConditionData } from '@/components/offer/condition-tabs'
import { DecisionPreview } from '@/components/offer/decision-preview'
import type { ProductOption, BenefitOption } from '@/components/offer/item-editor'

import { publishOfferAction } from '@/app/(app)/offers/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OfferStatus = 'draft' | 'active' | 'paused' | 'archived'

interface OfferWizardProps {
  offerRow: {
    id: string
    name: string
    slug: string
    status: string
    type: 'regular' | 'renewal'
    description: string | null
    brandId: string
    brandName: string
  }
  conditionData: ConditionData[]
  products: ProductOption[]
  benefits: BenefitOption[]
}

// ---------------------------------------------------------------------------
// Status badge helpers (duplicated from page — wizard owns the header now)
// ---------------------------------------------------------------------------

const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Arquivada',
}

const OFFER_STATUS_VARIANT: Record<
  OfferStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
  archived: 'destructive',
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

const STEPS = [
  { id: 1, label: 'Oferta' },
  { id: 2, label: 'Condições' },
  { id: 3, label: 'Preview & publicar' },
] as const

function WizardStepper({
  currentStep,
  onStepClick,
}: {
  currentStep: 1 | 2 | 3
  onStepClick: (step: 1 | 2 | 3) => void
}) {
  return (
    <nav aria-label="Passos do wizard de oferta">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const isActive = currentStep === step.id
          const isPast = currentStep > step.id

          return (
            <React.Fragment key={step.id}>
              <li>
                <button
                  type="button"
                  onClick={() => onStepClick(step.id as 1 | 2 | 3)}
                  aria-current={isActive ? 'step' : undefined}
                  className={[
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'font-semibold text-primary'
                      : isPast
                        ? 'text-muted-foreground hover:text-foreground'
                        : 'text-muted-foreground/50 hover:text-muted-foreground',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isPast
                          ? 'bg-muted text-muted-foreground'
                          : 'border border-muted-foreground/30 text-muted-foreground/50',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {step.id}
                  </span>
                  {step.label}
                </button>
              </li>

              {idx < STEPS.length - 1 && (
                <li aria-hidden="true" className="flex-1 h-px min-w-4 bg-border" />
              )}
            </React.Fragment>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OfferWizard({ offerRow, conditionData, products, benefits }: OfferWizardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Read initial step from query param (?step=2)
  const initialStep = (() => {
    const raw = searchParams.get('step')
    const parsed = raw ? parseInt(raw, 10) : 1
    if (parsed === 2 || parsed === 3) return parsed
    return 1
  })()

  const [step, setStep] = React.useState<1 | 2 | 3>(initialStep as 1 | 2 | 3)
  const [publishError, setPublishError] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isArchived = offerRow.status === 'archived'
  const statusLabel = OFFER_STATUS_LABEL[offerRow.status as OfferStatus]
  const statusVariant = OFFER_STATUS_VARIANT[offerRow.status as OfferStatus]

  function handlePublish() {
    setPublishError(null)
    startTransition(async () => {
      const result = await publishOfferAction({ offerId: offerRow.id })
      if (!result.ok) {
        setPublishError(result.error.message)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">{offerRow.name}</h1>
          <Badge
            variant={statusVariant}
            aria-label={`Status da oferta: ${statusLabel}`}
          >
            {statusLabel}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{offerRow.brandName}</span>
          {' · '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono text-muted-foreground">
            {offerRow.slug}
          </code>
          {offerRow.type === 'renewal' && (
            <span className="ml-2 text-xs font-medium text-purple-600">[Renovação]</span>
          )}
        </p>
        {offerRow.description && (
          <p className="text-sm text-muted-foreground max-w-xl">{offerRow.description}</p>
        )}
      </div>

      {/* Archived banner */}
      {isArchived && (
        <div
          role="status"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          Esta oferta está arquivada. Os campos estão em modo somente leitura.
        </div>
      )}

      {/* Stepper */}
      <div className="rounded-lg border border-border bg-card px-4 py-2">
        <WizardStepper currentStep={step} onStepClick={setStep} />
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-border bg-card p-6">
        {step === 1 && (
          <div className="max-w-2xl">
            <OfferStep1Form
              offerId={offerRow.id}
              defaultValues={{
                name: offerRow.name,
                slug: offerRow.slug,
                description: offerRow.description,
                type: offerRow.type,
              }}
            />
          </div>
        )}

        {step === 2 && (
          <ConditionTabs
            offerId={offerRow.id}
            conditions={conditionData}
            products={products}
            benefits={benefits}
          />
        )}

        {step === 3 && (
          <div className="space-y-6">
            <DecisionPreview offerId={offerRow.id} />

            {publishError && (
              <p
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                {publishError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3">
        {/* Left side */}
        <div className="flex gap-2">
          {step === 1 && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/offers' as Route)}
            >
              Cancelar
            </Button>
          )}
          {step > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((prev) => (prev - 1) as 1 | 2 | 3)}
            >
              Voltar
            </Button>
          )}
        </div>

        {/* Right side */}
        <div className="flex gap-2">
          {/* Salvar rascunho — no-op nos passos 2/3 (dados salvos inline pelas actions) */}
          <Button
            type={step === 1 ? 'submit' : 'button'}
            form={step === 1 ? 'offer-step1-form' : undefined}
            variant="outline"
          >
            Salvar rascunho
          </Button>

          {step < 3 && (
            <Button
              type="button"
              onClick={() => setStep((prev) => (prev + 1) as 2 | 3)}
            >
              Avançar
            </Button>
          )}

          {step === 3 && (
            <Button
              type="button"
              disabled={isPending || isArchived}
              onClick={handlePublish}
            >
              {isPending ? 'Publicando…' : 'Publicar'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
