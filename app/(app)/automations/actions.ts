'use server'

/**
 * MOD-AUTOMATION — Server Actions (T-11-10)
 *
 * CRUD flow, CRUD nó, publicar/despublicar, reprocess execução.
 *
 * Spec:    docs/20-domain/15-automation.md §10, §12
 * RBAC:    docs/50-business-rules/BR-RBAC.md
 * Contract: docs/30-contracts/05-api-server-actions.md
 *
 * Regras implementadas:
 *   INV-AUTOMATION-01: flow sem start_node_id não pode ser publicado
 *   INV-AUTOMATION-04: params de action validados antes de persistir
 *   FLOW-AUTOMATION-REPROCESS: execução com status='failed' → nova execução
 */

import { z } from 'zod'
import { eq, and, isNull, desc, asc } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/lib/db/client'
import {
  automationFlow,
  automationNode,
  automationTrigger,
  automationCondition,
  automationAction,
  automationExecution,
  automationExecutionLog,
  automationTriggerKindEnum,
  automationActionKindEnum,
} from '@/lib/db/schema/automation'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { inngest } from '@/inngest/client'
import {
  actionParamsSchema,
  conditionExprSchema,
  triggerFilterSchema,
} from '@/lib/domain/automation/schemas'

// ---------------------------------------------------------------------------
// Schemas de validação Zod (fronteira UI → Action)
// ---------------------------------------------------------------------------

const createFlowSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  description: z.string().max(2000).optional().nullable(),
  brandId: z.string().uuid('brandId deve ser UUID').optional().nullable(),
})

const updateFlowSchema = z.object({
  flowId: z.string().uuid('flowId deve ser UUID'),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  startNodeId: z.string().uuid().optional().nullable(),
})

const flowIdSchema = z.object({
  flowId: z.string().uuid('flowId deve ser UUID'),
})

const createNodeSchema = z.object({
  flowId: z.string().uuid('flowId deve ser UUID'),
  kind: z.enum(['trigger', 'condition', 'action']),
  label: z.string().max(255).optional().nullable(),
  config: z.record(z.unknown()).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
})

const updateNodeSchema = z.object({
  nodeId: z.string().uuid('nodeId deve ser UUID'),
  label: z.string().max(255).optional().nullable(),
  config: z.record(z.unknown()).optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  nextNodeId: z.string().uuid().optional().nullable(),
  nextOnTrueId: z.string().uuid().optional().nullable(),
  nextOnFalseId: z.string().uuid().optional().nullable(),
})

const nodeIdSchema = z.object({
  nodeId: z.string().uuid('nodeId deve ser UUID'),
})

const upsertTriggerSchema = z.object({
  nodeId: z.string().uuid('nodeId deve ser UUID'),
  kind: z.enum(automationTriggerKindEnum.enumValues),
  filter: z.record(z.unknown()).optional(),
})

const upsertConditionSchema = z.object({
  nodeId: z.string().uuid('nodeId deve ser UUID'),
  // INV-AUTOMATION-04: expr validada com conditionExprSchema
  expr: z.unknown(),
})

const upsertActionSchema = z.object({
  nodeId: z.string().uuid('nodeId deve ser UUID'),
  kind: z.enum(automationActionKindEnum.enumValues),
  // INV-AUTOMATION-04: params validados com actionParamsSchema
  params: z.record(z.unknown()),
})

const executionIdSchema = z.object({
  executionId: z.string().uuid('executionId deve ser UUID'),
})

// ---------------------------------------------------------------------------
// FLOWS — CRUD + Publicar/Despublicar
// ---------------------------------------------------------------------------

/**
 * createFlow — cria fluxo de automação em estado inativo.
 * Guard: automation.write (admin, marketing)
 * INV-AUTOMATION-01: flow começa com is_active=false e start_node_id=null.
 */
export async function createFlow(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createFlowSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(automationFlow)
        .values({
          name: input.name,
          description: input.description ?? null,
          brandId: input.brandId ?? null,
          isActive: false,
          startNodeId: null,
          version: 1,
          createdBy: ctx.user.id,
        })
        .returning()

      const created = rows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao criar fluxo de automação')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'automation_flow',
        resourceId: created.id,
        after: created as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created
    })

    revalidatePath('/automations')
    return result
  })
}

/**
 * updateFlow — atualiza campos do fluxo (nome, descrição, startNodeId).
 * Guard: automation.write
 */
