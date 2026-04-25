'use client'

/**
 * RefundWizard — wizard 3 passos para abertura de reembolso
 *
 * Passo 1: Motivo + valor do reembolso
 * Passo 2: Preview dos efeitos (entitlements que serão revogados)
 * Passo 3: Confirmação + submit
 *
 * T-8-19: docs/20-domain/14-refund.md §7
 *         docs/30-contracts/05-api-server-actions.md
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EffectsPreview } from './effects-preview'
import { getRefundPreview, submitOpenRefund } from '@/app/(app)/transactions/[id]/refund/actions'
import type { RefundPreview } from '@/app/(app)/transactions/[id]/refund/actions'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3

type Props = {
  transactionId: string
  transactionAmount: string
  currency: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(amount: string, currency: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(amount))
}

const STEPS = [
  { label: 'Motivo' },
  { label: 'Efeitos' },
  { label: 'Confirmar' },
]

// ---------------------------------------------------------------------------
// StepIndicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  return (
    <nav aria-label="Passos do wizard de reembolso" className="mb-8">
      <ol className="flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const num = (idx + 1) as Step
          const done = num < current
          const active = num === current
          return (
            <li key={step.label} className="flex items-center">
              {idx > 0 && (
                <div
                  className={`h-px w-12 sm:w-20 ${done ? 'bg-red-500' : 'bg-muted'}`}
                  aria-hidden="true"
                />
              )}
              <div className="flex flex-col items-center gap-1">
                <span
                  aria-current={active ? 'step' : undefined}
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold
                    ${active ? 'bg-red-600 text-white' : done ? 'bg-red-100 text-red-600' : 'bg-muted text-muted-foreground/60'}`}
                >
                  {done ? '✓' : num}
                </span>
                <span className={`text-xs ${active ? 'text-red-600 font-medium' : 'text-muted-foreground/60'}`}>
                  {step.label}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

// ---------------------------------------------------------------------------
// RefundWizard
// ---------------------------------------------------------------------------

export function RefundWizard({ transactionId, transactionAmount, currency }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [isPending, startTransition] = useTransition()

  // Campos do passo 1
  const [amount, setAmount] = useState(transactionAmount)
  const [reason, setReason] = useState('')

  // Dados carregados no passo 2
  const [preview, setPreview] = useState<RefundPreview | null>(null)

  // Feedback de erro
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function handleBack() {
    setError(null)
    setStep((s) => Math.max(1, s - 1) as Step)
  }

  function handleStep1Submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Informe um valor válido maior que zero.')
      return
    }
    if (reason.trim().length < 10) {
      setError('Motivo deve ter ao menos 10 caracteres.')
      return
    }

    startTransition(async () => {
      const result = await getRefundPreview({ transactionId })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      // Sobrescreve amount do preview com o valor que o usuário digitou
      setPreview({ ...result.data, amount })
      setStep(2)
    })
  }

  function handleStep2Next() {
    setError(null)
    setStep(3)
  }

  function handleStep3Confirm() {
    setError(null)
    startTransition(async () => {
      const result = await submitOpenRefund({ transactionId, amount, reason })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      setSuccess(true)
      // Navega de volta para o detalhe da transação após 1,5s
      setTimeout(() => {
        router.push(`/transactions/${transactionId}`)
        router.refresh()
      }, 1500)
    })
  }

  // -------------------------------------------------------------------------
  // Render de sucesso
  // -------------------------------------------------------------------------

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <span className="text-2xl text-green-600" aria-hidden="true">✓</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground">Reembolso solicitado!</h2>
        <p className="text-sm text-muted-foreground">Redirecionando para a transação…</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl">
      <StepIndicator current={step} />

      {/* ------------------------------------------------------------------ */}
      {/* Passo 1 — Motivo + Valor                                            */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <form onSubmit={handleStep1Submit} className="space-y-6" noValidate>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Motivo do reembolso</h2>
            <p className="text-sm text-muted-foreground">
              Informe o motivo e o valor a ser reembolsado.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="refund-amount" className="text-sm font-medium text-muted-foreground">
              Valor ({currency})
            </label>
            <input
              id="refund-amount"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              aria-describedby={error ? 'wizard-error' : undefined}
            />
            <p className="text-xs text-muted-foreground/60">
              Máximo: {formatCurrency(transactionAmount, currency)}
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="refund-reason" className="text-sm font-medium text-muted-foreground">
              Motivo <span className="text-muted-foreground/60">(mín. 10 caracteres)</span>
            </label>
            <textarea
              id="refund-reason"
              rows={4}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva o motivo do reembolso…"
              className="block w-full rounded-md border border-border px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
              aria-describedby={error ? 'wizard-error' : undefined}
            />
            <p className="text-xs text-muted-foreground/60 text-right">{reason.length}/1000</p>
          </div>

          {error && (
            <p id="wizard-error" role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
            >
              {isPending ? 'Carregando…' : 'Próximo →'}
            </button>
          </div>
        </form>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Passo 2 — Preview dos efeitos                                       */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 && preview && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Efeitos previstos</h2>
            <p className="text-sm text-muted-foreground">
              Revise os efeitos que ocorrerão ao confirmar o reembolso.
            </p>
          </div>

          <EffectsPreview
            amount={preview.amount}
            currency={preview.currency}
            contactName={preview.contactName}
            offerName={preview.offerName}
            entitlementsToRevoke={preview.entitlementsToRevoke}
          />

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={handleStep2Next}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
            >
              Confirmar efeitos →
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Passo 3 — Confirmação final                                         */}
      {/* ------------------------------------------------------------------ */}
      {step === 3 && preview && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Confirmar reembolso</h2>
            <p className="text-sm text-muted-foreground">
              Esta ação é irreversível. O reembolso será registrado e ficará aguardando aprovação.
            </p>
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 px-5 py-4 space-y-3">
            <p className="text-sm font-medium text-red-800">Resumo da solicitação</p>
            <div className="space-y-1.5 text-sm text-red-700">
              <div className="flex justify-between">
                <span>Valor:</span>
                <span className="font-semibold">{formatCurrency(preview.amount, preview.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Contato:</span>
                <span className="font-medium">{preview.contactName}</span>
              </div>
              <div className="flex justify-between">
                <span>Direitos revogados:</span>
                <span className="font-medium">{preview.entitlementsToRevoke.length}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-red-200">
              <p className="text-xs text-red-600 font-medium">Motivo:</p>
              <p className="text-xs text-red-700 mt-0.5">{reason}</p>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <div className="flex justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={handleStep3Confirm}
              disabled={isPending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50"
            >
              {isPending ? 'Enviando…' : 'Solicitar Reembolso'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
