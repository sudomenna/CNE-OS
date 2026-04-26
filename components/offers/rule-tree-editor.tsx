'use client'

/**
 * RuleTreeEditor — Editor visual AND/OR de condições com drag-drop de nós.
 *
 * Editor de árvore local (estado client-side completo). O usuário monta a
 * árvore de grupos e folhas; ao clicar "Salvar regras" o estado local é
 * persistido de uma vez via Server Actions (createRuleGroupAction, createRuleAction).
 *
 * Funcionalidades:
 *  - Nós AND/OR expansíveis com badge colorido (AND=azul, OR=âmbar)
 *  - Toggle AND/OR por clique no badge
 *  - Drag-drop de nós folha dentro do mesmo grupo via @dnd-kit/sortable
 *  - Validação em tempo real: erros inline abaixo de cada campo inválido
 *  - Botão "Salvar regras" desabilitado enquanto houver erro
 *  - Indentação visual ml-4 border-l-2 border-muted por nível
 *  - Acessibilidade AA: labels, aria-*, foco visível
 *
 * T-13-17 — spec: docs/70-ux/06-screen-offer-builder.md §3.3
 */

import * as React from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createRuleGroupAction, createRuleAction } from '@/app/(app)/offers/actions'
import type { RuleGroupData } from '@/components/offer/rule-group-editor'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Operator = 'and' | 'or'

export type LeafKind =
  | 'date_range'
  | 'sales_count_reached'
  | 'campaign'
  | 'channel'
  | 'creative'
  | 'internal_use'

export interface LeafNode {
  type: 'leaf'
  id: string
  kind: LeafKind
  params: Record<string, unknown>
  /** Field-level validation errors produced by validateLeaf() */
  errors: Record<string, string>
  /** Whether this node was already persisted in the DB */
  persisted: boolean
  persistedGroupId?: string
}

export interface GroupNode {
  type: 'group'
  id: string
  operator: Operator
  children: TreeNode[]
  collapsed: boolean
  /** Whether this group was already persisted in the DB */
  persisted: boolean
  persistedId?: string
}

export type TreeNode = GroupNode | LeafNode

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const CHANNEL_VALUES = ['whatsapp', 'instagram', 'email'] as const

function validateLeaf(kind: LeafKind, params: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {}

  switch (kind) {
    case 'date_range': {
      if (!params['start_at'] || String(params['start_at']).trim() === '') {
        errors['start_at'] = 'Data de início obrigatória'
      }
      if (!params['end_at'] || String(params['end_at']).trim() === '') {
        errors['end_at'] = 'Data de fim obrigatória'
      }
      if (params['start_at'] && params['end_at'] && params['start_at'] >= params['end_at']) {
        errors['end_at'] = 'Data de fim deve ser após a data de início'
      }
      break
    }
    case 'sales_count_reached': {
      const max = params['max']
      if (max === undefined || max === null || max === '') {
        errors['max'] = 'Quantidade máxima obrigatória'
      } else if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) {
        errors['max'] = 'Deve ser um inteiro positivo'
      }
      break
    }
    case 'campaign': {
      const ids = params['campaign_ids']
      if (!Array.isArray(ids) || ids.length === 0) {
        errors['campaign_ids'] = 'Informe ao menos uma campanha'
      }
      break
    }
    case 'channel': {
      const channels = params['channels']
      if (!Array.isArray(channels) || channels.length === 0) {
        errors['channels'] = 'Selecione ao menos um canal'
      }
      break
    }
    case 'creative': {
      const ids = params['creative_ids']
      if (!Array.isArray(ids) || ids.length === 0) {
        errors['creative_ids'] = 'Informe ao menos um criativo'
      }
      break
    }
    case 'internal_use':
      // Sem parâmetros obrigatórios
      break
  }

  return errors
}

function hasErrors(node: TreeNode): boolean {
  if (node.type === 'leaf') {
    return Object.keys(node.errors).length > 0
  }
  if (node.children.length === 0) return true // grupo vazio é inválido
  return node.children.some(hasErrors)
}

