'use server'

/**
 * MOD-OFFER — Server Actions
 * T-6-16: CRUD offer + condições + regras + itens + payment options
 *
 * Spec: docs/20-domain/10-offer-engine.md §2 Ownership
 * Contract: docs/30-contracts/05-api-server-actions.md
 * RBAC: docs/50-business-rules/BR-RBAC.md
 */

import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/lib/db/client'
import {
  offer,
  offerCondition,
  offerConditionRuleGroup,
  offerConditionRule,
  offerConditionItem,
  offerPaymentOption,
  offerSalesCounter,
  offerStatusHistory,
  offerConditionPriorityHistory,
} from '@/lib/db/schema/offer'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { validateRuleParams, OfferRuleParamsError } from '@/lib/domain/offer/rule-params-schema'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converte OfferRuleParamsError para ActionError de validação. */
function ruleParamsToActionError(err: OfferRuleParamsError): ActionError {
  return new ActionError('VALIDATION', err.message, {
    rule: 'BR-OFFER-ELIGIBILITY',
    issues: err.issues,
  })
}

// ---------------------------------------------------------------------------
// Schemas de validação Zod
// ---------------------------------------------------------------------------

const createOfferSchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  issuingLegalEntityId: z.string().uuid('issuingLegalEntityId deve ser UUID'),
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'slug deve ser kebab-case'),
  description: z.string().max(2000).optional().nullable(),
  type: z.enum(['regular', 'renewal']).default('regular'),
  renewsOfferId: z.string().uuid().optional().nullable(),
})

const publishOfferSchema = z.object({
  offerId: z.string().uuid('offerId deve ser UUID'),
})

const archiveOfferSchema = z.object({
  offerId: z.string().uuid('offerId deve ser UUID'),
})

const createConditionSchema = z.object({
  offerId: z.string().uuid('offerId deve ser UUID'),
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  description: z.string().max(2000).optional().nullable(),
  priority: z.number().int().min(-1000).max(1000).default(0),
  advantageScore: z.number().min(0).default(0),
  isPublic: z.boolean().default(true),
  isDefault: z.boolean().default(false),
})

const updateConditionPrioritySchema = z.object({
  conditionId: z.string().uuid('conditionId deve ser UUID'),
  priority: z.number().int().min(-1000).max(1000),
  advantageScore: z.number().min(0),
  reason: z.string().max(500).optional().nullable(),
})

const createRuleGroupSchema = z.object({
  offerConditionId: z.string().uuid('offerConditionId deve ser UUID'),
  parentGroupId: z.string().uuid().optional().nullable(),
  operator: z.enum(['and', 'or']).default('and'),
})

const createRuleSchema = z.object({
  ruleGroupId: z.string().uuid('ruleGroupId deve ser UUID'),
  kind: z.enum([
    'date_range',
    'sales_count_reached',
    'campaign',
    'channel',
    'creative',
    'internal_use',
  ]),
  params: z.record(z.unknown()).default({}),
})

const addConditionItemSchema = z.object({
  offerConditionId: z.string().uuid('offerConditionId deve ser UUID'),
  kind: z.enum(['main', 'bonus', 'upsell', 'order_bump', 'complement', 'commercial_benefit']),
  productId: z.string().uuid().optional().nullable(),
  commercialBenefitId: z.string().uuid().optional().nullable(),
  quantity: z.number().int().min(1).default(1),
  accessRule: z.record(z.unknown()).default({}),
  vigencyMonths: z.number().int().positive().optional().nullable(),
  discount: z.number().min(0).optional().nullable(),
  responsibleUserId: z.string().uuid().optional().nullable(),
  orderIndex: z.number().int().min(0).default(0),
})

const addPaymentOptionSchema = z.object({
  offerConditionId: z.string().uuid('offerConditionId deve ser UUID'),
  method: z.enum(['pix', 'credit_card', 'installments', 'boleto', 'custom']),
  price: z.number().min(0),
  installments: z.number().int().min(2).optional().nullable(),
  customConfig: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
})

