'use client'

/**
 * ConditionTabs — gerencia condições de uma oferta em abas.
 *
 * Abas:
 *   - Condições: lista condições com badge de status + indicador de default.
 *                Botão "Nova Condição" abre Dialog inline com form (nome, priority, is_default).
 *   - Regras: placeholder <RuleGroupEditor> para a condição selecionada (T-6-19).
 *   - Itens: placeholder <ItemEditor> para a condição selecionada (T-6-20).
 *   - Opções de Pagamento: <PaymentOptionsEditor> para a condição selecionada.
 *
 * T-6-18 — spec: docs/20-domain/10-offer-engine.md §3.2
 */

import * as React from 'react'
import { useTransition } from 'react'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
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
import { Switch } from '@/components/ui/switch'

import { createConditionAction } from '@/app/(app)/offers/actions'
import { RuleGroupEditor, type RuleGroupData } from '@/components/offer/rule-group-editor'
import { ItemEditor } from '@/components/offer/item-editor'
import { PaymentOptionsEditor } from '@/components/offer/payment-options-editor'
import type { ItemRowData } from '@/components/offer/item-row'
import type { PaymentOptionRowData } from '@/components/offer/payment-options-editor'
import type { ProductOption, BenefitOption } from '@/components/offer/item-editor'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface ConditionData {
  id: string
  name: string
  description: string | null
  priority: number
  advantageScore: string
  status: ConditionStatus
  isDefault: boolean
  isPublic: boolean
  items: ItemRowData[]
  paymentOptions: PaymentOptionRowData[]
  ruleGroups: RuleGroupData[]
}

interface ConditionTabsProps {
  offerId: string
  conditions: ConditionData[]
  products: ProductOption[]
  benefits: BenefitOption[]
}

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<ConditionStatus, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Arquivada',
}

