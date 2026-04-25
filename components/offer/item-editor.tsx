'use client'

/**
 * ItemEditor — editor visual de itens de uma condição de oferta.
 *
 * Responsabilidades:
 * - Lista itens existentes via <ItemRow />.
 * - Botão "Adicionar Item" abre Dialog com formulário.
 * - Formulário:
 *   - Select `kind` (main/bonus/upsell/order_bump/complement/commercial_benefit).
 *   - kind='commercial_benefit' → exibe select de benefícios; oculta select de produtos.
 *   - kind≠'commercial_benefit' → exibe select de produtos; oculta select de benefícios.
 *     Reflete INV-OFFER-07 / CHECK ck_offer_condition_item_ref_exclusive na UI.
 *   - quantity (número, min 1).
 *   - vigency_months (opcional).
 *   - discount (percentual 0-100, opcional).
 * - Ao submeter chama addConditionItemAction.
 *
 * T-6-20 — spec: docs/20-domain/10-offer-engine.md §3.5, INV-OFFER-07
 */

import * as React from 'react'
import { useTransition } from 'react'

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ItemRow, type ItemRowData, type OfferConditionItemKind } from './item-row'
import { addConditionItemAction } from '@/app/(app)/offers/actions'

// ---------------------------------------------------------------------------
// Catalog option types (passed from Server Component parent)
// ---------------------------------------------------------------------------

export interface ProductOption {
  id: string
  name: string
}

