'use client'

/**
 * ConditionTabsWithRuleTree — Tabs de condições integradas ao RuleTreeEditor visual.
 *
 * Substitui o uso direto de RuleGroupEditor pela nova aba "Regras" que usa
 * RuleTreeEditor (editor visual AND/OR com drag-drop e validação em tempo real).
 *
 * Mantém as demais abas: Condições (detalhes), Itens, Opções de Pagamento.
 *
 * T-13-17 — spec: docs/70-ux/06-screen-offer-builder.md §3.3
 *
 * Uso: importar em components/offer/condition-tabs.tsx ou em page.tsx de [id].
 * Por ora este arquivo expõe o sub-painel de Regras com RuleTreeEditor integrado.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'

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
import {
  RuleTreeEditor,
  ruleGroupDataToTree,
  type TreeNode,
} from '@/components/offers/rule-tree-editor'
import { ItemEditor } from '@/components/offer/item-editor'
import { PaymentOptionsEditor } from '@/components/offer/payment-options-editor'
import type { ItemRowData } from '@/components/offer/item-row'
import type { PaymentOptionRowData } from '@/components/offer/payment-options-editor'
import type { ProductOption, BenefitOption } from '@/components/offer/item-editor'
import type { RuleGroupData } from '@/components/offer/rule-group-editor'

// ---------------------------------------------------------------------------
// Types (re-export subset matching ConditionData from condition-tabs.tsx)
// ---------------------------------------------------------------------------

export type ConditionStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface ConditionDataWithRules {
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

interface ConditionTabsWithRuleTreeProps {
  offerId: string
  conditions: ConditionDataWithRules[]
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

export function ConditionTabsWithRuleTree({
  offerId,
  conditions,
  products,
  benefits,
}: ConditionTabsWithRuleTreeProps) {
  const router = useRouter()

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
  const [isPending, startTransition] = React.useTransition()

  const selectedCondition = conditions.find((c) => c.id === selectedConditionId) ?? null

  // Memoize tree conversion to avoid rebuilding on every render
  const initialTree = React.useMemo<TreeNode[]>(
    () =>
      selectedCondition
        ? ruleGroupDataToTree(selectedCondition.ruleGroups)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedConditionId], // Recalculate when switching condition
  )

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
        setSelectedConditionId(result.data.id)
      } else {
        setFormError(result.error?.message ?? 'Erro ao criar condição.')
      }
    })
  }

  return (
    <div className="space-y-4">
      {/* Conditions selector */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Condição:</span>
        {conditions.length === 0 ? (
          <span className="text-sm text-muted-foreground/60">Nenhuma condição criada ainda.</span>
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
                    ? 'border-border bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-border',
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

      {/* Condition detail tabs */}
      {selectedCondition ? (
        <Tabs defaultValue="conditions" className="w-full">
          <TabsList aria-label="Seções da condição de oferta">
            <TabsTrigger value="conditions">Condições</TabsTrigger>
            <TabsTrigger value="rules">Regras</TabsTrigger>
            <TabsTrigger value="items">Itens</TabsTrigger>
            <TabsTrigger value="payment">Opções de Pagamento</TabsTrigger>
          </TabsList>

          {/* Tab: Detalhes */}
          <TabsContent value="conditions" className="mt-4">
            <section aria-label="Detalhes da condição">
              <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-8 text-sm">
                <div>
                  <dt className="text-muted-foreground font-medium">Nome</dt>
                  <dd className="mt-0.5 text-foreground font-semibold">{selectedCondition.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Status</dt>
                  <dd className="mt-0.5">
                    <Badge variant={STATUS_VARIANT[selectedCondition.status]}>
                      {STATUS_LABEL[selectedCondition.status]}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Prioridade</dt>
                  <dd className="mt-0.5 text-foreground tabular-nums">{selectedCondition.priority}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Score de vantagem</dt>
                  <dd className="mt-0.5 text-foreground tabular-nums">
                    {Number(selectedCondition.advantageScore).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Condição padrão</dt>
                  <dd className="mt-0.5">
                    {selectedCondition.isDefault ? (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <span aria-hidden>★</span> Sim
                      </span>
                    ) : (
                      <span className="text-muted-foreground/60">Não</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground font-medium">Visibilidade</dt>
                  <dd className="mt-0.5 text-foreground">
                    {selectedCondition.isPublic ? 'Pública' : 'Somente uso interno'}
                  </dd>
                </div>
                {selectedCondition.description && (
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground font-medium">Descrição</dt>
                    <dd className="mt-0.5 text-muted-foreground">{selectedCondition.description}</dd>
                  </div>
                )}
              </dl>
            </section>
          </TabsContent>

          {/* Tab: Regras — RuleTreeEditor visual AND/OR com drag-drop + validação em tempo real */}
          <TabsContent value="rules" className="mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Regras de elegibilidade</h3>
                <p className="text-xs text-muted-foreground">
                  Clique no badge E / OU para alternar o operador de um grupo.
                  Arraste regras para reordenar.
                </p>
              </div>
              <RuleTreeEditor
                key={selectedCondition.id}
                conditionId={selectedCondition.id}
                initialTree={initialTree}
                onSaved={() => router.refresh()}
              />
            </div>
          </TabsContent>

          {/* Tab: Itens */}
          <TabsContent value="items" className="mt-4">
            <ItemEditor
              conditionId={selectedCondition.id}
              items={selectedCondition.items}
              products={products}
              benefits={benefits}
            />
          </TabsContent>

          {/* Tab: Opções de Pagamento */}
          <TabsContent value="payment" className="mt-4">
            <PaymentOptionsEditor
              conditionId={selectedCondition.id}
              paymentOptions={selectedCondition.paymentOptions}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/50 p-8 text-center">
          <p className="text-sm text-muted-foreground">
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
            <div className="space-y-1.5">
              <Label htmlFor="cond-name">
                Nome <span aria-hidden="true" className="text-destructive">*</span>
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
              <p id="cond-priority-hint" className="text-xs text-muted-foreground/60">
                Maior prioridade vence no desempate de condições. Intervalo: -1000 a 1000.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
              <div>
                <Label htmlFor="cond-is-default" className="text-sm font-medium">
                  Condição padrão
                </Label>
                <p className="text-xs text-muted-foreground/60 mt-0.5">
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

            {formError && (
              <p
                id="cond-error"
                role="alert"
                className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive"
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