const STATUS_VARIANT: Record<ConditionStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
  archived: 'destructive',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConditionTabs({
  offerId,
  conditions,
  products,
  benefits,
}: ConditionTabsProps) {
  // Condição selecionada — inicialmente a default ativa ou a primeira
  const defaultCondition =
    conditions.find((c) => c.isDefault && c.status === 'active') ??
    conditions[0] ??
    null

  const [selectedConditionId, setSelectedConditionId] = React.useState<string | null>(
    defaultCondition?.id ?? null,
  )

  // Dialog de nova condição
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [newName, setNewName] = React.useState('')
  const [newPriority, setNewPriority] = React.useState(0)
  const [newIsDefault, setNewIsDefault] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedCondition = conditions.find((c) => c.id === selectedConditionId) ?? null

  // Reset form
  function resetForm() {
    setNewName('')
    setNewPriority(0)
    setNewIsDefault(false)
    setFormError(null)
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open)
    if (!open) resetForm()
  }

  function handleCreateCondition(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)

    if (!newName.trim()) {
      setFormError('O nome da condição é obrigatório.')
      return
    }

    startTransition(async () => {
      const result = await createConditionAction({
        offerId,
        name: newName.trim(),
        priority: newPriority,
        isDefault: newIsDefault,
        isPublic: true,
      })
      if (result.ok) {
        setDialogOpen(false)
        resetForm()
        // Selects newly created condition
        setSelectedConditionId(result.data.id)
      } else {
        setFormError(result.error?.message ?? 'Erro ao criar condição.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Conditions selector + new condition button */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-700">Condição:</span>
        {conditions.length === 0 ? (
          <span className="text-sm text-slate-400">Nenhuma condição criada ainda.</span>
        ) : (
          <div className="flex flex-wrap gap-2" role="list" aria-label="Condições da oferta">
            {conditions.map((c) => (
              <button
                key={c.id}
                type="button"
                role="listitem"
                onClick={() => setSelectedConditionId(c.id)}
                aria-pressed={selectedConditionId === c.id}
                className={[
                  'flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  selectedConditionId === c.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
                ].join(' ')}
              >
                <span className="max-w-[160px] truncate font-medium">{c.name}</span>
                <Badge
                  variant={STATUS_VARIANT[c.status]}
                  className="shrink-0 text-xs"
                  aria-label={`Status: ${STATUS_LABEL[c.status]}`}
                >
                  {STATUS_LABEL[c.status]}
                </Badge>
                {c.isDefault && (
                  <span
                    aria-label="Condição padrão"
                    className="ml-0.5 text-xs font-semibold text-amber-600"
                    title="Condição padrão"
                  >
                    ★
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          aria-label="Criar nova condição de oferta"
        >
          Nova Condição
        </Button>
      </div>

      {/* Tab sections for selected condition */}
      {selectedCondition ? (
        <Tabs defaultValue="conditions" className="w-full">
          <TabsList aria-label="Seções da condição de oferta">
            <TabsTrigger value="conditions">Condições</TabsTrigger>
            <TabsTrigger value="rules">Regras</TabsTrigger>
            <TabsTrigger value="items">Itens</TabsTrigger>
            <TabsTrigger value="payment">Opções de Pagamento</TabsTrigger>
          </TabsList>

          {/* --- Tab: Condições (detalhes da condição selecionada) --- */}
          <TabsContent value="conditions" className="mt-4">
            <section aria-label="Detalhes da condição">
              <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-8 text-sm">
                <div>
                  <dt className="text-slate-500 font-medium">Nome</dt>
                  <dd className="mt-0.5 text-slate-900 font-semibold">
                    {selectedCondition.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Status</dt>
                  <dd className="mt-0.5">
                    <Badge variant={STATUS_VARIANT[selectedCondition.status]}>
                      {STATUS_LABEL[selectedCondition.status]}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Prioridade</dt>
                  <dd className="mt-0.5 text-slate-900 tabular-nums">
                    {selectedCondition.priority}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Score de vantagem</dt>
                  <dd className="mt-0.5 text-slate-900 tabular-nums">
                    {Number(selectedCondition.advantageScore).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Condição padrão</dt>
                  <dd className="mt-0.5">
                    {selectedCondition.isDefault ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <span aria-hidden>★</span> Sim
                      </span>
                    ) : (
                      <span className="text-slate-400">Não</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Visibilidade</dt>
                  <dd className="mt-0.5 text-slate-900">
                    {selectedCondition.isPublic ? 'Pública' : 'Somente uso interno'}
                  </dd>
                </div>
                {selectedCondition.description && (
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500 font-medium">Descrição</dt>
                    <dd className="mt-0.5 text-slate-700">{selectedCondition.description}</dd>
                  </div>
                )}
              </dl>
            </section>
          </TabsContent>

          {/* --- Tab: Regras (T-6-19) --- */}
          <TabsContent value="rules" className="mt-4">
            <RuleGroupEditor
              conditionId={selectedCondition.id}
              initialGroups={selectedCondition.ruleGroups}
            />
          </TabsContent>

          {/* --- Tab: Itens (T-6-20 — implementado) --- */}
          <TabsContent value="items" className="mt-4">
            <ItemEditor
              conditionId={selectedCondition.id}
              items={selectedCondition.items}
              products={products}
              benefits={benefits}
            />
          </TabsContent>

          {/* --- Tab: Opções de Pagamento --- */}
          <TabsContent value="payment" className="mt-4">
            <PaymentOptionsEditor
              conditionId={selectedCondition.id}
              paymentOptions={selectedCondition.paymentOptions}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="text-sm text-slate-500">
            Selecione ou crie uma condição para editar suas seções.
          </p>
        </div>
      )}

      {/* New Condition Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Nova Condição</DialogTitle>
            <DialogDescription>
              Preencha os dados para criar uma nova condição de elegibilidade nesta oferta.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCondition} noValidate className="space-y-5 pt-2">
            {/* Nome */}
            <div className="space-y-1.5">
              <Label htmlFor="cond-name">
                Nome <span aria-hidden="true" className="text-red-500">*</span>
              </Label>
              <Input
                id="cond-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Condição Black Friday"
                required
                aria-required="true"
                aria-describedby={formError ? 'cond-error' : undefined}
                autoFocus
              />
            </div>

            {/* Prioridade */}
            <div className="space-y-1.5">
              <Label htmlFor="cond-priority">Prioridade</Label>
              <Input
                id="cond-priority"
                type="number"
                min={-1000}
                max={1000}
                step={1}
                value={newPriority}
                onChange={(e) => setNewPriority(Number(e.target.value))}
                className="w-32"
                aria-describedby="cond-priority-hint"
              />
              <p id="cond-priority-hint" className="text-xs text-slate-400">
                Maior prioridade vence no desempate de condições. Intervalo: -1000 a 1000.
              </p>
            </div>

            {/* Condição padrão */}
            <div className="flex items-center justify-between rounded-md border border-slate-200 px-4 py-3">
              <div>
                <Label htmlFor="cond-is-default" className="text-sm font-medium">
                  Condição padrão
                </Label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Apenas uma condição ativa pode ser o padrão por oferta.
                </p>
              </div>
              <Switch
                id="cond-is-default"
                checked={newIsDefault}
                onCheckedChange={setNewIsDefault}
                aria-label="Definir como condição padrão"
              />
            </div>

            {/* Error */}
            {formError && (
              <p
                id="cond-error"
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
                {isPending ? 'Criando…' : 'Criar Condição'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
