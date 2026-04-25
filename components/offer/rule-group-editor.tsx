'use client'

/**
 * RuleGroupEditor — Editor visual de árvore AND/OR com drag-drop de regras.
 *
 * Recebe `conditionId` e árvore inicial como props (carregados pelo Server Component pai).
 * Renderiza a árvore de grupos com indentação visual.
 * Botão "+ Grupo" → cria sub-grupo via createRuleGroupAction.
 * Botão "+ Regra" → abre RuleParamForm em Dialog.
 * Drag-drop de regras entre grupos via @dnd-kit/core + @dnd-kit/sortable.
 *
 * T-6-19 — spec: docs/20-domain/10-offer-engine.md §3.3, §3.4
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
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { createRuleGroupAction } from '@/app/(app)/offers/actions'
import { RuleNode, type RuleNodeData } from './rule-node'
import { RuleParamForm } from './rule-param-form'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RuleGroupData {
  id: string
  offerConditionId: string
  parentGroupId: string | null
  operator: 'and' | 'or'
  rules: RuleNodeData[]
  children: RuleGroupData[]
}

interface RuleGroupEditorProps {
  conditionId: string
  /** Árvore raiz já carregada pelo Server Component pai. */
  initialGroups: RuleGroupData[]
  /** Profundidade máxima de nesting (visual). Default 5. */
  maxDepth?: number
}

// ---------------------------------------------------------------------------
// Operator badge
// ---------------------------------------------------------------------------

const OPERATOR_LABEL = { and: 'E', or: 'OU' }
const OPERATOR_CLASS = {
  and: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100 font-bold',
  or: 'bg-amber-100 text-amber-700 hover:bg-amber-100 font-bold',
}

// ---------------------------------------------------------------------------
// Recursive GroupNode
// ---------------------------------------------------------------------------

interface GroupNodeProps {
  group: RuleGroupData
  depth: number
  maxDepth: number
  conditionId: string
  onGroupCreated: (newGroup: RuleGroupData) => void
  onRuleCreated: (groupId: string) => void
}

