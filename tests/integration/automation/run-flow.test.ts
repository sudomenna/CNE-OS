/**
 * Tests: runFlow — runner sequencial de fluxo de automação (T-11-05)
 *
 * docs/20-domain/15-automation.md §9, §12 (FLOW-AUTOMATION-DISPATCH)
 * ADR-10: DomainError para erros de negócio
 * ADR-11: tx: DbTx como argumento
 *
 * Cobre todos os ramos especificados em T-11-05:
 *   1. Flow simples: trigger → action — execução verde, log 2 nós
 *   2. Flow com condition true: vai para branch true, log correto
 *   3. Flow com condition false: vai para branch false, log correto
 *   4. Action lança exceção: execution fica 'failed', log com status 'error'
 *   5. Loop detectado (>100 nós): falha com AutomationLoopDetectedError
 *   6. Execution já 'succeeded': retorna sem re-executar (idempotência local)
 *
 * Zero I/O real: tx mockado via vi.fn().
 */

import { describe, it, expect, vi } from 'vitest'
import type { Mock } from 'vitest'
import {
  runFlow,
  AutomationNotFoundError,
  AutomationFlowNotFoundError,
  AutomationLoopDetectedError,
} from '@/lib/domain/automation/run-flow'
import type { RunFlowContext, RunFlowOptions, ActionHandler } from '@/lib/domain/automation/run-flow'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures — IDs determinísticos
// ---------------------------------------------------------------------------

const EXECUTION_ID = '00000000-0000-0000-0000-000000000001'
const FLOW_ID = '00000000-0000-0000-0000-000000000002'
const NODE_TRIGGER_ID = '00000000-0000-0000-0000-000000000010'
const NODE_CONDITION_ID = '00000000-0000-0000-0000-000000000011'
const NODE_ACTION_ID = '00000000-0000-0000-0000-000000000012'
const NODE_ACTION_TRUE_ID = '00000000-0000-0000-0000-000000000013'
const NODE_ACTION_FALSE_ID = '00000000-0000-0000-0000-000000000014'

const DEFAULT_CTX: RunFlowContext = {
  subject: { classification: 'lead', score: 30 },
  subjectKind: 'contact',
  subjectId: '00000000-0000-0000-0000-000000000099',
}

// ---------------------------------------------------------------------------
// Helpers — builders de fixture
// ---------------------------------------------------------------------------

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: EXECUTION_ID,
    flowId: FLOW_ID,
    subjectKind: 'contact',
    subjectId: DEFAULT_CTX.subjectId,
    idempotencyKey: 'contact:xxx:flow-1',
    status: 'pending',
    triggeredAt: new Date(),
    startedAt: null,
    finishedAt: null,
    error: null,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeFlow(startNodeId: string | null = NODE_TRIGGER_ID) {
  return {
    id: FLOW_ID,
    brandId: null,
    name: 'Test Flow',
    description: null,
    isActive: true,
    startNodeId,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }
}

function makeTriggerNode(nextNodeId: string | null = null) {
  return {
    id: NODE_TRIGGER_ID,
    flowId: FLOW_ID,
    kind: 'trigger',
    label: 'Trigger',
    nextNodeId,
    nextOnTrueId: null,
    nextOnFalseId: null,
    config: {},
    positionX: '0',
    positionY: '0',
    createdAt: new Date(),
  }
}

function makeConditionNode(nextOnTrueId: string | null, nextOnFalseId: string | null) {
  return {
    id: NODE_CONDITION_ID,
    flowId: FLOW_ID,
    kind: 'condition',
    label: 'Condition',
    nextNodeId: null,
    nextOnTrueId,
    nextOnFalseId,
    config: {},
    positionX: '0',
    positionY: '0',
    createdAt: new Date(),
  }
}

function makeActionNode(id: string, nextNodeId: string | null = null) {
  return {
    id,
    flowId: FLOW_ID,
    kind: 'action',
    label: 'Action',
    nextNodeId,
    nextOnTrueId: null,
    nextOnFalseId: null,
    config: {},
    positionX: '0',
    positionY: '0',
    createdAt: new Date(),
  }
}