function treeHasErrors(nodes: TreeNode[]): boolean {
  if (nodes.length === 0) return false
  return nodes.some(hasErrors)
}

// ---------------------------------------------------------------------------
// Tree manipulation helpers
// ---------------------------------------------------------------------------

function updateNodeById(nodes: TreeNode[], id: string, updater: (node: TreeNode) => TreeNode): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return updater(n)
    if (n.type === 'group') {
      return { ...n, children: updateNodeById(n.children, id, updater) }
    }
    return n
  })
}

function removeNodeById(nodes: TreeNode[], id: string): TreeNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => {
      if (n.type === 'group') {
        return { ...n, children: removeNodeById(n.children, id) }
      }
      return n
    })
}


// ---------------------------------------------------------------------------
// Convert RuleGroupData (from Server) to TreeNode[]
// ---------------------------------------------------------------------------

export function ruleGroupDataToTree(groups: RuleGroupData[], parentId: string | null = null): TreeNode[] {
  return groups
    .filter((g) => g.parentGroupId === parentId)
    .map((g): GroupNode => ({
      type: 'group',
      id: g.id,
      operator: g.operator,
      collapsed: false,
      persisted: true,
      persistedId: g.id,
      children: [
        ...g.rules.map((r): LeafNode => ({
          type: 'leaf',
          id: r.id,
          kind: r.kind as LeafKind,
          params: r.params,
          errors: validateLeaf(r.kind as LeafKind, r.params),
          persisted: true,
          persistedGroupId: g.id,
        })),
        ...ruleGroupDataToTree(groups, g.id),
      ],
    }))
}

// ---------------------------------------------------------------------------
// Kind metadata
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<LeafKind, string> = {
  date_range: 'Intervalo de datas',
  sales_count_reached: 'Limite de vendas',
  campaign: 'Campanha',
  channel: 'Canal',
  creative: 'Criativo',
  internal_use: 'Uso interno',
}

const KIND_BADGE_CLASS: Record<LeafKind, string> = {
  date_range: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  sales_count_reached: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  campaign: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  channel: 'bg-teal-100 text-teal-700 hover:bg-teal-100',
  creative: 'bg-pink-100 text-pink-700 hover:bg-pink-100',
  internal_use: 'bg-muted text-muted-foreground hover:bg-muted',
}

const ALL_KINDS: LeafKind[] = [
  'date_range',
  'sales_count_reached',
  'campaign',
  'channel',
  'creative',
  'internal_use',
]

// ---------------------------------------------------------------------------
// LeafNodeEditor — inline form for a leaf rule
// ---------------------------------------------------------------------------

interface LeafNodeEditorProps {
  leaf: LeafNode
  onUpdate: (updated: LeafNode) => void
  onRemove: () => void
}