export interface BenefitOption {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ItemEditorProps {
  conditionId: string
  items: ItemRowData[]
  products: ProductOption[]
  benefits: BenefitOption[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_KINDS: OfferConditionItemKind[] = [
  'main',
  'bonus',
  'upsell',
  'order_bump',
  'complement',
  'commercial_benefit',
]

const KIND_LABEL: Record<OfferConditionItemKind, string> = {
  main: 'Principal',
  bonus: 'Bônus',
  upsell: 'Upsell',
  order_bump: 'Order Bump',
  complement: 'Complemento',
  commercial_benefit: 'Benefício Comercial',
}

// ---------------------------------------------------------------------------
// ItemEditor
// ---------------------------------------------------------------------------

export function ItemEditor({
  conditionId,
  items,
  products,
  benefits,
}: ItemEditorProps) {
  const [open, setOpen] = React.useState(false)

  // Form state — controlled to drive the product/benefit conditional display.
  const [kind, setKind] = React.useState<OfferConditionItemKind>('main')
  const [productId, setProductId] = React.useState<string>('')
  const [benefitId, setBenefitId] = React.useState<string>('')
  const [quantity, setQuantity] = React.useState<number>(1)
  const [vigencyMonths, setVigencyMonths] = React.useState<string>('')
  const [discount, setDiscount] = React.useState<string>('')
  const [error, setError] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // INV-OFFER-07: 'commercial_benefit' uses benefit selector; all others use product selector.
  const isBenefitKind = kind === 'commercial_benefit'

  function resetForm() {
    setKind('main')
    setProductId('')
    setBenefitId('')
    setQuantity(1)
    setVigencyMonths('')
    setDiscount('')
    setError(null)
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetForm()
  }

  function handleKindChange(value: string) {
    setKind(value as OfferConditionItemKind)
    // Clear the irrelevant reference when switching kind
    if (value === 'commercial_benefit') {
      setProductId('')
    } else {
      setBenefitId('')
    }
    setError(null)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    // Client-side guard mirroring INV-OFFER-07
    if (isBenefitKind && !benefitId) {
      setError('Selecione um benefício comercial.')
      return
    }
    if (!isBenefitKind && !productId) {
      setError('Selecione um produto.')
      return
    }
    if (quantity < 1) {
      setError('A quantidade deve ser no mínimo 1.')
      return
    }
    const vigencyNum = vigencyMonths.trim() ? Number(vigencyMonths) : null
    if (vigencyNum !== null && (!Number.isInteger(vigencyNum) || vigencyNum < 1)) {
      setError('Vigência deve ser um número inteiro positivo.')
      return
    }
    const discountNum = discount.trim() ? Number(discount) : null
    if (discountNum !== null && (discountNum < 0 || discountNum > 100)) {
      setError('Desconto deve estar entre 0 e 100.')
      return
    }

    const payload = {
      offerConditionId: conditionId,
      kind,
      productId: isBenefitKind ? null : productId,
      commercialBenefitId: isBenefitKind ? benefitId : null,
      quantity,
      vigencyMonths: vigencyNum,
      discount: discountNum,
    }

    startTransition(async () => {
      const result = await addConditionItemAction(payload)
      if (result.ok) {
        setOpen(false)
        resetForm()
      } else {
        setError(result.error?.message ?? 'Erro ao adicionar item.')
      }
    })
  }

  return (
    <section aria-label="Itens da condição">
      {/* Item list */}
      <div
        role="list"
        aria-label="Lista de itens"
        className="space-y-2"
      >
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum item adicionado ainda.
          </p>
        ) : (
          items
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((item) => (
              <div key={item.id} role="listitem">
                <ItemRow item={item} />
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
          Adicionar Item
        </Button>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Adicionar Item</DialogTitle>
            <DialogDescription>
              Preencha os campos abaixo para adicionar um item a esta condição de oferta.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} noValidate className="space-y-5 pt-2">
            {/* Kind */}
            <div className="space-y-1.5">
              <Label htmlFor="item-kind">Tipo do item</Label>
              <Select value={kind} onValueChange={handleKindChange}>
                <SelectTrigger id="item-kind" aria-required="true">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product selector — shown only when kind != 'commercial_benefit' */}
            {/* INV-OFFER-07: product_id IS NOT NULL only when kind <> 'commercial_benefit' */}
            {!isBenefitKind && (
              <div className="space-y-1.5">
                <Label htmlFor="item-product">
                  Produto <span aria-hidden="true" className="text-red-500">*</span>
                </Label>
                <Select value={productId} onValueChange={setProductId}>
                  <SelectTrigger
                    id="item-product"
                    aria-required="true"
                    aria-describedby={error && !productId ? 'item-error' : undefined}
                  >
                    <SelectValue placeholder="Selecione um produto" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        Nenhum produto disponível.
                      </div>
                    ) : (
                      products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Commercial benefit selector — shown only when kind == 'commercial_benefit' */}
            {/* INV-OFFER-07: commercial_benefit_id IS NOT NULL only when kind = 'commercial_benefit' */}
            {isBenefitKind && (
              <div className="space-y-1.5">
                <Label htmlFor="item-benefit">
                  Benefício Comercial <span aria-hidden="true" className="text-red-500">*</span>
                </Label>
                <Select value={benefitId} onValueChange={setBenefitId}>
                  <SelectTrigger
                    id="item-benefit"
                    aria-required="true"
                    aria-describedby={error && !benefitId ? 'item-error' : undefined}
                  >
                    <SelectValue placeholder="Selecione um benefício" />
                  </SelectTrigger>
                  <SelectContent>
                    {benefits.length === 0 ? (
                      <div className="px-2 py-3 text-sm text-muted-foreground">
                        Nenhum benefício disponível.
                      </div>
                    ) : (
                      benefits.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-1.5">
              <Label htmlFor="item-quantity">
                Quantidade <span aria-hidden="true" className="text-red-500">*</span>
              </Label>
              <Input
                id="item-quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                required
                aria-required="true"
                className="w-28"
              />
            </div>

            {/* Vigency months (optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="item-vigency">
                Vigência (meses){' '}
                <span className="text-xs font-normal text-muted-foreground/60">— vazio = vitalício</span>
              </Label>
              <Input
                id="item-vigency"
                type="number"
                min={1}
                step={1}
                placeholder="Ex: 12"
                value={vigencyMonths}
                onChange={(e) => setVigencyMonths(e.target.value)}
                className="w-28"
              />
            </div>

            {/* Discount (optional, 0-100) */}
            <div className="space-y-1.5">
              <Label htmlFor="item-discount">
                Desconto (%){' '}
                <span className="text-xs font-normal text-muted-foreground/60">— opcional</span>
              </Label>
              <Input
                id="item-discount"
                type="number"
                min={0}
                max={100}
                step={0.01}
                placeholder="Ex: 10"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="w-28"
              />
            </div>

            {/* Error message */}
            {error && (
              <p
                id="item-error"
                role="alert"
                className="text-sm text-red-600"
              >
                {error}
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