// ---------------------------------------------------------------------------
// OFFER CRUD
// ---------------------------------------------------------------------------

/**
 * createOfferAction — cria oferta draft + semente offer_sales_counter na mesma tx.
 * Guard: offer.write (admin, commercial — requires 2FA)
 * INV-OFFER-04: se type='renewal', renewsOfferId é obrigatório (CHECK no DB).
 */
export async function createOfferAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createOfferSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'global' })

    // BR-OFFER: type='renewal' exige renewsOfferId
    if (input.type === 'renewal' && !input.renewsOfferId) {
      throw new ActionError(
        'VALIDATION',
        'Oferta do tipo "renewal" exige renewsOfferId',
        { rule: 'INV-OFFER-04' },
      )
    }
    if (input.type === 'regular' && input.renewsOfferId) {
      throw new ActionError(
        'VALIDATION',
        'Oferta do tipo "regular" não deve ter renewsOfferId',
        { rule: 'INV-OFFER-04' },
      )
    }

    const result = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(offer)
        .values({
          brandId: input.brandId,
          issuingLegalEntityId: input.issuingLegalEntityId,
          name: input.name,
          slug: input.slug,
          description: input.description ?? null,
          type: input.type,
          renewsOfferId: input.renewsOfferId ?? null,
          status: 'draft',
          createdBy: ctx.user.id,
        })
        .returning()

      const created = rows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao criar oferta')

      // INV-OFFER-09: seed do contador — aprovações partem de zero.
      // O trigger offer_seed_sales_counter (migration T-6-11) também cria esta linha;
      // inserimos aqui de forma defensiva para garantir atomicidade no mesmo tx.
      await tx
        .insert(offerSalesCounter)
        .values({ offerId: created.id, approvedCount: 0 })
        .onConflictDoNothing()

      // Audit
      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'offer',
        resourceId: created.id,
        after: created as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created
    })

    revalidatePath('/offers')
    return result
  })
}

/**
 * publishOfferAction — muda status draft/paused → active.
 * Guard: offer.write
 * INV-OFFER-01: valida que existe ≥1 offer_condition com is_default=true e status='active'.
 * Registra em offer_status_history.
 */