function makeConditionRow(nodeId: string, expr: Record<string, unknown>) {
  return {
    id: '00000000-0000-0000-0001-000000000001',
    nodeId,
    expr,
    createdAt: new Date(),
  }
}

function makeActionRow(nodeId: string, kind: string, params: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-0000-0002-000000000001',
    nodeId,
    kind,
    params,
    createdAt: new Date(),
  }
}

// ---------------------------------------------------------------------------
// TxMock builder
//
// A tx mock precisa simular:
//   - tx.select().from().where().limit()  → retorna rows de acordo com tabela/chamada
//   - tx.update().set().where()           → promessa resolvedValue void
//   - tx.insert().values()               → promessa resolvedValue void
//
// Usamos uma fila de respostas para select, em ordem de chamada.
// ---------------------------------------------------------------------------

type TxMockOptions = {
  /** Fila de resultados para chamadas select em ordem */
  selectResults: unknown[][]
  /** Se insert deve rejeitar (para simular erro) */
  insertShouldFail?: boolean
}

function buildTxMock(opts: TxMockOptions): {
  tx: DbTx
  selectMock: Mock
  insertMock: Mock
  updateMock: Mock
  insertedValues: unknown[]
  updatedSets: unknown[]
} {
  const insertedValues: unknown[] = []
  const updatedSets: unknown[] = []

  let selectCallIndex = 0

  // Cada chamada a tx.select() consome o próximo resultado da fila.
  // O objeto de chain retornado é um "thenable" (tem `.then`) para suportar
  // tanto `await chain.limit(n)` quanto `await chain` (sem .limit).
  const selectMock = vi.fn().mockImplementation(() => {
    const callIndex = selectCallIndex++
    const result = opts.selectResults[callIndex] ?? []
    const chain: Record<string, unknown> = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue(result),
      // thenable: permite `await tx.select().from().where()` sem `.limit()`
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
        Promise.resolve(result).then(resolve, reject),
    }
    // make `from` and `where` return the same chain (with then)
    ;(chain.from as ReturnType<typeof vi.fn>).mockReturnValue(chain)
    ;(chain.where as ReturnType<typeof vi.fn>).mockReturnValue(chain)
    return chain
  })

  const insertMock = vi.fn().mockImplementation(() => ({
    values: vi.fn().mockImplementation((vals: unknown) => {
      if (opts.insertShouldFail) {
        return Promise.reject(new Error('insert failed'))
      }
      insertedValues.push(vals)
      return Promise.resolve([])
    }),
  }))

  const updateMock = vi.fn().mockImplementation(() => ({
    set: vi.fn().mockImplementation((vals: unknown) => {
      updatedSets.push(vals)
      return {
        where: vi.fn().mockResolvedValue([]),
      }
    }),
  }))

  const tx = {
    select: selectMock,
    insert: insertMock,
    update: updateMock,
  } as unknown as DbTx

  return { tx, selectMock, insertMock, updateMock, insertedValues, updatedSets }
}

// ---------------------------------------------------------------------------
// Default action handler — succeeds silently
// ---------------------------------------------------------------------------

