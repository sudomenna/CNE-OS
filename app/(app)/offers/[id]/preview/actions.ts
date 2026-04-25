'use server'

/**
 * MOD-OFFER — Server Actions do Preview/Simulador de Oferta
 * T-6-21: Preview/Simulador: dado DecisionContext, mostra qual condição seria selecionada
 *
 * Spec: docs/20-domain/10-offer-engine.md §11
 * Contract: docs/30-contracts/05-api-server-actions.md
 * RBAC: docs/50-business-rules/BR-RBAC.md (offer.write)
 */

import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'

import { db } from '@/lib/db/client'
import {
  offer,
  offerCondition,
  offerConditionRuleGroup,
  offerConditionRule,
} from '@/lib/db/schema/offer'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'
import {
  evaluateEligibility,
  selectCondition,
} from '@/lib/domain/offer'
import type { EligibilityContext, RuleGroup, Rule } from '@/lib/domain/offer'
import type { SelectConditionResult } from '@/lib/domain/offer'

// ---------------------------------------------------------------------------
// Schemas de validação Zod
// ---------------------------------------------------------------------------

const decisionContextSchema = z.object({
  contactId: z.string().min(1).optional().or(z.literal('')).transform((v) => v || undefined),
  channel: z.enum(['whatsapp', 'instagram', 'email']).optional(),
  campaignId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  creativeId: z.string().uuid().optional().or(z.literal('')).transform((v) => v || undefined),
  salesCount: z.coerce.number().int().min(0).optional(),
  isInternalUse: z.boolean().optional(),
})

const simulateDecisionSchema = z.object({
  offerId: z.string().uuid('offerId deve ser UUID'),
  ctx: decisionContextSchema,
})

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

export type EvaluatedCondition = {
  conditionId: string
  conditionName: string
  eligible: boolean
  priority: number
  advantageScore: number
  isDefault: boolean
}

export type SimulateResult = {
  result: SelectConditionResult
  evaluated: EvaluatedCondition[]
}

// ---------------------------------------------------------------------------
// Helpers: construir árvore de grupos a partir de flat list
// ---------------------------------------------------------------------------

function buildRuleGroup(
  groups: Array<{
    id: string
    parentGroupId: string | null
    operator: 'and' | 'or'
  }>,
  rules: Array<{
    id: string
    ruleGroupId: string
    kind: string
    params: unknown
  }>,
  groupId: string,
): RuleGroup {
  const group = groups.find((g) => g.id === groupId)!
  const childGroups = groups.filter((g) => g.parentGroupId === groupId)
  const atomicRules: Rule[] = rules
    .filter((r) => r.ruleGroupId === groupId)
    .map((r) => ({
      id: r.id,
      kind: r.kind as Rule['kind'],
      params: r.params,
    }))

  return {
    id: group.id,
    operator: group.operator,
    rules: atomicRules,
    children: childGroups.map((child) => buildRuleGroup(groups, rules, child.id)),
  }
}

// ---------------------------------------------------------------------------
// Server Action: simulateDecisionAction
// ---------------------------------------------------------------------------

/**
 * simulateDecisionAction — dado um offerId e DecisionContext, avalia todas as
 * condições ativas e retorna o resultado da decisão junto com a avaliação por
 * condição.
 *
 * Guard: requer offer.write (admins e commercial que configuram ofertas).
 *
 * BR-OFFER-DECISION, BR-OFFER-ELIGIBILITY
 * docs/20-domain/10-offer-engine.md §11
 */
