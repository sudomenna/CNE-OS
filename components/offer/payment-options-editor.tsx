'use client'

/**
 * PaymentOptionsEditor — lista e adiciona opções de pagamento para uma condição.
 *
 * - Lista payment options com método, preço, installments (se aplicável) e status ativo.
 * - Botão "Adicionar" → Dialog com form:
 *     - method select (pix, credit_card, installments, boleto, custom)
 *     - price (numérico, ≥ 0)
 *     - installments (inteiro > 1, visível apenas quando method='installments')
 * - Chama addPaymentOptionAction.
 *
 * T-6-18 — spec: docs/20-domain/10-offer-engine.md §3.6, INV-OFFER-08
 */

import * as React from 'react'
import { useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { addPaymentOptionAction } from '@/app/(app)/offers/actions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaymentMethod = 'pix' | 'credit_card' | 'installments' | 'boleto' | 'custom'

export interface PaymentOptionRowData {
  id: string
  method: PaymentMethod
  price: string
  installments: number | null
  isActive: boolean
}

interface PaymentOptionsEditorProps {
  conditionId: string
  paymentOptions: PaymentOptionRowData[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METHOD_LABELS: Record<PaymentMethod, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de crédito',
  installments: 'Parcelado',
  boleto: 'Boleto',
  custom: 'Personalizado',
}

const ALL_METHODS: PaymentMethod[] = ['pix', 'credit_card', 'installments', 'boleto', 'custom']

// ---------------------------------------------------------------------------
// PaymentOptionsEditor
// ---------------------------------------------------------------------------

export function PaymentOptionsEditor({
  conditionId,
  paymentOptions,
}: PaymentOptionsEditorProps) {
  const [open, setOpen] = React.useState(false)

  // Form state
  const [method, setMethod] = React.useState<PaymentMethod>('pix')
  const [price, setPrice] = React.useState('')
  const [installments, setInstallments] = React.useState('')
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // INV-OFFER-08: installments field only when method='installments'
  const showInstallments = method === 'installments'

  function resetForm() {
    setMethod('pix')
    setPrice('')
    setInstallments('')
    setFormError(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetForm()
  }

  function handleMethodChange(value: string) {
    setMethod(value as PaymentMethod)
    setInstallments('')
    setFormError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)

    // Validate price
    const priceNum = parseFloat(price.replace(',', '.'))
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Informe um preço válido (≥ 0).')
      return
    }

    // INV-OFFER-08: installments required and > 1 when method='installments'
    if (showInstallments) {
      const installmentsNum = parseInt(installments, 10)
      if (isNaN(installmentsNum) || installmentsNum <= 1) {
        setFormError('Para parcelado, informe o número de parcelas (deve ser maior que 1).')
        return
      }
    } else if (installments.trim()) {
      setFormError('O campo parcelas só é válido para o método "Parcelado".')
      return
    }

    const payload = {
      offerConditionId: conditionId,
      method,
      price: priceNum,
      installments:
        showInstallments && installments.trim()
          ? parseInt(installments, 10)
          : undefined,
    }

    startTransition(async () => {
      const result = await addPaymentOptionAction(payload)
      if (result.ok) {
        setOpen(false)
        resetForm()
      } else {
        setFormError(result.error?.message ?? 'Erro ao adicionar opção de pagamento.')
      }
    })
  }

  return (
    <section aria-label="Opções de pagamento da condição">
      {/* Options list */}
      <div
        role="list"
        aria-label="Lista de opções de pagamento"
        className="space-y-2"
      >
        {paymentOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma opção de pagamento adicionada ainda.</p>
        ) : (
          paymentOptions.map((opt) => (
            <div
              key={opt.id}
              role="listitem"
              className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm"
            >
              {/* Method badge */}
              <Badge
                variant="secondary"
                aria-label={`Método: ${METHOD_LABELS[opt.method]}`}
              >
                {METHOD_LABELS[opt.method]}
              </Badge>

              {/* Price */}
              <span
                className="font-semibold text-foreground tabular-nums"
                aria-label={`Preço: R$ ${Number(opt.price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
              >
                {Number(opt.price).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL',
                })}
              </span>

              {/* Installments */}
              {opt.method === 'installments' && opt.installments != null && (
                <span
                  className="text-xs text-muted-foreground tabular-nums"
                  aria-label={`${opt.installments}x`}
                >
                  {opt.installments}x
                </span>
              )}

              {/* Active indicator */}
              <span
                className={[
                  'ml-auto text-xs font-medium',
                  opt.isActive ? 'text-green-600' : 'text-muted-foreground/60',
                ].join(' ')}
                aria-label={opt.isActive ? 'Ativa' : 'Inativa'}
              >
                {opt.isActive ? 'Ativa' : 'Inativa'}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Add button */}
      <div className="mt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          Adicionar Opção de Pagamento
        </Button>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nova Opção de Pagamento</DialogTitle>
            <DialogDescription>
              Configure o método, preço e parcelamento desta opção de pagamento.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} noValidate className="space-y-5 pt-2">
            {/* Method */}
            <div className="space-y-1.5">
              <Label htmlFor="pay-method">
                Método <span aria-hidden="true" className="text-red-500">*</span>
              </Label>
              <Select value={method} onValueChange={handleMethodChange}>
                <SelectTrigger id="pay-method" aria-required="true">
                  <SelectValue placeholder="Selecione o método" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Price */}
            <div className="space-y-1.5">
              <Label htmlFor="pay-price">
                Preço (R$) <span aria-hidden="true" className="text-red-500">*</span>
              </Label>
              <Input
                id="pay-price"
                type="number"
                min={0}
                step={0.01}
                placeholder="Ex: 299.90"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
                aria-required="true"
                className="w-40"
              />
            </div>

            {/* Installments — shown only when method='installments' */}
            {/* INV-OFFER-08: method='installments' exige installments > 1 */}
            {showInstallments && (
              <div className="space-y-1.5">
                <Label htmlFor="pay-installments">
                  Parcelas <span aria-hidden="true" className="text-red-500">*</span>
                </Label>
                <Input
                  id="pay-installments"
                  type="number"
                  min={2}
                  step={1}
                  placeholder="Ex: 12"
                  value={installments}
                  onChange={(e) => setInstallments(e.target.value)}
                  required
                  aria-required="true"
                  aria-describedby="pay-installments-hint"
                  className="w-28"
                />
                <p id="pay-installments-hint" className="text-xs text-muted-foreground/60">
                  Mínimo 2 parcelas (INV-OFFER-08).
                </p>
              </div>
            )}

            {/* Error */}
            {formError && (
              <p
                role="alert"
                className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600"
              >
                {formError}
              </p>
            )}

            <DialogFooter className="pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isPending}>
                  Cancelar
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Salvando…' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