export async function publishOfferAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const { offerId } = publishOfferSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'offer', id: offerId })

    const result = await db.transaction(async (tx) => {
      // Carregar oferta atual
      const [current] = await tx
        .select()
        .from(offer)
        .where(eq(offer.id, offerId))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Oferta ${offerId} não encontrada`)
      }

      if (current.status === 'archived') {
        throw new ActionError(
          'VALIDATION',
          'Oferta arquivada não pode ser publicada',
          { rule: 'INV-OFFER-01' },
        )
      }

      // INV-OFFER-01: deve existir ao menos 1 condição com is_default=true e status='active'.
      const defaultConditions = await tx
        .select({ id: offerCondition.id })
        .from(offerCondition)
        .where(
          and(
            eq(offerCondition.offerId, offerId),
            eq(offerCondition.isDefault, true),
            eq(offerCondition.status, 'active'),
            isNull(offerCondition.deletedAt),
          ),
        )
        .limit(1)

      if (defaultConditions.length === 0) {
        // INV-OFFER-01: guard na Server Action garante existência de default ativa.
        throw new ActionError(
          'VALIDATION',
          'Não é possível publicar a oferta: não existe nenhuma condição padrão (is_default=true) com status "active". Crie e ative uma condição padrão antes de publicar.',
          { rule: 'INV-OFFER-01' },
        )
      }

      // Transição de status
      const updatedRows = await tx
        .update(offer)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(offer.id, offerId))
        .returning()
      const updated = updatedRows[0]
      if (!updated) throw new ActionError('INTERNAL', 'Falha ao publicar oferta')

      // INV-OFFER-02: registrar transição em offer_status_history (append-only).
      await tx.insert(offerStatusHistory).values({
        offerId,
        fromStatus: current.status,
        toStatus: 'active',
        changedByUserId: ctx.user.id,
        reason: 'Publicação via UI',
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'offer',
        resourceId: offerId,
        before: { status: current.status },
        after: { status: 'active' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)
    return result
  })
}

/**
 * archiveOfferAction — muda status → archived.
 * Guard: offer.write
 * Registra em offer_status_history.
 * Não verifica transações pending aqui (guard completo em Sprint 8).
 */
export async function archiveOfferAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const { offerId } = archiveOfferSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'offer', id: offerId })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(offer)
        .where(eq(offer.id, offerId))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Oferta ${offerId} não encontrada`)
      }

      if (current.status === 'archived') {
        throw new ActionError('VALIDATION', 'Oferta já está arquivada')
      }

      const archivedRows = await tx
        .update(offer)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(offer.id, offerId))
        .returning()
      const updated = archivedRows[0]
      if (!updated) throw new ActionError('INTERNAL', 'Falha ao arquivar oferta')

      // INV-OFFER-02: append em offer_status_history
      await tx.insert(offerStatusHistory).values({
        offerId,
        fromStatus: current.status,
        toStatus: 'archived',
        changedByUserId: ctx.user.id,
        reason: 'Arquivamento via UI',
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'offer',
        resourceId: offerId,
        before: { status: current.status },
        after: { status: 'archived' },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath('/offers')
    revalidatePath(`/offers/${offerId}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// CONDIÇÕES
// ---------------------------------------------------------------------------

/**
 * createConditionAction — insere offer_condition.
 * Guard: offer.write
 */
export async function createConditionAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createConditionSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'offer', id: input.offerId })

    const result = await db.transaction(async (tx) => {
      // Verificar que a oferta existe
      const [parentOffer] = await tx
        .select({ id: offer.id })
        .from(offer)
        .where(eq(offer.id, input.offerId))
        .limit(1)

      if (!parentOffer) {
        throw new ActionError('NOT_FOUND', `Oferta ${input.offerId} não encontrada`)
      }

      const conditionRows = await tx
        .insert(offerCondition)
        .values({
          offerId: input.offerId,
          name: input.name,
          description: input.description ?? null,
          priority: input.priority,
          advantageScore: String(input.advantageScore),
          isPublic: input.isPublic,
          isDefault: input.isDefault,
          status: 'draft',
          createdBy: ctx.user.id,
        })
        .returning()
      const created = conditionRows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao criar condição')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'offer_condition',
        resourceId: created.id,
        after: created as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created
    })

    revalidatePath(`/offers/${input.offerId}`)
    return result
  })
}

/**
 * updateConditionPriorityAction — atualiza priority + advantage_score e registra em
 * offer_condition_priority_history (INV-OFFER-02).
 * Guard: offer.write
 */
export async function updateConditionPriorityAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = updateConditionPrioritySchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(offerCondition)
        .where(and(eq(offerCondition.id, input.conditionId), isNull(offerCondition.deletedAt)))
        .limit(1)

      if (!current) {
        throw new ActionError('NOT_FOUND', `Condição ${input.conditionId} não encontrada`)
      }

      const priorityRows = await tx
        .update(offerCondition)
        .set({
          priority: input.priority,
          advantageScore: String(input.advantageScore),
          updatedAt: new Date(),
        })
        .where(eq(offerCondition.id, input.conditionId))
        .returning()
      const updated = priorityRows[0]
      if (!updated) throw new ActionError('INTERNAL', 'Falha ao atualizar prioridade')

      // INV-OFFER-02: toda mudança de priority/score registra em offer_condition_priority_history.
      await tx.insert(offerConditionPriorityHistory).values({
        offerConditionId: input.conditionId,
        fromPriority: current.priority,
        toPriority: input.priority,
        fromAdvantageScore: current.advantageScore,
        toAdvantageScore: String(input.advantageScore),
        changedByUserId: ctx.user.id,
        reason: input.reason ?? null,
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'offer_condition',
        resourceId: input.conditionId,
        before: { priority: current.priority, advantageScore: current.advantageScore },
        after: { priority: input.priority, advantageScore: input.advantageScore },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return updated
    })

    revalidatePath(`/offers/${result.offerId}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// REGRAS
// ---------------------------------------------------------------------------

/**
 * createRuleGroupAction — insere offer_condition_rule_group.
 * Guard: offer.write
 * INV-OFFER-05: índice parcial único no DB garante apenas 1 grupo raiz por condição.
 */
export async function createRuleGroupAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createRuleGroupSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      // Verificar que a condição existe
      const [condition] = await tx
        .select({ id: offerCondition.id, offerId: offerCondition.offerId })
        .from(offerCondition)
        .where(and(eq(offerCondition.id, input.offerConditionId), isNull(offerCondition.deletedAt)))
        .limit(1)

      if (!condition) {
        throw new ActionError('NOT_FOUND', `Condição ${input.offerConditionId} não encontrada`)
      }

      const groupRows = await tx
        .insert(offerConditionRuleGroup)
        .values({
          offerConditionId: input.offerConditionId,
          parentGroupId: input.parentGroupId ?? null,
          operator: input.operator,
        })
        .returning()
      const created = groupRows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao criar grupo de regras')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'offer_condition_rule_group',
        resourceId: created.id,
        after: created as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { ...created, offerId: condition.offerId }
    })

    revalidatePath(`/offers/${result.offerId}`)
    const { offerId: _offerId, ...ruleGroup } = result
    return ruleGroup
  })
}

