/**
 * MOD-AUTOMATION — Runner sequencial de fluxo de automação (T-11-05)
 *
 * docs/20-domain/15-automation.md §9, §12 (FLOW-AUTOMATION-DISPATCH)
 * ADR-10: retorno Promise<void>, lança DomainError para erros de negócio
 * ADR-11: tx: DbTx obrigatório como último argumento (convenção deste projeto: último para runner)
 *
 * Responsabilidades:
 *   1. Buscar execution + flow + nós via DB
 *   2. Atualizar execution status=running
 *   3. Percorrer grafo nó a nó: trigger → condition* → action*
 *   4. Registrar automation_execution_log por nó (INV-AUTOMATION-05)
 *   5. Ao final, atualizar status=succeeded
 *   6. Em caso de erro: status=failed, relançar para Inngest retry
 */

import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  automationExecution,
  automationFlow,
  automationNode,
  automationCondition,
  automationAction,
  automationExecutionLog,
} from '@/lib/db/schema/automation'
import { evalCondition } from './eval-condition'
import type { ConditionExpr } from './eval-condition'

// ---------------------------------------------------------------------------
// Errors — ADR-10
// ---------------------------------------------------------------------------

export class AutomationDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AutomationDomainError'
  }
}

export class AutomationNotFoundError extends AutomationDomainError {
  readonly executionId: string
  constructor(executionId: string) {
    super(`automation_execution ${executionId} not found`)
    this.name = 'AutomationNotFoundError'
    this.executionId = executionId
  }
}

export class AutomationFlowNotFoundError extends AutomationDomainError {
  readonly flowId: string
  constructor(flowId: string) {
    super(`automation_flow ${flowId} not found or has no start_node_id`)
    this.name = 'AutomationFlowNotFoundError'
    this.flowId = flowId
  }
}

export class AutomationLoopDetectedError extends AutomationDomainError {
  readonly executionId: string
  constructor(executionId: string, nodeCount: number) {
    super(
      `Loop detectado em execution ${executionId}: ${nodeCount} nós percorridos (limite 100). INV-AUTOMATION-02`,
    )
    this.name = 'AutomationLoopDetectedError'
    this.executionId = executionId
  }
}

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type RunFlowContext = {
  /** Dados do subject (contact, transaction, etc.) */
  subject: Record<string, unknown>
  /** Tipo do subject (ex: 'contact', 'transaction') */
  subjectKind: string
  /** ID do subject */
  subjectId: string
}

export type ActionHandler = (
  kind: string,
  params: unknown,
  ctx: RunFlowContext,
  tx: DbTx,
) => Promise<unknown>

export type RunFlowOptions = {
  actionHandler: ActionHandler
}

// ---------------------------------------------------------------------------
// Limite de segurança contra loop infinito
// docs/80-roadmap/08-sprint-11-automations.md §Riscos
// ---------------------------------------------------------------------------
const MAX_NODES = 100

// ---------------------------------------------------------------------------
// runFlow — runner principal
// ADR-11: tx como último argumento
// ---------------------------------------------------------------------------

/**
 * Executa uma `automation_execution` já criada (status=pending) nó a nó,
 * registrando log por nó e atualizando o status final.
 *
 * Erros de negócio (execution não encontrada, flow inválido, loop) lançam
 * AutomationDomainError (subtipo de Error, não result).
 *
 * Erros de action são capturados, logados como status='error' e relançados
 * como Error nativo para que o Inngest possa fazer retry.
 */
