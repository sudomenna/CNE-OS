'use server'

/**
 * MOD-FUNNEL — Server Actions: CRUD de funil + movimentação de oportunidades
 *
 * Spec: docs/20-domain/08-funnel-opportunity.md §2
 * Contrato: docs/30-contracts/05-api-server-actions.md
 * RBAC: docs/50-business-rules/BR-RBAC.md
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { funnel, funnelEntry, funnelStage } from '@/lib/db/schema/funnel'
import type { Funnel, FunnelStage } from '@/lib/db/schema/funnel'
import { contact, contactEmail, contactPhone } from '@/lib/db/schema/contact'
import { userAccount } from '@/lib/db/schema/organization'
import { campaign, creative } from '@/lib/db/schema/campaign'
import { timelineEvent } from '@/lib/db/schema/timeline'
import {
  enterFunnel,
  moveStage,
  setOpportunityLabel,
  markWon,
  markLost,
} from '@/lib/domain/funnel'
import type { FunnelOpportunityLabel, EnterFunnelResult } from '@/lib/domain/funnel'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { logAudit } from '@/lib/audit/log'
import { toActionResult } from '@/lib/actions/result'
import type { ActionResult } from '@/lib/actions/result'
import { ActionError } from '@/lib/actions/errors'

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const createFunnelSchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  name: z.string().min(2, 'Nome do funil deve ter pelo menos 2 caracteres').max(200),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  offerId: z.string().uuid('offerId deve ser UUID').nullable().optional(),
  // Estágios iniciais opcionais — ao menos 1 é criado automaticamente se ausente
  initialStages: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        position: z.number().int().nonnegative(),
        isTerminal: z.boolean().default(false),
      }),
    )
    .min(1, 'Forneça pelo menos 1 estágio inicial')
    .optional(),
})

const createFunnelStageSchema = z.object({
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  name: z.string().min(1, 'Nome do estágio é obrigatório').max(200),
  position: z.number().int().nonnegative('Posição deve ser inteiro não-negativo'),
  isTerminal: z.boolean().default(false),
})

const enterFunnelSchema = z.object({
  contactId: z.string().uuid('contactId deve ser UUID'),
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  initialStageId: z.string().uuid().nullable().optional(),
  entryCampaignId: z.string().uuid().nullable().optional(),
  entryCreativeId: z.string().uuid().nullable().optional(),
  entryOrigin: z.string().max(100).nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
})

const moveStageSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  toStageId: z.string().uuid('toStageId deve ser UUID'),
  reason: z.string().max(500).optional(),
})

const setOpportunityLabelSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  label: z.enum(['open', 'negotiating', 'concluded', 'won', 'lost', 'reopened']),
})

const markWonSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  /**
   * UUID da transação aprovada — obrigatório quando isManual=false (INV-FUNNEL-05).
   * Opcional quando isManual=true (OQ-FB-01: Fase 1 aceita venda manual sem transaction_id).
   */
  transactionId: z.string().uuid('transactionId deve ser UUID').optional(),
  /**
   * Quando true: operador confirma ganho sem transação vinculada (venda manual).
   * OQ-FB-01: criação de transação inline adiada para Fase 2.
   */
  isManual: z.boolean().default(false),
  conversionOrigin: z.string().max(100).nullable().optional(),
  conversionCampaignId: z.string().uuid().nullable().optional(),
  conversionCreativeId: z.string().uuid().nullable().optional(),
})

const markLostSchema = z.object({
  entryId: z.string().uuid('entryId deve ser UUID'),
  reason: z.string().min(3, 'Motivo da perda deve ter pelo menos 3 caracteres').max(1000),
})

// ---------------------------------------------------------------------------
// createFunnelAction — T-12-21: Dialog "Criar funil"
// Aceita { name, brandId, stages: string[] }, gera slug automaticamente.
// Retorna { funnelId: string } para redirect pós-criação.
// ---------------------------------------------------------------------------