function GroupNode({
  group,
  depth,
  maxDepth,
  conditionId,
  onGroupCreated,
  onRuleCreated,
}: GroupNodeProps) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [isAddingGroup, setIsAddingGroup] = React.useState(false)
  const [addRuleOpen, setAddRuleOpen] = React.useState(false)
  const [groupError, setGroupError] = React.useState<string | null>(null)

  const [isPending, startTransition] = React.useTransition()

  const ruleIds = group.rules.map((r) => r.id)
  const isRoot = group.parentGroupId === null
  const canNest = depth < maxDepth

  function handleAddGroup() {
    setGroupError(null)
    setIsAddingGroup(true)
    startTransition(async () => {
      const result = await createRuleGroupAction({
        offerConditionId: conditionId,
        parentGroupId: group.id,
        operator: 'and',
      })
      setIsAddingGroup(false)
      if (!result.ok) {
        setGroupError(result.error.message)
        return
      }
      const newGroup: RuleGroupData = {
        id: result.data.id,
        offerConditionId: conditionId,
        parentGroupId: group.id,
        operator: result.data.operator as 'and' | 'or',
        rules: [],
        children: [],
      }
      onGroupCreated(newGroup)
    })
  }

  const indentStyle: React.CSSProperties =
    depth > 0
      ? {
          borderLeft: '2px solid hsl(var(--border))',
          paddingLeft: '1rem',
          marginLeft: '0.5rem',
        }
      : {}

  return (
    <div style={indentStyle} className="space-y-2">
      {/* Group header */}
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expandir grupo' : 'Recolher grupo'}
          className="rounded p-0.5 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden />
          )}
        </button>

        {/* Operator badge */}
        <Badge
          variant="secondary"
          className={OPERATOR_CLASS[group.operator]}
          aria-label={
            group.operator === 'and'
              ? 'Operador E: todas as regras devem ser verdadeiras'
              : 'Operador OU: qualquer regra deve ser verdadeira'
          }
        >
          {OPERATOR_LABEL[group.operator]}
        </Badge>

        {isRoot && (
          <span className="text-xs text-slate-400 ml-1">grupo raiz</span>
        )}

        <span className="flex-1" />

        {/* + Regra */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setAddRuleOpen(true)}
        >
          <Plus className="h-3 w-3" aria-hidden />
          Regra
        </Button>

        {/* + Sub-grupo */}
        {canNest && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={handleAddGroup}
            disabled={isPending || isAddingGroup}
          >
            <Plus className="h-3 w-3" aria-hidden />
            Grupo
          </Button>
        )}
      </div>

      {groupError && (
        <p role="alert" className="text-xs text-red-500 px-2">
          {groupError}
        </p>
      )}

      {/* Rules & children — collapsible */}
      {!collapsed && (
        <div className="space-y-1.5 pl-2">
          {/* Sortable rules */}
          <SortableContext items={ruleIds} strategy={verticalListSortingStrategy}>
            {group.rules.map((rule) => (
              <RuleNode key={rule.id} rule={rule} />
            ))}
          </SortableContext>

          {group.rules.length === 0 && group.children.length === 0 && (
            <p className="text-xs text-slate-400 pl-1 py-1">
              Grupo vazio — adicione regras ou sub-grupos.
            </p>
          )}

          {/* Child groups */}
          {group.children.map((child) => (
            <GroupNode
              key={child.id}
              group={child}
              depth={depth + 1}
              maxDepth={maxDepth}
              conditionId={conditionId}
              onGroupCreated={onGroupCreated}
              onRuleCreated={onRuleCreated}
            />
          ))}
        </div>
      )}

      {/* Add rule dialog */}
      <Dialog open={addRuleOpen} onOpenChange={setAddRuleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar regra</DialogTitle>
          </DialogHeader>
          <RuleParamForm
            ruleGroupId={group.id}
            onSuccess={() => {
              setAddRuleOpen(false)
              onRuleCreated(group.id)
            }}
            onCancel={() => setAddRuleOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tree helper: insert child group at the right node
// ---------------------------------------------------------------------------

function insertGroupInTree(
  groups: RuleGroupData[],
  newGroup: RuleGroupData,
): RuleGroupData[] {
  return groups.map((g) => {
    if (g.id === newGroup.parentGroupId) {
      return { ...g, children: [...g.children, newGroup] }
    }
    if (g.children.length > 0) {
      return { ...g, children: insertGroupInTree(g.children, newGroup) }
    }
    return g
  })
}

// ---------------------------------------------------------------------------
// RuleGroupEditor (root)
// ---------------------------------------------------------------------------

export function RuleGroupEditor({
  conditionId,
  initialGroups,
  maxDepth = 5,
}: RuleGroupEditorProps) {
  const [groups, setGroups] = React.useState<RuleGroupData[]>(initialGroups)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleGroupCreated(newGroup: RuleGroupData) {
    setGroups((prev) =>
      newGroup.parentGroupId === null
        ? [...prev, newGroup]
        : insertGroupInTree(prev, newGroup),
    )
  }

  /**
   * Trigger a lightweight re-render after a rule is created so the parent
   * Server Component data can be refreshed via router.refresh() in Sprint 7.
   * For now we bump a key to force the DndContext to remount with fresh ids.
   */
  const [refreshKey, setRefreshKey] = React.useState(0)
  function handleRuleCreated(_groupId: string) {
    setRefreshKey((k) => k + 1)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handleDragOver(_event: DragOverEvent) {
    // Stub: cross-group hover highlight can be added in Sprint 7
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    // TODO: T-6-19 rearrange — Sprint 7
    // Will call a rearrange Server Action when implemented.
    // eslint-disable-next-line no-console
    console.log('move rule', { ruleId: active.id, targetId: over.id })
  }

  if (groups.length === 0) {
    return (
      <EmptyGroupPrompt
        conditionId={conditionId}
        onGroupCreated={(g) => setGroups([g])}
      />
    )
  }

  return (
    <DndContext
      key={refreshKey}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div
        className="space-y-3"
        aria-label="Editor de regras de condição"
      >
        {groups.map((group) => (
          <GroupNode
            key={group.id}
            group={group}
            depth={0}
            maxDepth={maxDepth}
            conditionId={conditionId}
            onGroupCreated={handleGroupCreated}
            onRuleCreated={handleRuleCreated}
          />
        ))}
      </div>
    </DndContext>
  )
}

// ---------------------------------------------------------------------------
// EmptyGroupPrompt — shown when condition has no groups yet
// ---------------------------------------------------------------------------

interface EmptyGroupPromptProps {
  conditionId: string
  onGroupCreated: (g: RuleGroupData) => void
}

function EmptyGroupPrompt({ conditionId, onGroupCreated }: EmptyGroupPromptProps) {
  const [isPending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)

  function handleCreateRoot(operator: 'and' | 'or') {
    setError(null)
    startTransition(async () => {
      const result = await createRuleGroupAction({
        offerConditionId: conditionId,
        parentGroupId: null,
        operator,
      })
      if (!result.ok) {
        setError(result.error.message)
        return
      }
      onGroupCreated({
        id: result.data.id,
        offerConditionId: conditionId,
        parentGroupId: null,
        operator: result.data.operator as 'and' | 'or',
        rules: [],
        children: [],
      })
    })
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 py-10 text-center">
      <p className="text-sm text-slate-500">Nenhum grupo de regras criado ainda.</p>
      <p className="text-xs text-slate-400">Escolha o operador do grupo raiz:</p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => handleCreateRoot('and')}
        >
          Criar grupo AND
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => handleCreateRoot('or')}
        >
          Criar grupo OR
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
