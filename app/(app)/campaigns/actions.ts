'use server'

/**
 * MOD-CAMPAIGN — Server Actions
 * T-5-04: createCampaign, createCreative, issueTrackableLink
 *
 * Spec: docs/20-domain/07-campaign-creative.md §2
 * Contracts: docs/30-contracts/05-api-server-actions.md
 * RBAC: docs/50-business-rules/BR-RBAC.md
 */

import { randomBytes } from 'crypto'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db/client'
import { campaign, creative, trackableLink } from '@/lib/db/schema/campaign'
import { requireSession } from '@/lib/auth/session'
import { requirePermission } from '@/lib/auth/permissions'
import { toActionResult, ActionError } from '@/lib/actions/result'
import { logAudit } from '@/lib/audit/log'
import { generateUtm } from '@/lib/domain/campaign/generate-utm'
import type { ActionResult } from '@/lib/actions/result'
import type { Campaign, Creative, TrackableLink } from '@/lib/db/schema/campaign'

// ---------------------------------------------------------------------------
// Schemas de validação Zod
// ---------------------------------------------------------------------------

const createCampaignSchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  funnelId: z.string().uuid('funnelId deve ser UUID'),
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  slug: z
    .string()
    .min(1, 'Slug é obrigatório')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  startsAt: z.string().datetime().nullable().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional().default(true),
})

const createCreativeSchema = z.object({
  campaignId: z.string().uuid('campaignId deve ser UUID'),
  name: z.string().min(1, 'Nome é obrigatório').max(255),
  slug: z
    .string()
    .min(1, 'Slug é obrigatório')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  channel: z.string().max(100).nullable().optional(),
})

const issueTrackableLinkSchema = z.object({
  brandId: z.string().uuid('brandId deve ser UUID'),
  campaignId: z.string().uuid('campaignId deve ser UUID'),
  destinationUrl: z.string().url('URL de destino inválida'),
  // Campos opcionais para geração de UTMs enriquecidas
  creativeId: z.string().uuid().nullable().optional(),
  funnelId: z.string().uuid().nullable().optional(),
  // Contexto para generateUtm (slugs das entidades relacionadas)
  brandSlug: z.string().min(1, 'brandSlug é obrigatório'),
  campaignSlug: z.string().min(1, 'campaignSlug é obrigatório'),
  creativeSlug: z.string().nullable().optional(),
  creativeChannel: z.string().nullable().optional(),
  funnelSlug: z.string().nullable().optional(),
  mediumOverride: z.string().nullable().optional(),
})

// ---------------------------------------------------------------------------
// Helper: gerar slug único para trackable_link (INV-CAMPAIGN-03)
// ---------------------------------------------------------------------------

function generateUniqueSlug(): string {
  // 8 bytes = 16 hex chars; entropia suficiente para evitar colisão no encurtador
  return randomBytes(8).toString('hex')
}

// ---------------------------------------------------------------------------
// createCampaign
// Guard: campaign.write (admin, marketing, commercial) — BR-RBAC
// ---------------------------------------------------------------------------

export async function createCampaign(
  rawInput: unknown,
): Promise<ActionResult<Campaign>> {
  return toActionResult(async () => {
    // 1. Sessão
    const ctx = await requireSession()

    // 2. Validar input
    const input = createCampaignSchema.parse(rawInput)

    // 3. Guard RBAC: campaign.write
    // BR-RBAC: admin, marketing, commercial podem criar campanhas
    await requirePermission(ctx, 'campaign.write', { kind: 'campaign', id: input.brandId })

    // 4. Transação: insert + audit
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(campaign)
        .values({
          brandId: input.brandId,
          funnelId: input.funnelId,
          name: input.name,
          slug: input.slug,
          startsAt: input.startsAt ? new Date(input.startsAt) : null,
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          isActive: input.isActive ?? true,
        })
        .returning()

      if (!created) {
        throw new ActionError('INTERNAL', 'Falha ao inserir campanha')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'campaign',
        resourceId: created.id,
        after: created as unknown as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created
    })

    // 5. Revalidar caches
    revalidatePath('/campaigns')

    return result
  })
}