// Schema do Dialog "Criar funil" — slug auto-gerado
const createFunnelDialogSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres').max(200),
  brandId: z.string().uuid('brandId deve ser UUID'),
  stages: z
    .array(z.string().min(1, 'Nome do estágio é obrigatório'))
    .min(1, 'Mínimo 1 estágio obrigatório'),
})

/**
 * Cria um funil com estágios definidos pelo usuário via Dialog.
 * Slug é gerado automaticamente a partir do nome (+ sufixo numérico em caso de conflito).
 * Guard: funnel.write
 */
export async function createFunnelAction(
  rawInput: unknown,
): Promise<ReturnType<typeof toActionResult<{ funnelId: string }>>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createFunnelDialogSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.write', { kind: 'global' })

    // Gera slug a partir do nome (normaliza acentos e caracteres especiais)
    const baseSlug = input.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const result = await db.transaction(async (tx) => {
      // Garante unicidade de slug por marca com sufixo numérico
      let slug = baseSlug
      let attempt = 0
      while (true) {
        const existing = await tx
          .select({ id: funnel.id })
          .from(funnel)
          .where(and(eq(funnel.slug, slug), eq(funnel.brandId, input.brandId)))
          .limit(1)
        if (existing.length === 0) break
        attempt++
        slug = `${baseSlug}-${attempt}`
      }

      const [newFunnel] = await tx
        .insert(funnel)
        .values({
          brandId: input.brandId,
          name: input.name,
          slug,
          isActive: true,
        })
        .returning()

      if (!newFunnel) {
        throw new ActionError('INTERNAL', 'createFunnel: INSERT retornou vazio')
      }

      await tx.insert(funnelStage).values(
        input.stages.map((stageName, position) => ({
          funnelId: newFunnel.id,
          name: stageName,
          position,
          isTerminal: false,
        })),
      )

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'funnel',
        resourceId: newFunnel.id,
        after: {
          id: newFunnel.id,
          name: newFunnel.name,
          slug: newFunnel.slug,
          brandId: newFunnel.brandId,
          stageCount: input.stages.length,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { funnelId: newFunnel.id }
    })

    revalidatePath('/funnels')
    return result
  })
}

// ---------------------------------------------------------------------------
// createFunnelFullAction — uso programático (ex: seed, automações)
// Aceita name, slug explícito, brandId, offerId?, initialStages?
// ---------------------------------------------------------------------------

/**
 * Cria um funil com controle total sobre slug e estágios.
 * Guard: funnel.create
 */
export async function createFunnelFullAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<{ funnel: Funnel; stages: FunnelStage[] }>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createFunnelSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.create', { kind: 'global' })

    const result = await db.transaction(async (tx) => {
      const [newFunnel] = await tx
        .insert(funnel)
        .values({
          brandId: input.brandId,
          name: input.name,
          slug: input.slug,
          offerId: input.offerId ?? null,
          isActive: true,
        })
        .returning()

      if (!newFunnel) {
        throw new ActionError('INTERNAL', 'createFunnelFull: INSERT retornou vazio')
      }

      const stagesToCreate = input.initialStages ?? [
        { name: 'Novo', position: 0, isTerminal: false },
        { name: 'Em andamento', position: 1, isTerminal: false },
        { name: 'Concluído', position: 2, isTerminal: true },
      ]

      const newStages = await tx
        .insert(funnelStage)
        .values(
          stagesToCreate.map((s) => ({
            funnelId: newFunnel.id,
            name: s.name,
            position: s.position,
            isTerminal: s.isTerminal,
          })),
        )
        .returning()

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'funnel',
        resourceId: newFunnel.id,
        after: { id: newFunnel.id, name: newFunnel.name, slug: newFunnel.slug, brandId: newFunnel.brandId },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return { funnel: newFunnel, stages: newStages }
    })

    revalidatePath('/funnels')
    return result
  })
}

// ---------------------------------------------------------------------------
// createFunnelStageAction
// ---------------------------------------------------------------------------

/**
 * Adiciona um estágio a um funil existente.
 * Guard: funnel.create
 */
