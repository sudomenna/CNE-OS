/**
 * /automations/[id] — Editor visual de fluxo de automação.
 * Server Component que carrega flow + nodes + configs de cada nó.
 * Renderiza FlowEditor (Client Component, lazy-loaded) com dados.
 *
 * T-11-11 — spec: docs/20-domain/15-automation.md §11
 */

import { notFound } from 'next/navigation'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import nextDynamic from 'next/dynamic'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import {
  automationFlow,
  automationNode,
  automationTrigger,
  automationCondition,
  automationAction,
} from '@/lib/db/schema/automation'
import { Badge } from '@/components/ui/badge'
import { FlowPublishButton } from '@/components/automation/flow-publish-button'
import type { FlowNode } from '@/components/automation/flow-editor'

export const dynamic = 'force-dynamic'

// Lazy-load FlowEditor — react-flow não deve ir no bundle SSR
// docs/80-roadmap/08-sprint-11-automations.md Riscos: "react-flow grande no bundle"
const FlowEditor = nextDynamic(
  () =>
    import('@/components/automation/flow-editor').then((m) => ({
      default: m.FlowEditor,
    })),
  { ssr: false },
)

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface AutomationDetailPageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: AutomationDetailPageProps) {
  const { id } = await params
  const [row] = await db
    .select({ name: automationFlow.name })
    .from(automationFlow)
    .where(and(eq(automationFlow.id, id), isNull(automationFlow.deletedAt)))
    .limit(1)

  return {
    title: row ? `${row.name} — Automações | CNE-OS` : 'Automação | CNE-OS',
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AutomationDetailPage({ params }: AutomationDetailPageProps) {
  const { id } = await params

  // Carregar flow
  const [flow] = await db
    .select()
    .from(automationFlow)
    .where(and(eq(automationFlow.id, id), isNull(automationFlow.deletedAt)))
    .limit(1)

  if (!flow) {
    notFound()
  }

  // Carregar nós do flow
  const nodes = await db
    .select()
    .from(automationNode)
    .where(eq(automationNode.flowId, id))

  // Se não há nós, renderiza editor vazio
  if (nodes.length === 0) {
    return (
      <AutomationEditorLayout flowId={id} flow={flow} enrichedNodes={[]} />
    )
  }

  const nodeIds = nodes.map((n) => n.id)

  // Carregar configs de trigger, condition e action para os nós existentes
  const [allTriggers, allConditions, allActions] = await Promise.all([
    db
      .select()
      .from(automationTrigger)
      .where(inArray(automationTrigger.nodeId, nodeIds)),
    db
      .select()
      .from(automationCondition)
      .where(inArray(automationCondition.nodeId, nodeIds)),
    db
      .select()
      .from(automationAction)
      .where(inArray(automationAction.nodeId, nodeIds)),
  ])

  // Mapear configs por nodeId para lookup O(1)
  const triggerByNodeId = new Map(allTriggers.map((t) => [t.nodeId, t]))
  const conditionByNodeId = new Map(allConditions.map((c) => [c.nodeId, c]))
  const actionByNodeId = new Map(allActions.map((a) => [a.nodeId, a]))

  // Montar FlowNode enriquecido
  const enrichedNodes: FlowNode[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    label: n.label,
    positionX: n.positionX,
    positionY: n.positionY,
    nextNodeId: n.nextNodeId,
    nextOnTrueId: n.nextOnTrueId,
    nextOnFalseId: n.nextOnFalseId,
    config: n.config as Record<string, unknown>,
    triggerKind: triggerByNodeId.get(n.id)?.kind ?? null,
    conditionExpr: conditionByNodeId.get(n.id)?.expr ?? null,
    actionKind: actionByNodeId.get(n.id)?.kind ?? null,
    actionParams: (actionByNodeId.get(n.id)?.params as Record<string, unknown> | undefined) ?? null,
  }))

  return (
    <AutomationEditorLayout flowId={id} flow={flow} enrichedNodes={enrichedNodes} />
  )
}

// ---------------------------------------------------------------------------
// Layout component
// ---------------------------------------------------------------------------

interface AutomationEditorLayoutProps {
  flowId: string
  flow: {
    name: string
    isActive: boolean
  }
  enrichedNodes: FlowNode[]
}

function AutomationEditorLayout({
  flowId,
  flow,
  enrichedNodes,
}: AutomationEditorLayoutProps) {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/automations"
            className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            aria-label="Voltar para lista de automações"
          >
            Automações
          </Link>
          <span className="text-muted-foreground/40" aria-hidden="true">/</span>
          <h1 className="text-sm font-semibold text-foreground truncate max-w-[280px]">
            {flow.name}
          </h1>
          <Badge
            variant="secondary"
            className={
              flow.isActive
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-50'
                : 'bg-muted text-muted-foreground hover:bg-muted'
            }
          >
            {flow.isActive ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/automations/${flowId}/executions` as Route}
            className="inline-flex h-9 items-center rounded-md border border-border bg-card px-4 text-sm font-medium text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver execuções
          </Link>
          {/* FlowPublishButton: Client Component para publicar/despublicar */}
          <FlowPublishButton flowId={flowId} isActive={flow.isActive} />
        </div>
      </div>

      {/* Editor canvas — ocupa o restante da altura */}
      <div className="flex-1 overflow-hidden">
        <FlowEditor flowId={flowId} nodes={enrichedNodes} />
      </div>
    </div>
  )
}