export async function updateFlow(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = updateFlowSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'automation', id: input.flowId })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(automationFlow)
        .where(and(eq(automationFlow.id, input.flowId), isNull(automationFlow.deletedAt)))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Fluxo ${input.flowId} não encontrado`)
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() }
      if (input.name !== undefined) patch.name = input.name
      if (input.description !== undefined) patch.description = input.description ?? null
      if (input.startNodeId !== undefined) patch.startNodeId = input.startNodeId ?? null

      const rows = await tx
        .update(automationFlow)
        .set(patch)
        .where(eq(automationFlow.id, input.flowId))
        .returning()

      const updated = rows[0]
      if (!updated) throw new ActionError('INTERNAL', 'Falha ao atualizar fluxo')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'automation_flow',
        resourceId: input.flowId,
        before: current as Record<string, unknown>,
        after: updated as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath('/automations')
    revalidatePath(`/automations/${input.flowId}`)
    return result
  })
}

/**
 * publishFlow — ativa o fluxo (is_active=true).
 * Guard: automation.write
 * INV-AUTOMATION-01: start_node_id deve estar definido antes de publicar.
 */
export async function publishFlow(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const { flowId } = flowIdSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'automation', id: flowId })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(automationFlow)
        .where(and(eq(automationFlow.id, flowId), isNull(automationFlow.deletedAt)))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Fluxo ${flowId} não encontrado`)
      }

      // INV-AUTOMATION-01: flow sem nó inicial não pode ser publicado
      if (!current.startNodeId) {
        throw new ActionError(
          'VALIDATION',
          'Flow has no start node',
          { rule: 'INV-AUTOMATION-01' },
        )
      }

      if (current.isActive) {
        throw new ActionError('VALIDATION', 'Fluxo já está publicado')
      }

      const rows = await tx
        .update(automationFlow)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(automationFlow.id, flowId))
        .returning()

      const updated = rows[0]
      if (!updated) throw new ActionError('INTERNAL', 'Falha ao publicar fluxo')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'automation_flow',
        resourceId: flowId,
        before: { isActive: false },
        after: { isActive: true },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath('/automations')
    revalidatePath(`/automations/${flowId}`)
    return result
  })
}

/**
 * unpublishFlow — desativa o fluxo (is_active=false).
 * Guard: automation.write
 */
export async function unpublishFlow(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const { flowId } = flowIdSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'automation', id: flowId })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(automationFlow)
        .where(and(eq(automationFlow.id, flowId), isNull(automationFlow.deletedAt)))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Fluxo ${flowId} não encontrado`)
      }

      if (!current.isActive) {
        throw new ActionError('VALIDATION', 'Fluxo já está despublicado')
      }

      const rows = await tx
        .update(automationFlow)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(automationFlow.id, flowId))
        .returning()

      const updated = rows[0]
      if (!updated) throw new ActionError('INTERNAL', 'Falha ao despublicar fluxo')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'automation_flow',
        resourceId: flowId,
        before: { isActive: true },
        after: { isActive: false },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath('/automations')
    revalidatePath(`/automations/${flowId}`)
    return result
  })
}

/**
 * deleteFlow — soft-delete (set deletedAt = now(), is_active = false).
 * Guard: automation.write
 * Nunca DELETE físico — docs/30-contracts/02-db-schema-conventions.md §4.
 */
export async function deleteFlow(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const { flowId } = flowIdSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'automation', id: flowId })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(automationFlow)
        .where(and(eq(automationFlow.id, flowId), isNull(automationFlow.deletedAt)))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Fluxo ${flowId} não encontrado`)
      }

      const now = new Date()
      const rows = await tx
        .update(automationFlow)
        .set({ deletedAt: now, isActive: false, updatedAt: now })
        .where(eq(automationFlow.id, flowId))
        .returning({ id: automationFlow.id })

      const deleted = rows[0]
      if (!deleted) throw new ActionError('INTERNAL', 'Falha ao excluir fluxo')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'delete',
        resourceKind: 'automation_flow',
        resourceId: flowId,
        before: current as Record<string, unknown>,
        after: { deletedAt: now.toISOString(), isActive: false },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return deleted
    })

    revalidatePath('/automations')
    return result
  })
}

// ---------------------------------------------------------------------------
// NODES — CRUD
// ---------------------------------------------------------------------------

/**
 * createNode — adiciona nó ao grafo do fluxo.
 * Guard: automation.write
 */
