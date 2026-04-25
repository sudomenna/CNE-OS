/**
 * MOD-OFFER — Pure eligibility evaluator
 *
 * Implements BR-OFFER-ELIGIBILITY: evaluates a RuleGroup tree (AND/OR with
 * arbitrary nesting) against a DecisionContext without any I/O.
 *
 * The DB-backed wrapper `evaluateEligibility(conditionId, ctx)` lives in
 * `index.ts` and calls `evaluateRuleGroup` after loading the tree from DB.
 *
 * T-6-13
 * docs/20-domain/10-offer-engine.md §11
 * docs/50-business-rules/BR-OFFER-ELIGIBILITY.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Context supplied by the caller (Server Action / selectCondition).
 * `salesCount` holds the current value of offer_sales_counter.approved_count
 * and must be read by the caller before invoking this function.
 *
 * docs/20-domain/10-offer-engine.md §2 (DecisionContext)
 */
export type EligibilityContext = {
  now: Date
  contactId: string
  campaignId?: string
  creativeId?: string
  /** offer_decision_channel subset that can appear in a rule */
  channel?: 'whatsapp' | 'instagram' | 'email'
  /** Current value of offer_sales_counter.approved_count for this offer */
  salesCount?: number
  /** true when the call comes from the internal commercial team */
  isInternalUse?: boolean
}

/** Atomic rule inside a group. */
export type Rule = {
  id: string
  kind:
    | 'date_range'
    | 'sales_count_reached'
    | 'campaign'
    | 'channel'
    | 'creative'
    | 'internal_use'
  params: unknown
}

/** Logical group — may contain atomic rules AND/OR child groups (nesting). */
export type RuleGroup = {
  id: string
  operator: 'and' | 'or'
  rules: Rule[]
  children: RuleGroup[]
}

// ---------------------------------------------------------------------------
// Params type guards (narrow `unknown` after Zod validation at write time)
// ---------------------------------------------------------------------------

type DateRangeParams = { start_at: string; end_at: string }
type SalesCountReachedParams = { max: number }
type CampaignParams = { campaign_ids: string[] }
type ChannelParams = { channels: string[] }
type CreativeParams = { creative_ids: string[] }

function isDateRangeParams(p: unknown): p is DateRangeParams {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as DateRangeParams).start_at === 'string' &&
    typeof (p as DateRangeParams).end_at === 'string'
  )
}

function isSalesCountReachedParams(p: unknown): p is SalesCountReachedParams {
  return (
    typeof p === 'object' &&
    p !== null &&
    typeof (p as SalesCountReachedParams).max === 'number'
  )
}

function isCampaignParams(p: unknown): p is CampaignParams {
  return (
    typeof p === 'object' &&
    p !== null &&
    Array.isArray((p as CampaignParams).campaign_ids)
  )
}

function isChannelParams(p: unknown): p is ChannelParams {
  return (
    typeof p === 'object' &&
    p !== null &&
    Array.isArray((p as ChannelParams).channels)
  )
}

function isCreativeParams(p: unknown): p is CreativeParams {
  return (
    typeof p === 'object' &&
    p !== null &&
    Array.isArray((p as CreativeParams).creative_ids)
  )
}

// ---------------------------------------------------------------------------
// Atomic rule evaluator
// ---------------------------------------------------------------------------

/**
 * evaluateRule — evaluates a single atomic rule against the context.
 *
 * BR-OFFER-ELIGIBILITY: each kind has its own eligibility condition:
 *   date_range      → start_at <= ctx.now < end_at  (start inclusive, end exclusive)
 *   sales_count_reached → ctx.salesCount < max
 *   campaign        → ctx.campaignId ∈ campaign_ids
 *   channel         → ctx.channel ∈ channels
 *   creative        → ctx.creativeId ∈ creative_ids
 *   internal_use    → ctx.isInternalUse === true
 */