/**
 * createRuleAction — insere offer_condition_rule.
 * Guard: offer.write
 * Chama validateRuleParams(kind, params) antes de persistir (BR-OFFER-ELIGIBILITY).
 */
export async function createRuleAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createRuleSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'global' })

    // BR-OFFER-ELIGIBILITY: validar params contra schema canônico do kind antes de persistir.
    try {
      validateRuleParams(input.kind, input.params)
    } catch (err) {
      if (err instanceof OfferRuleParamsError) {
        throw ruleParamsToActionError(err)
      }
      throw err
    }

    const result = await db.transaction(async (tx) => {
      // Verificar que o grupo existe e obter offerId para revalidação
      const [group] = await tx
        .select({
          id: offerConditionRuleGroup.id,
          offerConditionId: offerConditionRuleGroup.offerConditionId,
        })
        .from(offerConditionRuleGroup)
        .where(eq(offerConditionRuleGroup.id, input.ruleGroupId))
        .limit(1)

      if (!group) {
        throw new ActionError('NOT_FOUND', `Grupo de regras ${input.ruleGroupId} não encontrado`)
      }

      // Buscar offerId via condição
      const [condition] = await tx
        .select({ offerId: offerCondition.offerId })
        .from(offerCondition)
        .where(eq(offerCondition.id, group.offerConditionId))
        .limit(1)

      const ruleRows = await tx
        .insert(offerConditionRule)
        .values({
          ruleGroupId: input.ruleGroupId,
          kind: input.kind,
          params: input.params,
        })
        .returning()
      const created = ruleRows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao criar regra')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'offer_condition_rule',
        resourceId: created.id,
        after: { ...(created as Record<string, unknown>), kind: input.kind, params: input.params },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { ...created, offerId: condition?.offerId ?? null }
    })

    if (result.offerId) {
      revalidatePath(`/offers/${result.offerId}`)
    }

    const { offerId: _offerId, ...rule } = result
    return rule
  })
}

// ---------------------------------------------------------------------------
// ITENS
// ---------------------------------------------------------------------------

/**
 * addConditionItemAction — insere offer_condition_item.
 * Guard: offer.write
 * INV-OFFER-07: exclusividade product_id vs commercial_benefit_id validada aqui e no DB CHECK.
 */