export async function createFunnelStageAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<FunnelStage>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = createFunnelStageSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.create', { kind: 'funnel', id: input.funnelId })

    const result = await db.transaction(async (tx) => {
      const [newStage] = await tx
        .insert(funnelStage)
        .values({
          funnelId: input.funnelId,
          name: input.name,
          position: input.position,
          isTerminal: input.isTerminal,
        })
        .returning()

      if (!newStage) {
        throw new ActionError('INTERNAL', 'createFunnelStage: INSERT retornou vazio')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'funnel_stage',
        resourceId: newStage.id,
        after: { id: newStage.id, funnelId: newStage.funnelId, name: newStage.name, position: newStage.position },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return newStage
    })

    revalidatePath(`/funnels/${input.funnelId}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// enterFunnelAction
// ---------------------------------------------------------------------------

/**
 * Entra um contato no funil (idempotente — retorna entrada existente se já ativa).
 * Guard: funnel.manage
 */
export async function enterFunnelAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<EnterFunnelResult>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = enterFunnelSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.manage', { kind: 'funnel', id: input.funnelId })

    const result = await db.transaction(async (tx) => {
      const entryResult = await enterFunnel(tx, {
        contactId: input.contactId,
        funnelId: input.funnelId,
        initialStageId: input.initialStageId ?? null,
        entryCampaignId: input.entryCampaignId ?? null,
        entryCreativeId: input.entryCreativeId ?? null,
        entryOrigin: input.entryOrigin ?? null,
        ownerUserId: input.ownerUserId ?? null,
        actorUserId: ctx.user.id,
      })

      if (entryResult.created) {
        await logAudit(tx, {
          actorUserId: ctx.user.id,
          actionKind: 'create',
          resourceKind: 'funnel_entry',
          resourceId: entryResult.entry.id,
          after: {
            id: entryResult.entry.id,
            funnelId: input.funnelId,
            contactId: input.contactId,
          },
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          context: { correlationId: ctx.correlationId },
        })
      }

      return entryResult
    })

    revalidatePath(`/funnels/${input.funnelId}`)
    return result
  })
}

// ---------------------------------------------------------------------------
// moveStageAction
// ---------------------------------------------------------------------------

/**
 * Move uma oportunidade para outro estágio (drag-drop no kanban).
 * Guard: funnel.manage
 *
 * // BR-FUNNEL-OPPORTUNITY: drag-drop usa SELECT FOR UPDATE via tx
 * O domínio moveStage carrega a entry dentro da mesma transação, garantindo
 * lock pessimista sobre a linha quando o DB usa READ COMMITTED com FOR UPDATE.
 */
export async function moveStageAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = moveStageSchema.parse(rawInput)

    // Guard aplicado antes da transação para falhar cedo (BR-RBAC)
    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    await db.transaction(async (tx) => {
      // BR-FUNNEL-OPPORTUNITY: drag-drop usa SELECT FOR UPDATE via tx
      // moveStage executa SELECT da entry dentro da mesma transação SQL,
      // garantindo consistência de leitura e prevenindo atualização concorrente
      // de current_stage_id sem lock explícito.
      await moveStage(tx, input.entryId, input.toStageId, input.reason)

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: { to_stage_id: input.toStageId, reason: input.reason ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })
    })

    // Revalidação ampla — entry pertence a algum funil (ID não disponível sem query extra)
    revalidatePath('/funnels', 'layout')
  })
}

// ---------------------------------------------------------------------------
// setOpportunityLabelAction
// ---------------------------------------------------------------------------

/**
 * Altera a etiqueta macro de uma oportunidade.
 * Guard: funnel.manage
 */
export async function setOpportunityLabelAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = setOpportunityLabelSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    await db.transaction(async (tx) => {
      await setOpportunityLabel(tx, {
        entryId: input.entryId,
        label: input.label as FunnelOpportunityLabel,
        actorUserId: ctx.user.id,
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: { label: input.label },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })
    })

    revalidatePath('/funnels', 'layout')
  })
}

// ---------------------------------------------------------------------------
// markWonAction
// ---------------------------------------------------------------------------

/**
 * Marca uma oportunidade como ganha.
 * Guard: funnel.close
 *
 * Dois caminhos:
 * - isManual=false + transactionId UUID: delega para domínio markWon (INV-FUNNEL-05).
 * - isManual=true: UPDATE direto sem transaction_id vinculado (OQ-FB-01: Fase 1).
 *   A transação poderá ser vinculada posteriormente em Fase 2.
 */
export async function markWonAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = markWonSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.close', { kind: 'global' })

    // Quando isManual=false exigimos transactionId (INV-FUNNEL-05)
    if (!input.isManual && !input.transactionId) {
      throw new ActionError('VALIDATION', 'transactionId é obrigatório quando isManual=false')
    }

    await db.transaction(async (tx) => {
      if (input.transactionId) {
        // Caminho padrão: delega ao domínio (valida idempotência + emite timeline)
        await markWon(tx, {
          entryId: input.entryId,
          transactionId: input.transactionId,
          conversionOrigin: input.conversionOrigin ?? null,
          conversionCampaignId: input.conversionCampaignId ?? null,
          conversionCreativeId: input.conversionCreativeId ?? null,
          actorUserId: ctx.user.id,
        })
      } else {
        // OQ-FB-01: venda manual sem transaction_id — UPDATE direto.
        // Fase 2 adicionará criação de transação inline + emissão de TE-OPPORTUNITY-WON.
        // NOTA: opportunityWonSchema exige transaction_id UUID — timeline omitida aqui
        //       até o schema ser atualizado para aceitar isManual=true (fora do ownership UI).
        const entryRows = await tx
          .select()
          .from(funnelEntry)
          .where(eq(funnelEntry.id, input.entryId))
        const entry = entryRows[0]
        if (!entry) {
          throw new ActionError('NOT_FOUND', `funnel_entry ${input.entryId} não encontrada`)
        }
        if (entry.label === 'won' || entry.label === 'lost') {
          throw new ActionError(
            'VALIDATION',
            `funnel_entry ${input.entryId} já está em estado terminal (${entry.label})`,
          )
        }
        await tx
          .update(funnelEntry)
          .set({ label: 'won', updatedAt: sql`now()` })
          .where(eq(funnelEntry.id, input.entryId))
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: {
          label: 'won',
          transaction_id: input.transactionId ?? null,
          is_manual: input.isManual,
          conversion_origin: input.conversionOrigin ?? null,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, rule: 'BR-FUNNEL-OPPORTUNITY' },
      })
    })

    revalidatePath('/funnels', 'layout')
  })
}

// ---------------------------------------------------------------------------
// markLostAction
// ---------------------------------------------------------------------------

/**
 * Marca uma oportunidade como perdida.
 * Guard: funnel.close
 * INV-FUNNEL-05: exige reason não-vazia.
 */
export async function markLostAction(rawInput: unknown): Promise<
  ReturnType<typeof toActionResult<void>>
> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = markLostSchema.parse(rawInput)

    await requirePermission(ctx, 'funnel.close', { kind: 'global' })

    await db.transaction(async (tx) => {
      await markLost(tx, {
        entryId: input.entryId,
        reason: input.reason,
        actorUserId: ctx.user.id,
      })

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.entryId,
        after: { label: 'lost', lost_reason: input.reason },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId, rule: 'BR-FUNNEL-OPPORTUNITY' },
      })
    })

    revalidatePath('/funnels', 'layout')
  })
}

// ---------------------------------------------------------------------------
// listFunnelEntriesAction  (T-12-20)
// ---------------------------------------------------------------------------

export type FunnelEntryListItem = {
  id: string
  contactId: string
  contactName: string
  currentStageId: string
  stageName: string
  ownerUserId: string | null
  ownerName: string | null
  label: string
  score: string
  entryDate: Date
}

const listFunnelEntriesSchema = z.object({
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  assignee: z.string().uuid().nullable().optional(),
  dateFrom: z.string().nullable().optional(),
  dateTo: z.string().nullable().optional(),
})

/**
 * Lista entries de um funil com filtros opcionais de assignee e período.
 * Retorna dados suficientes para a list view (tabela alternativa ao kanban).
 * Guard: funnel.manage
 */
export async function listFunnelEntriesAction(
  rawInput: unknown,
): Promise<ActionResult<FunnelEntryListItem[]>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = listFunnelEntriesSchema.parse(rawInput)
    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    const conditions = [eq(funnelEntry.funnelId, input.funnelId)]

    if (input.assignee) {
      conditions.push(eq(funnelEntry.ownerUserId, input.assignee))
    }
    if (input.dateFrom) {
      conditions.push(sql`${funnelEntry.entryDate} >= ${input.dateFrom}::timestamptz`)
    }
    if (input.dateTo) {
      conditions.push(sql`${funnelEntry.entryDate} <= ${input.dateTo}::timestamptz`)
    }

    const rows = await db
      .select({
        id: funnelEntry.id,
        contactId: funnelEntry.contactId,
        contactName: contact.fullName,
        currentStageId: funnelEntry.currentStageId,
        stageName: funnelStage.name,
        ownerUserId: funnelEntry.ownerUserId,
        ownerName: userAccount.fullName,
        label: funnelEntry.label,
        score: funnelEntry.score,
        entryDate: funnelEntry.entryDate,
      })
      .from(funnelEntry)
      .innerJoin(contact, eq(contact.id, funnelEntry.contactId))
      .innerJoin(funnelStage, eq(funnelStage.id, funnelEntry.currentStageId))
      .leftJoin(userAccount, eq(userAccount.id, funnelEntry.ownerUserId))
      .where(and(...conditions))
      .orderBy(desc(funnelEntry.entryDate))
      .limit(500)

    return rows.map((r) => ({
      id: r.id,
      contactId: r.contactId,
      contactName: r.contactName ?? 'Contato sem nome',
      currentStageId: r.currentStageId,
      stageName: r.stageName,
      ownerUserId: r.ownerUserId,
      ownerName: r.ownerName,
      label: r.label,
      score: r.score,
      entryDate: r.entryDate,
    })) satisfies FunnelEntryListItem[]
  })
}

// ---------------------------------------------------------------------------
// getEntryDetailsAction  (T-12-18)
// ---------------------------------------------------------------------------

export type EntryDetails = {
  entry: {
    id: string
    funnelId: string
    contactId: string
    currentStageId: string
    label: string
    score: string
    entryDate: Date
    entryOrigin: string | null
    entryCampaignId: string | null
    entryCreativeId: string | null
    ownerUserId: string | null
    lostReason: string | null
  }
  contact: {
    id: string
    fullName: string
    classification: string
    primaryEmail: string | null
    primaryPhone: string | null
  }
  owner: { id: string; fullName: string; email: string } | null
  campaignName: string | null
  creativeName: string | null
}

const getEntryDetailsSchema = z.object({
  entryId: z.string().uuid(),
})

export async function getEntryDetailsAction(
  rawInput: unknown,
): Promise<ActionResult<EntryDetails>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = getEntryDetailsSchema.parse(rawInput)
    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    const entry = await db.query.funnelEntry.findFirst({
      where: eq(funnelEntry.id, input.entryId),
    })
    if (!entry) throw new ActionError('NOT_FOUND', 'Entry nao encontrado')

    const contactRow = await db.query.contact.findFirst({
      where: eq(contact.id, entry.contactId),
    })
    if (!contactRow) throw new ActionError('NOT_FOUND', 'Contact nao encontrado')

    const emailRow = await db.query.contactEmail.findFirst({
      where: eq(contactEmail.contactId, entry.contactId),
      orderBy: (t) => [desc(t.createdAt)],
    })
    const phoneRow = await db.query.contactPhone.findFirst({
      where: eq(contactPhone.contactId, entry.contactId),
      orderBy: (t) => [desc(t.createdAt)],
    })

    let ownerRow: { id: string; fullName: string; email: string } | null = null
    if (entry.ownerUserId) {
      const ua = await db.query.userAccount.findFirst({
        where: eq(userAccount.id, entry.ownerUserId),
      })
      if (ua) ownerRow = { id: ua.id, fullName: ua.fullName, email: ua.email }
    }

    let campaignName: string | null = null
    if (entry.entryCampaignId) {
      const camp = await db.query.campaign.findFirst({
        where: eq(campaign.id, entry.entryCampaignId),
      })
      campaignName = camp?.name ?? null
    }

    let creativeName: string | null = null
    if (entry.entryCreativeId) {
      const creat = await db.query.creative.findFirst({
        where: eq(creative.id, entry.entryCreativeId),
      })
      creativeName = creat?.name ?? null
    }

    return {
      entry: {
        id: entry.id,
        funnelId: entry.funnelId,
        contactId: entry.contactId,
        currentStageId: entry.currentStageId,
        label: entry.label,
        score: entry.score,
        entryDate: entry.entryDate,
        entryOrigin: entry.entryOrigin,
        entryCampaignId: entry.entryCampaignId,
        entryCreativeId: entry.entryCreativeId,
        ownerUserId: entry.ownerUserId,
        lostReason: entry.lostReason,
      },
      contact: {
        id: contactRow.id,
        fullName: contactRow.fullName,
        classification: contactRow.classification,
        primaryEmail: emailRow?.email ?? null,
        primaryPhone: phoneRow?.e164 ?? null,
      },
      owner: ownerRow,
      campaignName,
      creativeName,
    } satisfies EntryDetails
  })
}

// ---------------------------------------------------------------------------
// getEntryTimelineAction  (T-12-18)
// ---------------------------------------------------------------------------

export type EntryTimelineEvent = {
  id: string
  kind: string
  source: string
  actorName: string | null
  actorSystem: string | null
  occurredAt: Date
  payload: Record<string, unknown>
}

const getEntryTimelineSchema = z.object({
  entryId: z.string().uuid(),
})

export async function getEntryTimelineAction(
  rawInput: unknown,
): Promise<ActionResult<EntryTimelineEvent[]>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = getEntryTimelineSchema.parse(rawInput)
    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    const rows = await db
      .select({
        id: timelineEvent.id,
        kind: timelineEvent.kind,
        source: timelineEvent.source,
        actorName: userAccount.fullName,
        actorSystem: timelineEvent.actorSystem,
        occurredAt: timelineEvent.occurredAt,
        payload: timelineEvent.payload,
      })
      .from(timelineEvent)
      .leftJoin(userAccount, eq(timelineEvent.actorUserId, userAccount.id))
      .where(eq(timelineEvent.subjectId, input.entryId))
      .orderBy(desc(timelineEvent.occurredAt))
      .limit(100)

    return rows as EntryTimelineEvent[]
  })
}

// ---------------------------------------------------------------------------
// updateEntryAction  (T-12-18)
// ---------------------------------------------------------------------------

const updateEntrySchema = z.object({
  id: z.string().uuid(),
  ownerUserId: z.string().uuid().nullable().optional(),
})

export async function updateEntryAction(
  rawInput: unknown,
): Promise<ReturnType<typeof toActionResult<void>>> {
  return toActionResult(async () => {
    const ctx = await requireSession()
    const input = updateEntrySchema.parse(rawInput)
    await requirePermission(ctx, 'funnel.manage', { kind: 'global' })

    await db.transaction(async (tx) => {
      await tx
        .update(funnelEntry)
        .set({
          ...(input.ownerUserId !== undefined ? { ownerUserId: input.ownerUserId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(funnelEntry.id, input.id))

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'update',
        resourceKind: 'funnel_entry',
        resourceId: input.id,
        after: { owner_user_id: input.ownerUserId ?? null },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })
    })

    revalidatePath('/funnels', 'layout')
  })
}