export async function createNode(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createNodeSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      // Verificar que o fluxo existe e não está deletado
      const [flow] = await tx
        .select({ id: automationFlow.id })
        .from(automationFlow)
        .where(and(eq(automationFlow.id, input.flowId), isNull(automationFlow.deletedAt)))
        .limit(1)

      if (!flow) {
        throw new ActionError('NOT_FOUND', `Fluxo ${input.flowId} não encontrado`)
      }

      const rows = await tx
        .insert(automationNode)
        .values({
          flowId: input.flowId,
          kind: input.kind,
          label: input.label ?? null,
          config: input.config ?? {},
          positionX: input.positionX != null ? String(input.positionX) : '0',
          positionY: input.positionY != null ? String(input.positionY) : '0',
        })
        .returning()

      const created = rows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao criar nó')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'automation_node',
        resourceId: created.id,
        after: created as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created
    })

    revalidatePath(`/automations/${input.flowId}`)
    return result
  })
}

/**
 * updateNode — atualiza propriedades de um nó.
 * Guard: automation.write
 */
export async function updateNode(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = updateNodeSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(automationNode)
        .where(eq(automationNode.id, input.nodeId))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Nó ${input.nodeId} não encontrado`)
      }

      const patch: Record<string, unknown> = {}
      if (input.label !== undefined) patch.label = input.label ?? null
      if (input.config !== undefined) patch.config = input.config
      if (input.positionX !== undefined) patch.positionX = String(input.positionX)
      if (input.positionY !== undefined) patch.positionY = String(input.positionY)
      if (input.nextNodeId !== undefined) patch.nextNodeId = input.nextNodeId ?? null
      if (input.nextOnTrueId !== undefined) patch.nextOnTrueId = input.nextOnTrueId ?? null
      if (input.nextOnFalseId !== undefined) patch.nextOnFalseId = input.nextOnFalseId ?? null

      const rows = await tx
        .update(automationNode)
        .set(patch)
        .where(eq(automationNode.id, input.nodeId))
        .returning()

      const updated = rows[0]
      if (!updated) throw new ActionError('INTERNAL', 'Falha ao atualizar nó')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'automation_node',
        resourceId: input.nodeId,
        before: current as Record<string, unknown>,
        after: updated as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath(`/automations/${result.flowId}`)
    return result
  })
}

/**
 * deleteNode — DELETE físico (nó é filho com CASCADE do fluxo).
 * Guard: automation.write
 * docs/20-domain/15-automation.md §3: ON DELETE CASCADE em automation_node.flow_id.
 */
export async function deleteNode(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const { nodeId } = nodeIdSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(automationNode)
        .where(eq(automationNode.id, nodeId))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Nó ${nodeId} não encontrado`)
      }

      await tx.delete(automationNode).where(eq(automationNode.id, nodeId))

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'delete',
        resourceKind: 'automation_node',
        resourceId: nodeId,
        before: current as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { id: nodeId, flowId: current.flowId }
    })

    revalidatePath(`/automations/${result.flowId}`)
    const { flowId: _flowId, ...deleted } = result
    return deleted
  })
}

// ---------------------------------------------------------------------------
// TRIGGER / CONDITION / ACTION — Upsert 1-1 por nó
// ---------------------------------------------------------------------------

/**
 * upsertTrigger — cria ou substitui configuração de trigger de um nó.
 * Guard: automation.write
 * Relação 1-1: UNIQUE(node_id) em automation_trigger.
 */
export async function upsertTrigger(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = upsertTriggerSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'global' })

    // Validar filter com schema tipado por kind, se fornecido
    const filterPayload = input.filter ?? {}
    if (input.filter && Object.keys(input.filter).length > 0) {
      // Validar filter combinando kind + filter
      const filterWithKind = { kind: input.kind, ...input.filter }
      try {
        triggerFilterSchema.parse(filterWithKind)
      } catch {
        throw new ActionError('VALIDATION', 'Filter inválido para o kind de trigger informado')
      }
    }

    const result = await db.transaction(async (tx) => {
      // Verificar que o nó existe e tem kind='trigger'
      const [node] = await tx
        .select({ id: automationNode.id, kind: automationNode.kind, flowId: automationNode.flowId })
        .from(automationNode)
        .where(eq(automationNode.id, input.nodeId))
        .limit(1)

      if (!node) {
        throw new ActionError('NOT_FOUND', `Nó ${input.nodeId} não encontrado`)
      }

      if (node.kind !== 'trigger') {
        throw new ActionError(
          'VALIDATION',
          `Nó ${input.nodeId} tem kind="${node.kind}", esperado "trigger"`,
        )
      }

      // Upsert: insert + onConflict update (1-1 via UNIQUE node_id)
      const rows = await tx
        .insert(automationTrigger)
        .values({
          nodeId: input.nodeId,
          kind: input.kind,
          filter: filterPayload,
        })
        .onConflictDoUpdate({
          target: automationTrigger.nodeId,
          set: {
            kind: input.kind,
            filter: filterPayload,
          },
        })
        .returning()

      const upserted = rows[0]
      if (!upserted) throw new ActionError('INTERNAL', 'Falha ao salvar trigger')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'automation_trigger',
        resourceId: upserted.id,
        after: upserted as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return upserted
    })

    return result
  })
}

