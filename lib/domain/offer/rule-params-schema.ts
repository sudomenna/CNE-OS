/**
 * MOD-OFFER — Runtime validation of offer_condition_rule.params by kind.
 *
 * docs/20-domain/10-offer-engine.md §3.4.1
 * docs/30-contracts/01-enums.md §offer_rule_kind
 *
 * Every Server Action that creates or updates an offer_condition_rule MUST
 * call validateRuleParams(kind, params) before persisting.  The function
 * throws OfferRuleParamsError (a DomainError subtype) if params do not
 * conform to the canonical schema for the given kind.
 *
 * T-6-08
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Canonical channel values for the `channel` rule kind.
// Subset of offer_decision_channel enum (docs/30-contracts/01-enums.md);
// only the three channels that can be asserted in a rule.
// OQ-OFFER-03: channel_kind vs offer_decision_channel alignment pending.
// ---------------------------------------------------------------------------

const ruleChannelEnum = z.enum(['whatsapp', 'instagram', 'email'])

// ---------------------------------------------------------------------------
// Per-kind params schemas
// docs/20-domain/10-offer-engine.md §3.4.1
// ---------------------------------------------------------------------------

/**
 * date_range
 * { starts_at: ISO8601 date-string, ends_at: ISO8601 date-string }
 *
 * Spec uses start_at / end_at — confirmed as starts_at / ends_at in the
 * domain doc §3.4.1 canonical table (column heading uses both; using the
 * Zod schema names as the canonical TS form).
 *
 * Note: the spec table uses `start_at`/`end_at`; the Zod schema uses the
 * same names to stay aligned with the spec DDL.
 */
export const dateRangeParamsSchema = z.object({
  // ISO 8601 date string — e.g. "2025-06-01T00:00:00Z"
  start_at: z.string().datetime({ message: 'start_at deve ser ISO 8601' }),
  end_at: z.string().datetime({ message: 'end_at deve ser ISO 8601' }),
})
export type DateRangeParams = z.infer<typeof dateRangeParamsSchema>

/**
 * sales_count_reached
 * { max: positive integer }
 * Eligível se offer_sales_counter.approved_count < max.
 */
export const salesCountReachedParamsSchema = z.object({
  max: z
    .number()
    .int({ message: 'max deve ser inteiro' })
    .positive({ message: 'max deve ser positivo' }),
})
export type SalesCountReachedParams = z.infer<typeof salesCountReachedParamsSchema>

/**
 * campaign
 * { campaign_ids: uuid[] }
 * Eligível se ctx.campaignId ∈ campaign_ids.
 */
export const campaignParamsSchema = z.object({
  campaign_ids: z
    .array(z.string().uuid({ message: 'campaign_ids deve conter UUIDs válidos' }))
    .min(1, { message: 'campaign_ids deve ter ao menos 1 item' }),
})
export type CampaignParams = z.infer<typeof campaignParamsSchema>

/**
 * channel
 * { channels: channel_kind[] }
 * Eligível se ctx.channel ∈ channels.
 * channel_kind values: whatsapp | instagram | email (docs/30-contracts/01-enums.md).
 */
export const channelParamsSchema = z.object({
  channels: z
    .array(ruleChannelEnum)
    .min(1, { message: 'channels deve ter ao menos 1 item' }),
})
export type ChannelParams = z.infer<typeof channelParamsSchema>

/**
 * creative
 * { creative_ids: uuid[] }
 * Eligível se ctx.creativeId ∈ creative_ids.
 */
export const creativeParamsSchema = z.object({
  creative_ids: z
    .array(z.string().uuid({ message: 'creative_ids deve conter UUIDs válidos' }))
    .min(1, { message: 'creative_ids deve ter ao menos 1 item' }),
})
export type CreativeParams = z.infer<typeof creativeParamsSchema>

/**
 * internal_use
 * {} — no additional params.
 * Eligível se ctx.isInternal === true.
 */
export const internalUseParamsSchema = z.object({})
export type InternalUseParams = z.infer<typeof internalUseParamsSchema>

// ---------------------------------------------------------------------------
// Discriminated map  kind → schema
// ---------------------------------------------------------------------------

export const ruleParamsSchemaByKind = {
  date_range: dateRangeParamsSchema,
  sales_count_reached: salesCountReachedParamsSchema,
  campaign: campaignParamsSchema,
  channel: channelParamsSchema,
  creative: creativeParamsSchema,
  internal_use: internalUseParamsSchema,
} as const satisfies Record<string, z.ZodTypeAny>

export type OfferRuleKind = keyof typeof ruleParamsSchemaByKind

// ---------------------------------------------------------------------------
// Domain error
// ---------------------------------------------------------------------------

export class OfferRuleParamsError extends Error {
  readonly kind: string
  readonly issues: z.ZodIssue[]

  constructor(kind: string, issues: z.ZodIssue[]) {
    super(
      `params inválidos para regra kind="${kind}": ` +
        issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    )
    this.name = 'OfferRuleParamsError'
    this.kind = kind
    this.issues = issues
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * validateRuleParams — validates `params` against the canonical Zod schema
 * for the given rule `kind`.
 *
 * Throws OfferRuleParamsError if params are invalid.
 * Throws OfferRuleParamsError with a "kind desconhecido" message if the kind
 * is not listed in offer_rule_kind enum.
 *
 * Usage in Server Actions:
 *   validateRuleParams(kind, params)  // throws on invalid
 *   await db.insert(offerConditionRule).values({ ruleGroupId, kind, params })
 *
 * docs/20-domain/10-offer-engine.md §3.4.1
 */
export function validateRuleParams(kind: string, params: unknown): void {
  const schema = ruleParamsSchemaByKind[kind as OfferRuleKind]

  if (!schema) {
    // BR-OFFER-ELIGIBILITY: unknown kind is a programming error, not user input error.
    // Treat it as a validation failure so callers can handle uniformly.
    throw new OfferRuleParamsError(kind, [
      {
        code: 'custom',
        message: `kind desconhecido: "${kind}". Valores válidos: ${Object.keys(ruleParamsSchemaByKind).join(', ')}`,
        path: ['kind'],
      },
    ])
  }

  const result = schema.safeParse(params)

  if (!result.success) {
    throw new OfferRuleParamsError(kind, result.error.issues)
  }
}