function LeafNodeEditor({ leaf, onUpdate, onRemove }: LeafNodeEditorProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: leaf.id, data: { type: 'leaf' } })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  function updateParam(key: string, value: unknown) {
    const newParams = { ...leaf.params, [key]: value }
    const errors = validateLeaf(leaf.kind, newParams)
    onUpdate({ ...leaf, params: newParams, errors })
  }

  function changeKind(kind: LeafKind) {
    const newParams: Record<string, unknown> = {}
    const errors = validateLeaf(kind, newParams)
    onUpdate({ ...leaf, kind, params: newParams, errors })
  }

  const hasFieldErrors = Object.keys(leaf.errors).length > 0

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'rounded-md border bg-card p-3 space-y-3 shadow-sm',
        hasFieldErrors ? 'border-destructive/60' : 'border-border',
      ].join(' ')}
      aria-label={`Regra: ${KIND_LABELS[leaf.kind]}`}
    >
      {/* Header: drag handle + kind select + remove */}
      <div className="flex items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          type="button"
          className="cursor-grab rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          aria-label="Arrastar regra"
          tabIndex={0}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>

        <Badge
          variant="secondary"
          className={KIND_BADGE_CLASS[leaf.kind]}
        >
          {KIND_LABELS[leaf.kind]}
        </Badge>

        <div className="flex-1">
          <Select value={leaf.kind} onValueChange={(v) => changeKind(v as LeafKind)}>
            <SelectTrigger className="h-7 text-xs w-[160px]" aria-label="Tipo de regra">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ALL_KINDS.map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {KIND_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive"
          onClick={onRemove}
          aria-label="Remover regra"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      {/* Inline param fields by kind */}
      {leaf.kind === 'date_range' && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`${leaf.id}-start`} className="text-xs">
              Início <span aria-hidden className="text-destructive">*</span>
            </Label>
            <Input
              id={`${leaf.id}-start`}
              type="datetime-local"
              className="h-8 text-xs"
              value={typeof leaf.params['start_at'] === 'string'
                ? leaf.params['start_at'].replace('Z', '').slice(0, 16)
                : ''}
              onChange={(e) =>
                updateParam('start_at', e.target.value ? `${e.target.value}:00.000Z` : '')
              }
              aria-describedby={leaf.errors['start_at'] ? `${leaf.id}-err-start` : undefined}
              aria-invalid={!!leaf.errors['start_at']}
            />
            {leaf.errors['start_at'] && (
              <p id={`${leaf.id}-err-start`} role="alert" className="text-xs text-destructive">
                {leaf.errors['start_at']}
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${leaf.id}-end`} className="text-xs">
              Fim <span aria-hidden className="text-destructive">*</span>
            </Label>
            <Input
              id={`${leaf.id}-end`}
              type="datetime-local"
              className="h-8 text-xs"
              value={typeof leaf.params['end_at'] === 'string'
                ? leaf.params['end_at'].replace('Z', '').slice(0, 16)
                : ''}
              onChange={(e) =>
                updateParam('end_at', e.target.value ? `${e.target.value}:00.000Z` : '')
              }
              aria-describedby={leaf.errors['end_at'] ? `${leaf.id}-err-end` : undefined}
              aria-invalid={!!leaf.errors['end_at']}
            />
            {leaf.errors['end_at'] && (
              <p id={`${leaf.id}-err-end`} role="alert" className="text-xs text-destructive">
                {leaf.errors['end_at']}
              </p>
            )}
          </div>
        </div>
      )}

      {leaf.kind === 'sales_count_reached' && (
        <div className="space-y-1">
          <Label htmlFor={`${leaf.id}-max`} className="text-xs">
            Máximo de aprovações <span aria-hidden className="text-destructive">*</span>
          </Label>
          <Input
            id={`${leaf.id}-max`}
            type="number"
            min={1}
            step={1}
            className="h-8 text-xs w-32"
            placeholder="ex: 100"
            value={typeof leaf.params['max'] === 'number' ? leaf.params['max'] : ''}
            onChange={(e) =>
              updateParam('max', e.target.value === '' ? '' : Number(e.target.value))
            }
            aria-describedby={leaf.errors['max'] ? `${leaf.id}-err-max` : undefined}
            aria-invalid={!!leaf.errors['max']}
          />
          {leaf.errors['max'] && (
            <p id={`${leaf.id}-err-max`} role="alert" className="text-xs text-destructive">
              {leaf.errors['max']}
            </p>
          )}
        </div>
      )}

      {leaf.kind === 'campaign' && (
        <div className="space-y-1">
          <Label htmlFor={`${leaf.id}-campaigns`} className="text-xs">
            UUIDs das campanhas (um por linha) <span aria-hidden className="text-destructive">*</span>
          </Label>
          <textarea
            id={`${leaf.id}-campaigns`}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="uuid-campanha-1&#10;uuid-campanha-2"
            value={Array.isArray(leaf.params['campaign_ids'])
              ? (leaf.params['campaign_ids'] as string[]).join('\n')
              : ''}
            onChange={(e) =>
              updateParam(
                'campaign_ids',
                e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              )
            }
            aria-describedby={leaf.errors['campaign_ids'] ? `${leaf.id}-err-campaigns` : undefined}
            aria-invalid={!!leaf.errors['campaign_ids']}
          />
          {leaf.errors['campaign_ids'] && (
            <p id={`${leaf.id}-err-campaigns`} role="alert" className="text-xs text-destructive">
              {leaf.errors['campaign_ids']}
            </p>
          )}
        </div>
      )}

      {leaf.kind === 'channel' && (
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium">
            Canais <span aria-hidden className="text-destructive">*</span>
          </legend>
          <div className="flex flex-wrap gap-3" role="group" aria-label="Canais elegíveis">
            {CHANNEL_VALUES.map((ch) => {
              const checked = Array.isArray(leaf.params['channels']) &&
                (leaf.params['channels'] as string[]).includes(ch)
              return (
                <label key={ch} className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    value={ch}
                    checked={checked}
                    onChange={() => {
                      const current = Array.isArray(leaf.params['channels'])
                        ? (leaf.params['channels'] as string[])
                        : []
                      const next = checked
                        ? current.filter((c) => c !== ch)
                        : [...current, ch]
                      updateParam('channels', next)
                    }}
                    className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-ring"
                  />
                  {ch}
                </label>
              )
            })}
          </div>
          {leaf.errors['channels'] && (
            <p role="alert" className="text-xs text-destructive">
              {leaf.errors['channels']}
            </p>
          )}
        </fieldset>
      )}

      {leaf.kind === 'creative' && (
        <div className="space-y-1">
          <Label htmlFor={`${leaf.id}-creatives`} className="text-xs">
            UUIDs dos criativos (um por linha) <span aria-hidden className="text-destructive">*</span>
          </Label>
          <textarea
            id={`${leaf.id}-creatives`}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="uuid-criativo-1&#10;uuid-criativo-2"
            value={Array.isArray(leaf.params['creative_ids'])
              ? (leaf.params['creative_ids'] as string[]).join('\n')
              : ''}
            onChange={(e) =>
              updateParam(
                'creative_ids',
                e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
              )
            }
            aria-describedby={leaf.errors['creative_ids'] ? `${leaf.id}-err-creatives` : undefined}
            aria-invalid={!!leaf.errors['creative_ids']}
          />
          {leaf.errors['creative_ids'] && (
            <p id={`${leaf.id}-err-creatives`} role="alert" className="text-xs text-destructive">
              {leaf.errors['creative_ids']}
            </p>
          )}
        </div>
      )}

      {leaf.kind === 'internal_use' && (
        <p className="text-xs text-muted-foreground">
          Elegível apenas quando a venda for marcada como uso interno. Sem parâmetros adicionais.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// GroupNodeEditor — recursive group with AND/OR toggle + children
// ---------------------------------------------------------------------------

interface GroupNodeEditorProps {
  group: GroupNode
  depth: number
  onUpdate: (updated: GroupNode) => void
  onRemove: (() => void) | null // null = root cannot be removed
}

function GroupNodeEditor({ group, depth, onUpdate, onRemove }: GroupNodeEditorProps) {
  const leafIds = group.children
    .filter((c): c is LeafNode => c.type === 'leaf')
    .map((c) => c.id)

  function toggleOperator() {
    onUpdate({ ...group, operator: group.operator === 'and' ? 'or' : 'and' })
  }

  function toggleCollapsed() {
    onUpdate({ ...group, collapsed: !group.collapsed })
  }

  function updateChild(id: string, updated: TreeNode) {
    onUpdate({
      ...group,
      children: group.children.map((c) => (c.id === id ? updated : c)),
    })
  }

  function removeChild(id: string) {
    onUpdate({
      ...group,
      children: group.children.filter((c) => c.id !== id),
    })
  }

  function addLeaf() {
    const newLeaf: LeafNode = {
      type: 'leaf',
      id: crypto.randomUUID(),
      kind: 'date_range',
      params: {},
      errors: validateLeaf('date_range', {}),
      persisted: false,
    }
    onUpdate({ ...group, children: [...group.children, newLeaf] })
  }

  function addSubGroup() {
    const newGroup: GroupNode = {
      type: 'group',
      id: crypto.randomUUID(),
      operator: 'and',
      children: [],
      collapsed: false,
      persisted: false,
    }
    onUpdate({ ...group, children: [...group.children, newGroup] })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    // Only reorder leaves within this group
    const activeId = String(active.id)
    const overId = String(over.id)
    const activeIsLeaf = group.children.find((c) => c.id === activeId)?.type === 'leaf'
    const overIsLeaf = group.children.find((c) => c.id === overId)?.type === 'leaf'
    if (!activeIsLeaf || !overIsLeaf) return

    const oldIdx = group.children.findIndex((c) => c.id === activeId)
    const newIdx = group.children.findIndex((c) => c.id === overId)
    if (oldIdx === -1 || newIdx === -1) return
    const next = [...group.children]
    const moved = next.splice(oldIdx, 1)[0]
    if (!moved) return
    next.splice(newIdx, 0, moved)
    onUpdate({ ...group, children: next })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const isGroupEmpty = group.children.length === 0
  const groupHasError = isGroupEmpty || group.children.some(hasErrors)

  const indentClass = depth > 0 ? 'ml-4 border-l-2 border-muted pl-3' : ''

  return (
    <div className={indentClass}>
      {/* Group header */}
      <div
        className={[
          'flex items-center gap-2 rounded-md border px-3 py-2 mb-2',
          groupHasError ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted/50',
        ].join(' ')}
      >
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={group.collapsed ? 'Expandir grupo' : 'Recolher grupo'}
          aria-expanded={!group.collapsed}
          className="rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {group.collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden />
          )}
        </button>

        {/* Operator toggle badge */}
        <button
          type="button"
          onClick={toggleOperator}
          aria-label={`Operador ${group.operator.toUpperCase()} — clique para alternar`}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <Badge
            variant="secondary"
            className={
              group.operator === 'and'
                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-bold cursor-pointer'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-200 font-bold cursor-pointer'
            }
          >
            {group.operator === 'and' ? 'E' : 'OU'}
          </Badge>
        </button>

        {depth === 0 && (
          <span className="text-xs text-muted-foreground/60">grupo raiz</span>
        )}

        {isGroupEmpty && (
          <span className="text-xs text-destructive/80 flex-1">
            Grupo vazio — adicione ao menos uma regra
          </span>
        )}

        <span className="flex-1" />

        {/* + Regra */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={addLeaf}
          aria-label="Adicionar regra a este grupo"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Regra
        </Button>

        {/* + Subgrupo */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={addSubGroup}
          aria-label="Adicionar sub-grupo"
        >
          <Plus className="h-3 w-3" aria-hidden />
          Grupo
        </Button>

        {/* Remover grupo (apenas não-raiz) */}
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground/60 hover:text-destructive"
            onClick={onRemove}
            aria-label="Remover grupo"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </Button>
        )}
      </div>

      {/* Children (collapsible) */}
      {!group.collapsed && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={leafIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {group.children.map((child) => {
                if (child.type === 'leaf') {
                  return (
                    <LeafNodeEditor
                      key={child.id}
                      leaf={child}
                      onUpdate={(updated) => updateChild(child.id, updated)}
                      onRemove={() => removeChild(child.id)}
                    />
                  )
                }
                // group child
                return (
                  <GroupNodeEditor
                    key={child.id}
                    group={child}
                    depth={depth + 1}
                    onUpdate={(updated) => updateChild(child.id, updated)}
                    onRemove={() => removeChild(child.id)}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Persist helpers — walk tree and call Server Actions
// ---------------------------------------------------------------------------

async function persistTree(
  nodes: TreeNode[],
  conditionId: string,
  parentGroupId: string | null,
): Promise<void> {
  for (const node of nodes) {
    if (node.type === 'group') {
      if (!node.persisted) {
        const result = await createRuleGroupAction({
          offerConditionId: conditionId,
          parentGroupId,
          operator: node.operator,
        })
        if (!result.ok) throw new Error(result.error.message)
        // Walk children with newly created group id
        await persistTree(node.children, conditionId, result.data.id)
      } else {
        await persistTree(node.children, conditionId, node.persistedId ?? node.id)
      }
    } else {
      if (!node.persisted) {
        // Find parent group id from tree context (passed via parentGroupId above)
        if (!parentGroupId) throw new Error('Folha sem grupo pai')
        const result = await createRuleAction({
          ruleGroupId: parentGroupId,
          kind: node.kind,
          params: node.params,
        })
        if (!result.ok) throw new Error(result.error.message)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RuleTreeEditor — root component
// ---------------------------------------------------------------------------

interface RuleTreeEditorProps {
  conditionId: string
  /** Árvore inicial convertida de RuleGroupData[] via ruleGroupDataToTree() */
  initialTree: TreeNode[]
  /** Callback após salvar com sucesso */
  onSaved?: () => void
}

export function RuleTreeEditor({ conditionId, initialTree, onSaved }: RuleTreeEditorProps) {
  const [tree, setTree] = React.useState<TreeNode[]>(
    initialTree.length > 0
      ? initialTree
      : [],
  )
  const [saving, setSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState<string | null>(null)

  const hasAnyErrors = treeHasErrors(tree)
  const isEmpty = tree.length === 0

  function addRootGroup(operator: Operator) {
    const newGroup: GroupNode = {
      type: 'group',
      id: crypto.randomUUID(),
      operator,
      children: [],
      collapsed: false,
      persisted: false,
    }
    setTree([...tree, newGroup])
  }

  function updateRootGroup(id: string, updated: GroupNode) {
    setTree(updateNodeById(tree, id, () => updated) as TreeNode[])
  }

  function removeRootGroup(id: string) {
    setTree(removeNodeById(tree, id))
  }

  async function handleSave() {
    if (hasAnyErrors || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await persistTree(tree, conditionId, null)
      onSaved?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Erro ao salvar regras')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Error summary */}
      {hasAnyErrors && !isEmpty && (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
        >
          Existem campos obrigatórios não preenchidos. Corrija os erros destacados antes de salvar.
        </div>
      )}

      {/* Tree */}
      {isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
          <p className="text-sm text-muted-foreground">Nenhum grupo de regras definido.</p>
          <p className="text-xs text-muted-foreground/60">
            Escolha o operador do grupo raiz para iniciar:
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRootGroup('and')}
            >
              Criar grupo E (AND)
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => addRootGroup('or')}
            >
              Criar grupo OU (OR)
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3" aria-label="Editor de regras de elegibilidade">
          {tree.map((node) => {
            if (node.type !== 'group') return null
            return (
              <GroupNodeEditor
                key={node.id}
                group={node}
                depth={0}
                onUpdate={(updated) => updateRootGroup(node.id, updated)}
                onRemove={tree.length > 1 ? () => removeRootGroup(node.id) : null}
              />
            )
          })}

          {/* Add another root group */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1 text-xs text-muted-foreground"
            onClick={() => addRootGroup('and')}
          >
            <Plus className="h-3 w-3" aria-hidden />
            Adicionar grupo raiz
          </Button>
        </div>
      )}

      {/* Save action */}
      {!isEmpty && (
        <div className="flex items-center justify-between border-t border-border pt-4">
          {saveError && (
            <p role="alert" className="text-xs text-destructive">
              {saveError}
            </p>
          )}
          <span className="flex-1" />
          <Button
            type="button"
            onClick={handleSave}
            disabled={hasAnyErrors || saving}
            aria-disabled={hasAnyErrors || saving}
            aria-label={
              hasAnyErrors
                ? 'Salvar regras — desabilitado: corrija os erros primeiro'
                : 'Salvar regras de elegibilidade'
            }
          >
            {saving ? 'Salvando…' : 'Salvar regras'}
          </Button>
        </div>
      )}
    </div>
  )
}
