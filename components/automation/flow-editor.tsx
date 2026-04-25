'use client'

/**
 * FlowEditor — Editor visual drag-drop de fluxos de automação.
 * Client Component — usa react-flow.
 * Lazy-loaded via dynamic() na página para evitar SSR do bundle react-flow.
 *
 * T-11-11 — spec: docs/20-domain/15-automation.md §11
 *
 * Funcionalidades:
 * - Renderiza nodes e edges derivados dos dados do banco
 * - Arrastar nó atualiza positionX/positionY via updateNode (debounce 500ms)
 * - Painel lateral: clique no nó exibe form de edição (label + config específica)
 * - Botão "Adicionar nó" abre modal para escolher kind e cria via createNode
 * - Conectar dois nós chama updateNode para setar next_node_id ou next_on_true_id/false_id
 */

import * as React from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type OnConnect,
  type NodeDragHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NodeTrigger } from './node-trigger'
import { NodeCondition } from './node-condition'
import { NodeAction } from './node-action'
import { createNode, updateNode } from '@/app/(app)/automations/actions'

// ---------------------------------------------------------------------------
// Custom node types
// ---------------------------------------------------------------------------

const nodeTypes = {
  trigger: NodeTrigger,
  condition: NodeCondition,
  action: NodeAction,
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FlowNode {
  id: string
  kind: string
  label: string | null
  positionX: string
  positionY: string
  nextNodeId: string | null
  nextOnTrueId: string | null
  nextOnFalseId: string | null
  config: Record<string, unknown>
  // Joined from automation_trigger
  triggerKind?: string | null
  // Joined from automation_condition
  conditionExpr?: unknown
  // Joined from automation_action
  actionKind?: string | null
  actionParams?: Record<string, unknown> | null
}

export interface FlowEditorProps {
  flowId: string
  nodes: FlowNode[]
}

// ---------------------------------------------------------------------------
// Helpers: convert DB rows to react-flow nodes and edges
// ---------------------------------------------------------------------------

function dbNodesToRfNodes(dbNodes: FlowNode[]): Node[] {
  return dbNodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: { x: parseFloat(n.positionX), y: parseFloat(n.positionY) },
    data: {
      label: n.label,
      triggerKind: n.triggerKind ?? null,
      actionKind: n.actionKind ?? null,
    },
  }))
}

function dbNodesToRfEdges(dbNodes: FlowNode[]): Edge[] {
  const edges: Edge[] = []
  for (const n of dbNodes) {
    if (n.nextNodeId) {
      edges.push({
        id: `${n.id}-next-${n.nextNodeId}`,
        source: n.id,
        target: n.nextNodeId,
        sourceHandle: 'out',
        targetHandle: 'in',
      })
    }
    if (n.nextOnTrueId) {
      edges.push({
        id: `${n.id}-true-${n.nextOnTrueId}`,
        source: n.id,
        target: n.nextOnTrueId,
        sourceHandle: 'true',
        targetHandle: 'in',
        label: 'Sim',
        style: { stroke: '#10b981' },
        labelStyle: { fill: '#10b981', fontWeight: 600 },
      })
    }
    if (n.nextOnFalseId) {
      edges.push({
        id: `${n.id}-false-${n.nextOnFalseId}`,
        source: n.id,
        target: n.nextOnFalseId,
        sourceHandle: 'false',
        targetHandle: 'in',
        label: 'Não',
        style: { stroke: '#ef4444' },
        labelStyle: { fill: '#ef4444', fontWeight: 600 },
      })
    }
  }
  return edges
}

// ---------------------------------------------------------------------------
// FlowEditor component
// ---------------------------------------------------------------------------