function makeActionHandler(impl?: ActionHandler): RunFlowOptions {
  return {
    actionHandler: impl ?? vi.fn().mockResolvedValue({ ok: true }),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runFlow', () => {
  describe('given execution not found', () => {
    it('when runFlow called then throws AutomationNotFoundError', async () => {
      const { tx } = buildTxMock({ selectResults: [[]] }) // empty → not found

      await expect(runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)).rejects.toThrow(
        AutomationNotFoundError,
      )
    })
  })

  describe('given flow not found / no start_node_id', () => {
    it('when execution exists but flow missing then throws AutomationFlowNotFoundError', async () => {
      const { tx } = buildTxMock({
        selectResults: [
          [makeExecution()], // execution
          [], // flow → not found
        ],
      })

      await expect(runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)).rejects.toThrow(
        AutomationFlowNotFoundError,
      )
    })

    it('when flow has no start_node_id then throws AutomationFlowNotFoundError', async () => {
      const { tx } = buildTxMock({
        selectResults: [
          [makeExecution()], // execution
          [makeFlow(null)], // flow with no start_node_id
          [], // nodes (empty — won't be reached after the null check)
        ],
      })

      await expect(runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)).rejects.toThrow(
        AutomationFlowNotFoundError,
      )
    })
  })

  describe('given execution already succeeded', () => {
    it('when runFlow called then returns without re-executing (idempotência local)', async () => {
      const { tx, updateMock } = buildTxMock({
        selectResults: [[makeExecution({ status: 'succeeded' })]],
      })

      await runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)

      // No update should have been made
      expect(updateMock).not.toHaveBeenCalled()
    })
  })

  describe('given execution already failed', () => {
    it('when runFlow called then returns without re-executing (idempotência local)', async () => {
      const { tx, updateMock } = buildTxMock({
        selectResults: [[makeExecution({ status: 'failed' })]],
      })

      await runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)

      expect(updateMock).not.toHaveBeenCalled()
    })
  })

  describe('given simple flow: trigger → action', () => {
    it('when executed then status=succeeded, 2 log entries inserted', async () => {
      const triggerNode = makeTriggerNode(NODE_ACTION_ID)
      const actionNode = makeActionNode(NODE_ACTION_ID)

      const { tx, insertedValues, updatedSets } = buildTxMock({
        selectResults: [
          [makeExecution()],                        // execution
          [makeFlow(NODE_TRIGGER_ID)],              // flow
          [triggerNode, actionNode],                // all nodes
          // condition/action queries:
          [makeActionRow(NODE_ACTION_ID, 'apply_tag', { tag: 'vip' })], // action row for action node
        ],
      })

      await runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)

      // Should have 2 log entries (trigger + action)
      expect(insertedValues).toHaveLength(2)

      const triggerLog = insertedValues[0] as Record<string, unknown>
      expect(triggerLog.nodeKind).toBe('trigger')
      expect(triggerLog.status).toBe('ok')
      expect(triggerLog.executionId).toBe(EXECUTION_ID)

      const actionLog = insertedValues[1] as Record<string, unknown>
      expect(actionLog.nodeKind).toBe('action')
      expect(actionLog.status).toBe('ok')
      expect(actionLog.executionId).toBe(EXECUTION_ID)

      // Last update should set status=succeeded
      const lastUpdate = updatedSets[updatedSets.length - 1] as Record<string, unknown>
      expect(lastUpdate.status).toBe('succeeded')
      expect(lastUpdate.finishedAt).toBeInstanceOf(Date)
    })
  })

  describe('given flow with condition true', () => {
    it('when condition evaluates true then follows next_on_true_id, log output.result=true', async () => {
      // trigger → condition (true) → action_true
      const triggerNode = makeTriggerNode(NODE_CONDITION_ID)
      const conditionNode = makeConditionNode(NODE_ACTION_TRUE_ID, NODE_ACTION_FALSE_ID)
      const actionTrueNode = makeActionNode(NODE_ACTION_TRUE_ID)

      // expr: subject.score >= 20 → true (ctx has score=30)
      const condExpr = { gte: ['$score', 20] }

      const { tx, insertedValues } = buildTxMock({
        selectResults: [
          [makeExecution()],                           // execution
          [makeFlow(NODE_TRIGGER_ID)],                 // flow
          [triggerNode, conditionNode, actionTrueNode], // all nodes
          [makeConditionRow(NODE_CONDITION_ID, condExpr)], // condition row
          [makeActionRow(NODE_ACTION_TRUE_ID, 'apply_tag', { tag: 'hot' })], // action row
        ],
      })

      await runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)

      expect(insertedValues).toHaveLength(3) // trigger + condition + action_true

      const condLog = insertedValues[1] as Record<string, unknown>
      expect(condLog.nodeKind).toBe('condition')
      expect(condLog.status).toBe('ok')
      const output = condLog.output as Record<string, unknown>
      expect(output.result).toBe(true)

      const actionLog = insertedValues[2] as Record<string, unknown>
      expect(actionLog.nodeId).toBe(NODE_ACTION_TRUE_ID)
    })
  })

  describe('given flow with condition false', () => {
    it('when condition evaluates false then follows next_on_false_id, log output.result=false', async () => {
      // trigger → condition (false) → action_false
      const triggerNode = makeTriggerNode(NODE_CONDITION_ID)
      const conditionNode = makeConditionNode(NODE_ACTION_TRUE_ID, NODE_ACTION_FALSE_ID)
      const actionFalseNode = makeActionNode(NODE_ACTION_FALSE_ID)

      // expr: subject.score >= 50 → false (ctx has score=30)
      const condExpr = { gte: ['$score', 50] }

      const { tx, insertedValues } = buildTxMock({
        selectResults: [
          [makeExecution()],                             // execution
          [makeFlow(NODE_TRIGGER_ID)],                   // flow
          [triggerNode, conditionNode, actionFalseNode], // all nodes
          [makeConditionRow(NODE_CONDITION_ID, condExpr)], // condition row
          [makeActionRow(NODE_ACTION_FALSE_ID, 'apply_tag', { tag: 'cold' })], // action row
        ],
      })

      await runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx)

      expect(insertedValues).toHaveLength(3) // trigger + condition + action_false

      const condLog = insertedValues[1] as Record<string, unknown>
      const output = condLog.output as Record<string, unknown>
      expect(output.result).toBe(false)

      const actionLog = insertedValues[2] as Record<string, unknown>
      expect(actionLog.nodeId).toBe(NODE_ACTION_FALSE_ID)
    })
  })

  describe('given action throws exception', () => {
    it('when action fails then execution status=failed and log has status=error', async () => {
      const triggerNode = makeTriggerNode(NODE_ACTION_ID)
      const actionNode = makeActionNode(NODE_ACTION_ID)

      const failingHandler: ActionHandler = vi.fn().mockRejectedValue(new Error('external timeout'))

      const { tx, insertedValues, updatedSets } = buildTxMock({
        selectResults: [
          [makeExecution()],                         // execution
          [makeFlow(NODE_TRIGGER_ID)],               // flow
          [triggerNode, actionNode],                 // all nodes
          [makeActionRow(NODE_ACTION_ID, 'send_external', { url: 'https://example.com' })], // action
        ],
      })

      // runFlow deve relançar o erro para o Inngest
      await expect(
        runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(failingHandler), tx),
      ).rejects.toThrow('external timeout')

      // Log entry da action deve ter status='error'
      const actionLog = insertedValues[1] as Record<string, unknown>
      expect(actionLog.nodeKind).toBe('action')
      expect(actionLog.status).toBe('error')
      expect(typeof actionLog.error).toBe('string')
      expect(actionLog.error).toContain('external timeout')

      // Execution status deve ser 'failed'
      const failedUpdate = updatedSets.find(
        (s) => (s as Record<string, unknown>).status === 'failed',
      ) as Record<string, unknown> | undefined
      expect(failedUpdate).toBeDefined()
      expect(failedUpdate?.error).toContain('external timeout')
      expect(failedUpdate?.finishedAt).toBeInstanceOf(Date)
    })
  })

  describe('given loop detected (>100 nodes)', () => {
    it('when nodes exceed 100 then throws AutomationLoopDetectedError', async () => {
      // Criar um nó que aponta para si mesmo → loop infinito
      // Usamos um único nó trigger que aponta de volta para si mesmo
      const selfLoopNode = {
        id: NODE_TRIGGER_ID,
        flowId: FLOW_ID,
        kind: 'trigger',
        label: 'Loop',
        nextNodeId: NODE_TRIGGER_ID, // aponta para si mesmo
        nextOnTrueId: null,
        nextOnFalseId: null,
        config: {},
        positionX: '0',
        positionY: '0',
        createdAt: new Date(),
      }

      const { tx } = buildTxMock({
        selectResults: [
          [makeExecution()],                // execution
          [makeFlow(NODE_TRIGGER_ID)],      // flow
          [selfLoopNode],                   // nodes (apenas o nó que faz loop)
          // Sem mais selects: o loop vai disparar antes de buscar condition/action
        ],
      })

      await expect(
        runFlow(EXECUTION_ID, DEFAULT_CTX, makeActionHandler(), tx),
      ).rejects.toThrow(AutomationLoopDetectedError)
    })
  })
})