export async function addConditionItemAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = addConditionItemSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'global' })

    // INV-OFFER-07: validação de exclusividade ref antes do INSERT.
    if (input.kind === 'commercial_benefit') {
      if (!input.commercialBenefitId) {
        throw new ActionError(
          'VALIDATION',
          'kind="commercial_benefit" exige commercialBenefitId',
          { rule: 'INV-OFFER-07' },
        )
      }
      if (input.productId) {
        throw new ActionError(
          'VALIDATION',
          'kind="commercial_benefit" não deve ter productId',
          { rule: 'INV-OFFER-07' },
        )
      }
    } else {
      if (!input.productId) {
        throw new ActionError(
          'VALIDATION',
          `kind="${input.kind}" exige productId`,
          { rule: 'INV-OFFER-07' },
        )
      }
      if (input.commercialBenefitId) {
        throw new ActionError(
          'VALIDATION',
          `kind="${input.kind}" não deve ter commercialBenefitId`,
          { rule: 'INV-OFFER-07' },
        )
      }
    }

    const result = await db.transaction(async (tx) => {
      // Verificar que a condição existe
      const [condition] = await tx
        .select({ id: offerCondition.id, offerId: offerCondition.offerId })
        .from(offerCondition)
        .where(
          and(eq(offerCondition.id, input.offerConditionId), isNull(offerCondition.deletedAt)),
        )
        .limit(1)

      if (!condition) {
        throw new ActionError('NOT_FOUND', `Condição ${input.offerConditionId} não encontrada`)
      }

      const itemRows = await tx
        .insert(offerConditionItem)
        .values({
          offerConditionId: input.offerConditionId,
          kind: input.kind,
          productId: input.productId ?? null,
          commercialBenefitId: input.commercialBenefitId ?? null,
          quantity: input.quantity,
          accessRule: input.accessRule,
          vigencyMonths: input.vigencyMonths ?? null,
          discount: input.discount != null ? String(input.discount) : null,
          responsibleUserId: input.responsibleUserId ?? null,
          orderIndex: input.orderIndex,
        })
        .returning()
      const created = itemRows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao adicionar item')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'offer_condition_item',
        resourceId: created.id,
        after: created as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { ...created, offerId: condition.offerId }
    })

    revalidatePath(`/offers/${result.offerId}`)
    const { offerId: _offerId, ...item } = result
    return item
  })
}

// ---------------------------------------------------------------------------
// PAYMENT OPTIONS
// ---------------------------------------------------------------------------

/**
 * addPaymentOptionAction — insere offer_payment_option.
 * Guard: offer.write
 * INV-OFFER-08: method='installments' exige installments > 1.
 */
export async function addPaymentOptionAction(rawInput: unknown) {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = addPaymentOptionSchema.parse(rawInput)

    await requirePermission(ctx, 'offer.write', { kind: 'global' })

    // INV-OFFER-08: guard app-side antes de bater no CHECK do banco.
    if (input.method === 'installments') {
      if (!input.installments || input.installments <= 1) {
        throw new ActionError(
          'VALIDATION',
          'method="installments" exige installments > 1',
          { rule: 'INV-OFFER-08' },
        )
      }
    } else {
      if (input.installments) {
        throw new ActionError(
          'VALIDATION',
          'Campo installments só é válido para method="installments"',
          { rule: 'INV-OFFER-08' },
        )
      }
    }

    const result = await db.transaction(async (tx) => {
      // Verificar que a condição existe
      const [condition] = await tx
        .select({ id: offerCondition.id, offerId: offerCondition.offerId })
        .from(offerCondition)
        .where(
          and(eq(offerCondition.id, input.offerConditionId), isNull(offerCondition.deletedAt)),
        )
        .limit(1)

      if (!condition) {
        throw new ActionError('NOT_FOUND', `Condição ${input.offerConditionId} não encontrada`)
      }

      const paymentRows = await tx
        .insert(offerPaymentOption)
        .values({
          offerConditionId: input.offerConditionId,
          method: input.method,
          price: String(input.price),
          installments: input.installments ?? null,
          customConfig: input.customConfig,
          isActive: input.isActive,
        })
        .returning()
      const created = paymentRows[0]
      if (!created) throw new ActionError('INTERNAL', 'Falha ao adicionar opção de pagamento')

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'offer_payment_option',
        resourceId: created.id,
        after: created as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { ...created, offerId: condition.offerId }
    })

    revalidatePath(`/offers/${result.offerId}`)
    const { offerId: _offerId, ...paymentOption } = result
    return paymentOption
  })
}