export function evaluateRule(rule: Rule, ctx: EligibilityContext): boolean {
  switch (rule.kind) {
    case 'date_range': {
      // BR-OFFER-ELIGIBILITY: start_at inclusive, end_at exclusive
      if (!isDateRangeParams(rule.params)) return false
      const startAt = new Date(rule.params.start_at)
      const endAt = new Date(rule.params.end_at)
      return ctx.now >= startAt && ctx.now < endAt
    }

    case 'sales_count_reached': {
      // BR-OFFER-ELIGIBILITY: eligible while approved_count < max
      if (!isSalesCountReachedParams(rule.params)) return false
      const count = ctx.salesCount ?? 0
      return count < rule.params.max
    }

    case 'campaign': {
      // BR-OFFER-ELIGIBILITY: eligible if ctx.campaignId is in the allowed list
      if (!isCampaignParams(rule.params)) return false
      if (ctx.campaignId === undefined) return false
      return rule.params.campaign_ids.includes(ctx.campaignId)
    }

    case 'channel': {
      // BR-OFFER-ELIGIBILITY: eligible if ctx.channel is in the allowed list
      if (!isChannelParams(rule.params)) return false
      if (ctx.channel === undefined) return false
      return rule.params.channels.includes(ctx.channel)
    }

    case 'creative': {
      // BR-OFFER-ELIGIBILITY: eligible if ctx.creativeId is in the allowed list
      if (!isCreativeParams(rule.params)) return false
      if (ctx.creativeId === undefined) return false
      return rule.params.creative_ids.includes(ctx.creativeId)
    }

    case 'internal_use': {
      // BR-OFFER-ELIGIBILITY: eligible only for internal commercial use
      return ctx.isInternalUse === true
    }

    default: {
      // Unknown kind: fail safe — not eligible
      // Exhaustiveness check: TypeScript will error here if a new kind is added
      // without updating this switch.
      const _exhaustive: never = rule.kind
      return _exhaustive
    }
  }
}

// ---------------------------------------------------------------------------
// Group evaluator (recursive)
// ---------------------------------------------------------------------------

/**
 * evaluateRuleGroup — recursively evaluates a RuleGroup tree.
 *
 * BR-OFFER-ELIGIBILITY combination logic:
 *   and: true if ALL children (rules + sub-groups) are true; empty → true
 *   or:  true if ANY child  (rules + sub-groups) is  true; empty → false
 *
 * docs/50-business-rules/BR-OFFER-ELIGIBILITY.md §Combinação lógica
 */
export function evaluateRuleGroup(
  group: RuleGroup,
  ctx: EligibilityContext,
): boolean {
  // Collect all leaf results: atomic rules first, then child groups recursively
  const atomicResults = group.rules.map((r) => evaluateRule(r, ctx))
  const childResults = group.children.map((child) =>
    evaluateRuleGroup(child, ctx),
  )
  const allResults = [...atomicResults, ...childResults]

  // BR-OFFER-ELIGIBILITY: empty group semantics
  if (allResults.length === 0) {
    // and-empty → true (vacuous truth), or-empty → false
    return group.operator === 'and'
  }

  if (group.operator === 'and') {
    return allResults.every(Boolean)
  } else {
    return allResults.some(Boolean)
  }
}

// ---------------------------------------------------------------------------
// Public API — pure, synchronous
// ---------------------------------------------------------------------------

/**
 * evaluateEligibility — entry point for eligibility evaluation.
 *
 * Takes the root RuleGroup and a DecisionContext; returns true if the
 * condition is eligible in that context.
 *
 * This function is PURE (no I/O, no DB).  The DB-backed version that
 * loads the tree from `offer_condition_rule_group` lives in `index.ts`.
 *
 * BR-OFFER-ELIGIBILITY
 * docs/20-domain/10-offer-engine.md §11 step 3
 */
export function evaluateEligibility(
  group: RuleGroup,
  ctx: EligibilityContext,
): boolean {
  return evaluateRuleGroup(group, ctx)
}