// ---------------------------------------------------------------------------
// createCreative
// Guard: creative.write (admin, marketing) — BR-RBAC
// ---------------------------------------------------------------------------

export async function createCreative(
  rawInput: unknown,
): Promise<ActionResult<Creative>> {
  return toActionResult(async () => {
    // 1. Sessão
    const ctx = await requireSession()

    // 2. Validar input
    const input = createCreativeSchema.parse(rawInput)

    // 3. Guard RBAC: creative.write
    // BR-RBAC: apenas admin e marketing podem criar criativos
    await requirePermission(ctx, 'creative.write', { kind: 'campaign', id: input.campaignId })

    // 4. Transação: insert + audit
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(creative)
        .values({
          campaignId: input.campaignId,
          name: input.name,
          slug: input.slug,
          channel: input.channel ?? null,
        })
        .returning()

      if (!created) {
        throw new ActionError('INTERNAL', 'Falha ao inserir criativo')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'creative',
        resourceId: created.id,
        after: created as unknown as Record<string, unknown>,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created
    })

    // 5. Revalidar caches
    revalidatePath(`/campaigns`)

    return result
  })
}

// ---------------------------------------------------------------------------
// issueTrackableLink
// Guard: campaign.write (admin, marketing, commercial) — BR-RBAC
// INV-CAMPAIGN-03: slug globalmente único
// INV-CAMPAIGN-04: UTMs deterministas via generateUtm
// ---------------------------------------------------------------------------

export async function issueTrackableLink(
  rawInput: unknown,
): Promise<ActionResult<TrackableLink>> {
  return toActionResult(async () => {
    // 1. Sessão
    const ctx = await requireSession()

    // 2. Validar input
    const input = issueTrackableLinkSchema.parse(rawInput)

    // 3. Guard RBAC: campaign.write
    // BR-RBAC: admin, marketing, commercial podem emitir trackable links
    await requirePermission(ctx, 'campaign.write', { kind: 'campaign', id: input.campaignId })

    // 4. Gerar slug único (INV-CAMPAIGN-03)
    const slug = generateUniqueSlug()

    // 5. Calcular UTM snapshot (INV-CAMPAIGN-04: determinista via generateUtm)
    const creativeCtx: { slug: string; channel?: string } | undefined =
      input.creativeSlug
        ? {
            slug: input.creativeSlug,
            ...(input.creativeChannel ? { channel: input.creativeChannel } : {}),
          }
        : undefined

    const utmSnapshot = generateUtm({
      brand: { slug: input.brandSlug },
      campaign: { slug: input.campaignSlug },
      ...(creativeCtx ? { creative: creativeCtx } : {}),
      ...(input.funnelSlug ? { funnel: { slug: input.funnelSlug } } : {}),
      ...(input.mediumOverride ? { mediumOverride: input.mediumOverride } : {}),
    })

    // 6. Transação: insert + audit
    const result = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(trackableLink)
        .values({
          brandId: input.brandId,
          funnelId: input.funnelId ?? null,
          campaignId: input.campaignId,
          creativeId: input.creativeId ?? null,
          destinationUrl: input.destinationUrl,
          slug,
          // INV-CAMPAIGN-04: utm_snapshot persiste o resultado determinista de generateUtm como jsonb
          utm: utmSnapshot,
        })
        .returning()

      if (!created) {
        throw new ActionError('INTERNAL', 'Falha ao criar trackable link')
      }

      await logAudit(tx, {
        actorUserId: ctx.user.id,
        actionKind: 'create',
        resourceKind: 'trackable_link',
        resourceId: created.id,
        after: {
          ...(created as unknown as Record<string, unknown>),
          utm_snapshot: utmSnapshot,
        },
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        context: { correlationId: ctx.correlationId },
      })

      return created
    })

    // 7. Revalidar caches
    revalidatePath('/campaigns')

    return result
  })
}
