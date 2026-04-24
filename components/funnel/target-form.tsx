'use client'

/**
 * TargetForm — Dialog para criação de meta comercial (sales_target) de um funil.
 *
 * Módulo: MOD-FUNNEL
 * Spec: docs/20-domain/08-funnel-opportunity.md §3
 * Server Action: createSalesTargetAction
 */

import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createSalesTargetAction } from '@/app/(app)/funnels/[id]/targets/actions'
import type { ActionResult } from '@/lib/actions/result'
import type { SalesTarget } from '@/lib/db/schema/funnel'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Unit = 'revenue' | 'count'

interface TargetFormProps {
  funnelId: string
  /** Controlado externamente — quando true abre o dialog */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function TargetForm({ funnelId, open, onOpenChange }: TargetFormProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isControlled = open !== undefined
  const dialogOpen = isControlled ? open : internalOpen
  const setDialogOpen = isControlled
    ? (onOpenChange ?? setInternalOpen)
    : setInternalOpen

  const [unit, setUnit] = React.useState<Unit>('revenue')
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)
    setPending(true)

    const data = new FormData(e.currentTarget)
    const periodStart = data.get('periodStart') as string
    const periodEnd = data.get('periodEnd') as string
    const rawValue = data.get('targetValue') as string
    const selectedUnit = unit

    const input = {
      funnelId,
      periodStart,
      periodEnd,
      targetCount: selectedUnit === 'count' ? Math.round(Number(rawValue)) : undefined,
      targetRevenue: selectedUnit === 'revenue' ? rawValue : undefined,
    }

    let result: ActionResult<SalesTarget>
    try {
      result = await createSalesTargetAction(input)
    } catch {
      setErrorMsg('Erro inesperado ao criar meta.')
      setPending(false)
      return
    }

    setPending(false)

    if (!result.ok) {
      setErrorMsg(result.error.message)
      return
    }

    setDialogOpen(false)
    // Reseta campos
    ;(e.target as HTMLFormElement).reset()
    setUnit('revenue')
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm">
          Nova Meta
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nova Meta Comercial</DialogTitle>
          <DialogDescription>
            Defina o periodo e o valor alvo. O percentual atingido sera calculado
            automaticamente (disponivel no Sprint 10).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2" noValidate>
          {/* Periodo inicio */}
          <div className="space-y-1">
            <Label htmlFor="periodStart">Inicio do periodo</Label>
            <Input
              id="periodStart"
              name="periodStart"
              type="date"
              required
              aria-required="true"
              className="w-full"
            />
          </div>

          {/* Periodo fim */}
          <div className="space-y-1">
            <Label htmlFor="periodEnd">Fim do periodo</Label>
            <Input
              id="periodEnd"
              name="periodEnd"
              type="date"
              required
              aria-required="true"
              className="w-full"
            />
          </div>

          {/* Unidade */}
          <div className="space-y-1">
            <Label htmlFor="unit">Unidade da meta</Label>
            <Select
              value={unit}
              onValueChange={(v) => setUnit(v as Unit)}
              name="unit"
            >
              <SelectTrigger id="unit" className="w-full" aria-label="Unidade da meta">
                <SelectValue placeholder="Selecione a unidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Receita (R$)</SelectItem>
                <SelectItem value="count">Volume (qtd de vendas)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Valor alvo */}
          <div className="space-y-1">
            <Label htmlFor="targetValue">
              {unit === 'revenue' ? 'Receita alvo (R$)' : 'Quantidade alvo'}
            </Label>
            <Input
              id="targetValue"
              name="targetValue"
              type="number"
              min={unit === 'revenue' ? '0.01' : '1'}
              step={unit === 'revenue' ? '0.01' : '1'}
              required
              aria-required="true"
              placeholder={unit === 'revenue' ? 'Ex: 50000.00' : 'Ex: 100'}
              className="w-full"
            />
          </div>

          {/* Erro */}
          {errorMsg && (
            <p role="alert" className="text-sm font-medium text-red-600">
              {errorMsg}
            </p>
          )}

          {/* Acoes */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogOpen(false)
                setErrorMsg(null)
              }}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? 'Salvando...' : 'Salvar Meta'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