/**
 * upsertCondition — cria ou substitui configuração de condição de um nó.
 * Guard: automation.write
 * INV-AUTOMATION-04: expr validada com conditionExprSchema antes de persistir.
 */
export async function upsertCondition(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = upsertConditionSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'global' })

    // INV-AUTOMATION-04: validar expressão DSL antes de persistir
    const exprParsed = conditionExprSchema.parse(input.expr)

    const result = await db.transaction(async (tx) => {
      // Verificar que o nó existe e tem kind='condition'
      const [node] = await tx
        .select({ id: automationNode.id, kind: automationNode.kind })
        .from(automationNode)
        .where(eq(automationNode.id, input.nodeId))
        .limit(1)

      if (!node) {
        throw new ActionError('NOT_FOUND', `Nó ${input.nodeId} não encontrado`)
      }

      if (node.kind !== 'condition') {
        throw new ActionError(
          'VALIDATION',
          `Nó ${input.nodeId} tem kind="${node.kind}", esperado "condition"`,
        )
      }

      // Upsert: insert + onConflict update
      const rows = await tx
        .insert(automationCondition)
        .values({
          nodeId: input.nodeId,
          expr: exprParsed,
        })
        .onConflictDoUpdate({
          target: automationCondition.nodeId,
          set: {
            expr: exprParsed,
          },
        })
        .returning()

      const upserted = rows[0]
      if (!upserted) throw new ActionError('INTERNAL', 'Falha ao salvar condição')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'automation_condition',
        resourceId: upserted.id,
        after: upserted as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return upserted
    })

    return result
  })
}

/**
 * upsertAction — cria ou substitui configuração de ação de um nó.
 * Guard: automation.write
 * INV-AUTOMATION-04: params validados com actionParamsSchema antes de persistir.
 */
export async function upsertAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = upsertActionSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.write', { kind: 'global' })

    // INV-AUTOMATION-04: validar params contra schema discriminado por kind
    const paramsWithKind = { kind: input.kind, ...input.params }
    const paramsParsed = actionParamsSchema.parse(paramsWithKind)
    // Extrair params sem o campo kind para persistir separado
    const { kind: _k, ...paramsToStore } = paramsParsed

    const result = await db.transaction(async (tx) => {
      // Verificar que o nó existe e tem kind='action'
      const [node] = await tx
        .select({ id: automationNode.id, kind: automationNode.kind })
        .from(automationNode)
        .where(eq(automationNode.id, input.nodeId))
        .limit(1)

      if (!node) {
        throw new ActionError('NOT_FOUND', `Nó ${input.nodeId} não encontrado`)
      }

      if (node.kind !== 'action') {
        throw new ActionError(
          'VALIDATION',
          `Nó ${input.nodeId} tem kind="${node.kind}", esperado "action"`,
        )
      }

      // Upsert: insert + onConflict update
      const rows = await tx
        .insert(automationAction)
        .values({
          nodeId: input.nodeId,
          kind: input.kind,
          params: paramsToStore,
        })
        .onConflictDoUpdate({
          target: automationAction.nodeId,
          set: {
            kind: input.kind,
            params: paramsToStore,
          },
        })
        .returning()

      const upserted = rows[0]
      if (!upserted) throw new ActionError('INTERNAL', 'Falha ao salvar ação')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'automation_action',
        resourceId: upserted.id,
        after: upserted as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return upserted
    })

    return result
  })
}

// ---------------------------------------------------------------------------
// EXECUÇÕES — Leitura (lista + detalhe)
// ---------------------------------------------------------------------------

const listExecutionsSchema = z.object({
  flowId: z.string().uuid('flowId deve ser UUID'),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
})

const getExecutionSchema = z.object({
  executionId: z.string().uuid('executionId deve ser UUID'),
})