export function FlowEditor({ flowId, nodes: initialNodes }: FlowEditorProps) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState(
    dbNodesToRfNodes(initialNodes),
  )
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState(
    dbNodesToRfEdges(initialNodes),
  )

  // Painel lateral: nó selecionado
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null)
  const [panelLabel, setPanelLabel] = React.useState('')
  const [isSavingLabel, setIsSavingLabel] = React.useState(false)
  const [labelError, setLabelError] = React.useState<string | null>(null)

  // Modal de criação de nó
  const [showAddModal, setShowAddModal] = React.useState(false)
  const [newNodeKind, setNewNodeKind] = React.useState<'trigger' | 'condition' | 'action'>('action')
  const [newNodeLabel, setNewNodeLabel] = React.useState('')
  const [isAddingNode, setIsAddingNode] = React.useState(false)
  const [addNodeError, setAddNodeError] = React.useState<string | null>(null)

  // Debounce ref para posição
  const dragDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const onNodeClick = React.useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node)
      setPanelLabel((node.data as { label?: string | null }).label ?? '')
      setLabelError(null)
    },
    [],
  )

  const onPaneClick = React.useCallback(() => {
    setSelectedNode(null)
  }, [])

  // Drag end: debounce updateNode para posição
  const onNodeDragStop: NodeDragHandler = React.useCallback(
    (_, node) => {
      if (dragDebounceRef.current) clearTimeout(dragDebounceRef.current)
      dragDebounceRef.current = setTimeout(() => {
        updateNode({
          nodeId: node.id,
          positionX: node.position.x,
          positionY: node.position.y,
        }).catch(() => {
          // silencioso — posição é best-effort
        })
      }, 500)
    },
    [],
  )

  // Conectar dois nós
  const onConnect: OnConnect = React.useCallback(
    (connection: Connection) => {
      setRfEdges((eds) => addEdge(connection, eds))
      // Atualizar no banco: determinar qual campo setar pelo sourceHandle
      if (!connection.source || !connection.target) return
      const handle = connection.sourceHandle
      const patch: Record<string, unknown> = { nodeId: connection.source }
      if (handle === 'true') {
        patch.nextOnTrueId = connection.target
      } else if (handle === 'false') {
        patch.nextOnFalseId = connection.target
      } else {
        patch.nextNodeId = connection.target
      }
      updateNode(patch).catch(() => {
        // silencioso
      })
    },
    [setRfEdges],
  )

  // Salvar label do nó selecionado
  async function handleSaveLabel() {
    if (!selectedNode) return
    setIsSavingLabel(true)
    setLabelError(null)
    const result = await updateNode({ nodeId: selectedNode.id, label: panelLabel })
    if (!result.ok) {
      setLabelError(result.error.message)
    } else {
      // Atualizar o nó no estado local
      setRfNodes((nds) =>
        nds.map((n) =>
          n.id === selectedNode.id
            ? { ...n, data: { ...n.data, label: panelLabel } }
            : n,
        ),
      )
    }
    setIsSavingLabel(false)
  }

  // Adicionar nó
  async function handleAddNode() {
    setIsAddingNode(true)
    setAddNodeError(null)
    const result = await createNode({
      flowId,
      kind: newNodeKind,
      label: newNodeLabel || null,
      positionX: 100 + rfNodes.length * 50,
      positionY: 100 + rfNodes.length * 80,
    })
    if (!result.ok) {
      setAddNodeError(result.error.message)
      setIsAddingNode(false)
      return
    }
    const newNode = result.data
    setRfNodes((nds) => [
      ...nds,
      {
        id: newNode.id,
        type: newNode.kind,
        position: {
          x: parseFloat(newNode.positionX),
          y: parseFloat(newNode.positionY),
        },
        data: { label: newNode.label, triggerKind: null, actionKind: null },
      },
    ])
    setShowAddModal(false)
    setNewNodeLabel('')
    setNewNodeKind('action')
    setIsAddingNode(false)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-full w-full">
      {/* Flow canvas */}
      <div className="flex-1 relative" style={{ height: '100%' }}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          deleteKeyCode="Delete"
        >
          <Background gap={16} size={1} />
          <Controls />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
        </ReactFlow>

        {/* Add node button (overlay) */}
        <div className="absolute bottom-4 left-4 z-10">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowAddModal(true)}
          >
            + Adicionar nó
          </Button>
        </div>
      </div>

      {/* Side panel */}
      {selectedNode && (
        <aside
          aria-label="Propriedades do nó"
          className="w-72 border-l border-border bg-card p-4 space-y-4 overflow-y-auto"
        >
          <h3 className="text-sm font-semibold text-foreground">
            Propriedades do nó
          </h3>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            {selectedNode.type}
          </p>

          <div className="space-y-2">
            <Label htmlFor="node-label">Rótulo</Label>
            <Input
              id="node-label"
              value={panelLabel}
              onChange={(e) => setPanelLabel(e.target.value)}
              placeholder="Rótulo do nó"
              className="text-sm"
            />
            {labelError && (
              <p role="alert" className="text-xs text-destructive">
                {labelError}
              </p>
            )}
            <Button
              size="sm"
              onClick={handleSaveLabel}
              disabled={isSavingLabel}
              className="w-full"
            >
              {isSavingLabel ? 'Salvando...' : 'Salvar rótulo'}
            </Button>
          </div>
        </aside>
      )}

      {/* Add node modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar nó</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="new-node-kind">Tipo de nó</Label>
              <Select
                value={newNodeKind}
                onValueChange={(v) =>
                  setNewNodeKind(v as 'trigger' | 'condition' | 'action')
                }
              >
                <SelectTrigger id="new-node-kind">
                  <SelectValue placeholder="Escolha o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trigger">Gatilho</SelectItem>
                  <SelectItem value="condition">Condição</SelectItem>
                  <SelectItem value="action">Ação</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-node-label">Rótulo (opcional)</Label>
              <Input
                id="new-node-label"
                value={newNodeLabel}
                onChange={(e) => setNewNodeLabel(e.target.value)}
                placeholder="Ex: Verificar tag VIP"
              />
            </div>
            {addNodeError && (
              <p role="alert" className="text-xs text-destructive">
                {addNodeError}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowAddModal(false)}
                disabled={isAddingNode}
              >
                Cancelar
              </Button>
              <Button onClick={handleAddNode} disabled={isAddingNode}>
                {isAddingNode ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