export async function runFlow(
  executionId: string,
  ctx: RunFlowContext,
  options: RunFlowOptions,
  tx: DbTx,
): Promise<void> {
  // -----------------------------------------------------------------------
  // Passo 1: Buscar execution
  // -----------------------------------------------------------------------
  const [execution] = await tx
    .select()
    .from(automationExecution)
    .where(eq(automationExecution.id, executionId))
    .limit(1)

  if (!execution) {
    throw new AutomationNotFoundError(executionId)
  }

  // Proteção contra re-execução: idempotência local
  // docs/20-domain/15-automation.md §12: execution já concluída não redispara
  if (execution.status === 'succeeded' || execution.status === 'failed') {
    return
  }

  // -----------------------------------------------------------------------
  // Passo 2: Buscar flow + start_node
  // -----------------------------------------------------------------------
  const [flow] = await tx
    .select()
    .from(automationFlow)
    .where(eq(automationFlow.id, execution.flowId))
    .limit(1)

  if (!flow || !flow.startNodeId) {
    // INV-AUTOMATION-01: flow sem start_node_id é inativo
    throw new AutomationFlowNotFoundError(execution.flowId)
  }

  // -----------------------------------------------------------------------
  // Passo 3: Buscar todos os nós do flow (1 query, cache em memória)
  // -----------------------------------------------------------------------
  const nodes = await tx
    .select()
    .from(automationNode)
    .where(eq(automationNode.flowId, flow.id))

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  // -----------------------------------------------------------------------
  // Passo 4: Marcar execution como running
  // ADR-11: mutação via tx
  // -----------------------------------------------------------------------
  await tx
    .update(automationExecution)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(automationExecution.id, executionId))

  // -----------------------------------------------------------------------
  // Passo 5: Percorrer grafo nó a nó
  // -----------------------------------------------------------------------
  let currentNodeId: string | null = flow.startNodeId
  let nodeCount = 0

  try {
    while (currentNodeId !== null) {
      // Proteção contra loop infinito — INV-AUTOMATION-02, spec T-11-05
      nodeCount++
      if (nodeCount > MAX_NODES) {
        throw new AutomationLoopDetectedError(executionId, nodeCount)
      }

      const node = nodeMap.get(currentNodeId)
      if (!node) {
        // Nó referenciado mas não encontrado no mapa — grafo corrompido
        throw new AutomationDomainError(
          `Nó ${currentNodeId} referenciado em flow ${flow.id} não existe`,
        )
      }

      if (node.kind === 'trigger') {
        // Nó trigger: apenas registra log e avança para next_node_id
        // docs/20-domain/15-automation.md §12: trigger apenas avança
        await tx.insert(automationExecutionLog).values({
          executionId,
          nodeId: node.id,
          nodeKind: 'trigger',
          status: 'ok',
          input: ctx.subject,
          output: { advanced: true },
          error: null,
        })
        currentNodeId = node.nextNodeId ?? null
      } else if (node.kind === 'condition') {
        // Nó condition: busca expr, avalia, segue ramo correto
        // docs/20-domain/15-automation.md §8 (DSL de condição)
        const [conditionRow] = await tx
          .select()
          .from(automationCondition)
          .where(eq(automationCondition.nodeId, node.id))
          .limit(1)

        const expr = conditionRow?.expr as ConditionExpr | undefined
        const result = expr !== undefined ? evalCondition(expr, ctx.subject) : false

        await tx.insert(automationExecutionLog).values({
          executionId,
          nodeId: node.id,
          nodeKind: 'condition',
          status: 'ok',
          input: ctx.subject,
          output: { result },
          error: null,
        })

        // INV-AUTOMATION-02: condition usa next_on_true_id / next_on_false_id
        currentNodeId = result
          ? (node.nextOnTrueId ?? null)
          : (node.nextOnFalseId ?? null)
      } else if (node.kind === 'action') {
        // Nó action: busca params, chama handler injetado
        // docs/20-domain/15-automation.md §7 (Actions)
        const [actionRow] = await tx
          .select()
          .from(automationAction)
          .where(eq(automationAction.nodeId, node.id))
          .limit(1)

        const actionKind = actionRow?.kind ?? 'unknown'
        const actionParams = actionRow?.params ?? {}

        let actionOutput: unknown = null
        let actionError: string | null = null
        let logStatus: 'ok' | 'error' = 'ok'

        try {
          actionOutput = await options.actionHandler(actionKind, actionParams, ctx, tx)
        } catch (err: unknown) {
          logStatus = 'error'
          actionError = err instanceof Error ? err.message : String(err)
        }

        await tx.insert(automationExecutionLog).values({
          executionId,
          nodeId: node.id,
          nodeKind: 'action',
          status: logStatus,
          input: { kind: actionKind, params: actionParams },
          output: actionOutput !== null ? (actionOutput as Record<string, unknown>) : {},
          error: actionError,
        })

        if (logStatus === 'error') {
          // Erros de action são relançados para Inngest retry
          // docs/20-domain/15-automation.md §9: backoff exponencial, 5 tentativas
          throw new Error(
            `Action ${actionKind} falhou em execution ${executionId}: ${actionError}`,
          )
        }

        // INV-AUTOMATION-02: action usa next_node_id
        currentNodeId = node.nextNodeId ?? null
      } else {
        // Kind desconhecido — grafo corrompido, falha explícita
        throw new AutomationDomainError(`kind de nó desconhecido: ${node.kind}`)
      }
    }

    // -----------------------------------------------------------------------
    // Passo 6: Execução concluída com sucesso
    // -----------------------------------------------------------------------
    await tx
      .update(automationExecution)
      .set({ status: 'succeeded', finishedAt: new Date() })
      .where(eq(automationExecution.id, executionId))
  } catch (err: unknown) {
    // -----------------------------------------------------------------------
    // Passo 7: Capturar, registrar falha, relançar para Inngest
    // docs/20-domain/15-automation.md §9: Inngest faz retry com backoff
    // -----------------------------------------------------------------------
    const errorMessage = err instanceof Error ? err.message : String(err)

    await tx
      .update(automationExecution)
      .set({
        status: 'failed',
        error: errorMessage,
        finishedAt: new Date(),
      })
      .where(eq(automationExecution.id, executionId))

    throw err
  }
}