export type ExecutionListItem = {
  id: string
  flowId: string
  subjectKind: string | null
  subjectId: string | null
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  triggeredAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  error: string | null
  retryCount: number
}

export type ExecutionDetail = ExecutionListItem & {
  logs: ExecutionLogItem[]
}

export type ExecutionLogItem = {
  id: string
  nodeId: string
  nodeKind: string
  status: string
  input: unknown
  output: unknown
  error: string | null
  executedAt: Date
}

/**
 * listExecutions — lista todas as execuções de um fluxo, paginadas.
 * Guard: requireSession() (leitura, sem permission adicional)
 */
export async function listExecutions(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()
    const input = listExecutionsSchema.parse(rawInput)

    const offset = (input.page - 1) * input.pageSize

    const rows = await db
      .select()
      .from(automationExecution)
      .where(eq(automationExecution.flowId, input.flowId))
      .orderBy(desc(automationExecution.triggeredAt))
      .limit(input.pageSize)
      .offset(offset)

    return rows as ExecutionListItem[]
  })
}

/**
 * getExecution — carrega execução com todos os logs.
 * Guard: requireSession()
 */
export async function getExecution(rawInput: unknown) {
  return toActionResult(async () => {
    await requireSession()
    const { executionId } = getExecutionSchema.parse(rawInput)

    const [execution] = await db
      .select()
      .from(automationExecution)
      .where(eq(automationExecution.id, executionId))
      .limit(1)

    if (!execution) {
      throw new ActionError('NOT_FOUND', `Execução ${executionId} não encontrada`)
    }

    const logs = await db
      .select()
      .from(automationExecutionLog)
      .where(eq(automationExecutionLog.executionId, executionId))
      .orderBy(asc(automationExecutionLog.executedAt))

    return {
      ...execution,
      logs,
    } as ExecutionDetail
  })
}

// ---------------------------------------------------------------------------
// EXECUÇÕES — Reprocess DLQ
// ---------------------------------------------------------------------------

/**
 * reprocessExecution — reenfileira execução com status='failed'.
 * Guard: automation.reprocess (admin)
 * FLOW-AUTOMATION-REPROCESS: cria nova automation_execution com novo idempotency_key
 * (timestamp atual) e envia evento 'automation/run' ao Inngest.
 */
export async function reprocessExecution(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const { executionId } = executionIdSchema.parse(rawInput)

    await requirePermission(ctx, 'automation.reprocess', { kind: 'global' })

    // Transação: ler execution original + criar nova + audit
    const { newExecutionId, flowId } = await db.transaction(async (tx) => {
      const [original] = await tx
        .select()
        .from(automationExecution)
        .where(eq(automationExecution.id, executionId))
        .limit(1)

      if (!original) {
        throw new ActionError('NOT_FOUND', `Execução ${executionId} não encontrada`)
      }

      // FLOW-AUTOMATION-REPROCESS: apenas execuções com status='failed' podem ser reenfileiradas
      if (original.status !== 'failed') {
        throw new ActionError(
          'VALIDATION',
          `Somente execuções com status "failed" podem ser reprocessadas (atual: "${original.status}")`,
          { rule: 'FLOW-AUTOMATION-REPROCESS' },
        )
      }

      // Novo idempotency_key baseado em timestamp atual para contornar constraint UNIQUE
      const newIdempotencyKey = `reprocess:${executionId}:${Date.now()}`

      const rows = await tx
        .insert(automationExecution)
        .values({
          flowId: original.flowId,
          subjectKind: original.subjectKind,
          subjectId: original.subjectId ?? undefined,
          idempotencyKey: newIdempotencyKey,
          status: 'pending',
          retryCount: 0,
        })
        .returning({ id: automationExecution.id })

      const created = rows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao criar nova execução')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'other',
        resourceKind: 'automation_execution',
        resourceId: created.id,
        after: { reprocessedFrom: executionId, newExecutionId: created.id },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, original_execution_id: executionId },
      })

      return { newExecutionId: created.id, flowId: original.flowId }
    })

    // Enfileirar no Inngest fora da transação SQL (efeito externo)
    await inngest.send({
      name: 'automation/run',
      data: {
        executionId: newExecutionId,
        correlationId: ctx.correlationId,
      },
    })

    revalidatePath(`/automations/${flowId}/executions`)
    revalidatePath(`/automations/${flowId}/executions/${executionId}`)
    return { executionId: newExecutionId }
  })
}