export async function simulateDecisionAction(
  offerId: string,
  rawCtx: {
    contactId?: string
    channel?: string
    campaignId?: string
    creativeId?: string
    salesCount?: number
    isInternalUse?: boolean
  },
) {
  const correlationId = crypto.randomUUID()

  return toActionResult<SimulateResult>(async () => {
    // RBAC
    const session = await requireSession()
    await requirePermission(session, 'offer.write', { kind: 'offer', id: offerId })

    // Validação de input
    const parsed = simulateDecisionSchema.safeParse({ offerId, ctx: rawCtx })
    if (!parsed.success) {
      throw new ActionError('VALIDATION', parsed.error.message)
    }
    const { ctx } = parsed.data

    // Verificar se oferta existe
    const [offerRow] = await db
      .select({ id: offer.id, status: offer.status })
      .from(offer)
      .where(eq(offer.id, offerId))
      .limit(1)

    if (!offerRow) {
      throw new ActionError('NOT_FOUND', `Oferta ${offerId} não encontrada`)
    }

    // Carregar condições ativas (sem soft-delete)
    const conditions = await db
      .select({
        id: offerCondition.id,
        name: offerCondition.name,
        priority: offerCondition.priority,
        advantageScore: offerCondition.advantageScore,
        isDefault: offerCondition.isDefault,
        isPublic: offerCondition.isPublic,
        createdAt: offerCondition.createdAt,
      })
      .from(offerCondition)
      .where(
        eq(offerCondition.offerId, offerId),
        // BR-OFFER-ELIGIBILITY: só condições ativas entram no processo de decisão
      )

    // No preview mostramos todas as condições (inclusive draft) para fins de diagnóstico
    const activeConditions = conditions

    if (activeConditions.length === 0) {
      return {
        result: { kind: 'none' },
        evaluated: [],
      }
    }

    const conditionIds = activeConditions.map((c) => c.id)

    // Carregar grupos de todas as condições
    const allGroups = await db
      .select({
        id: offerConditionRuleGroup.id,
        offerConditionId: offerConditionRuleGroup.offerConditionId,
        parentGroupId: offerConditionRuleGroup.parentGroupId,
        operator: offerConditionRuleGroup.operator,
      })
      .from(offerConditionRuleGroup)
      .where(inArray(offerConditionRuleGroup.offerConditionId, conditionIds))

    // Carregar regras usando IDs de grupos reais
    const groupIds = allGroups.map((g) => g.id)
    const realRules =
      groupIds.length > 0
        ? await db
            .select({
              id: offerConditionRule.id,
              ruleGroupId: offerConditionRule.ruleGroupId,
              kind: offerConditionRule.kind,
              params: offerConditionRule.params,
            })
            .from(offerConditionRule)
            .where(inArray(offerConditionRule.ruleGroupId, groupIds))
        : []

    // Construir contexto de elegibilidade
    // exactOptionalPropertyTypes: build object without optional fields, then assign individually
    const eligCtx: EligibilityContext = {
      now: new Date(),
      contactId: ctx.contactId ?? 'preview',
    }
    if (ctx.campaignId !== undefined) eligCtx.campaignId = ctx.campaignId
    if (ctx.creativeId !== undefined) eligCtx.creativeId = ctx.creativeId
    if (ctx.channel !== undefined) {
      const ch = ctx.channel as 'whatsapp' | 'instagram' | 'email'
      eligCtx.channel = ch
    }
    if (ctx.salesCount !== undefined) eligCtx.salesCount = ctx.salesCount
    if (ctx.isInternalUse !== undefined) eligCtx.isInternalUse = ctx.isInternalUse

    // Avaliar cada condição
    const evaluated: EvaluatedCondition[] = []
    const eligibleForSelection: Array<{
      id: string
      priority: number
      advantageScore: number
      createdAt: Date
      isDefault: boolean
    }> = []

    for (const cond of activeConditions) {
      // Encontrar grupo raiz desta condição
      const rootGroup = allGroups.find(
        (g) => g.offerConditionId === cond.id && g.parentGroupId === null,
      )

      let eligible: boolean

      if (!rootGroup) {
        // Sem grupo raiz → grupo AND vazio → elegível por vacuous truth
        // BR-OFFER-ELIGIBILITY: empty AND group = true
        eligible = true
      } else {
        const ruleGroupTree = buildRuleGroup(allGroups, realRules, rootGroup.id)
        eligible = evaluateEligibility(ruleGroupTree, eligCtx)
      }

      evaluated.push({
        conditionId: cond.id,
        conditionName: cond.name,
        eligible,
        priority: cond.priority,
        advantageScore: parseFloat(cond.advantageScore ?? '0'),
        isDefault: cond.isDefault,
      })

      if (eligible) {
        eligibleForSelection.push({
          id: cond.id,
          priority: cond.priority,
          advantageScore: parseFloat(cond.advantageScore ?? '0'),
          createdAt: cond.createdAt,
          isDefault: cond.isDefault,
        })
      }
    }

    // BR-OFFER-DECISION: selecionar condição vencedora
    const result = selectCondition(eligibleForSelection)

    return { result, evaluated }
  }, correlationId)
}
