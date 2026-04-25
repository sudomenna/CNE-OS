/**
 * Unit tests for evaluateEligibility / evaluateRuleGroup / evaluateRule
 *
 * BR-OFFER-ELIGIBILITY
 * docs/20-domain/10-offer-engine.md §11
 * T-6-13
 *
 * Naming: Given/When/Then as required by CLAUDE.md §Teste.
 */

import { describe, expect, it } from 'vitest'
import {
  evaluateEligibility,
  evaluateRule,
  evaluateRuleGroup,
  type EligibilityContext,
  type Rule,
  type RuleGroup,
} from '../../../lib/domain/offer/eligibility'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseCtx: EligibilityContext = {
  now: new Date('2026-04-15T12:00:00Z'),
  contactId: 'contact-001',
}

function makeGroup(
  operator: 'and' | 'or',
  rules: Rule[] = [],
  children: RuleGroup[] = [],
): RuleGroup {
  return { id: 'g-1', operator, rules, children }
}

function makeRule(
  kind: Rule['kind'],
  params: unknown,
  id = 'r-1',
): Rule {
  return { id, kind, params }
}

// ---------------------------------------------------------------------------
// describe: BR-OFFER-ELIGIBILITY — evaluateRule
// ---------------------------------------------------------------------------

describe('BR-OFFER-ELIGIBILITY — evaluateRule', () => {
  // CT-ELIG-01
  it('given date_range rule when ctx.now is inside window then returns true', () => {
    const rule = makeRule('date_range', {
      start_at: '2026-04-01T00:00:00Z',
      end_at: '2026-05-01T00:00:00Z',
    })
    expect(evaluateRule(rule, baseCtx)).toBe(true)
  })

  // CT-ELIG-02
  it('given date_range rule when ctx.now is after end_at then returns false', () => {
    const rule = makeRule('date_range', {
      start_at: '2026-04-01T00:00:00Z',
      end_at: '2026-05-01T00:00:00Z',
    })
    const ctx: EligibilityContext = { ...baseCtx, now: new Date('2026-06-01T00:00:00Z') }
    expect(evaluateRule(rule, ctx)).toBe(false)
  })

  it('given date_range rule when ctx.now equals end_at (exclusive) then returns false', () => {
    // BR-OFFER-ELIGIBILITY: end_at is exclusive
    const rule = makeRule('date_range', {
      start_at: '2026-04-01T00:00:00Z',
      end_at: '2026-04-15T12:00:00Z',
    })
    expect(evaluateRule(rule, baseCtx)).toBe(false)
  })

  it('given date_range rule when ctx.now equals start_at (inclusive) then returns true', () => {
    // BR-OFFER-ELIGIBILITY: start_at is inclusive
    const rule = makeRule('date_range', {
      start_at: '2026-04-15T12:00:00Z',
      end_at: '2026-05-01T00:00:00Z',
    })
    expect(evaluateRule(rule, baseCtx)).toBe(true)
  })

  // CT-ELIG-03
  it('given sales_count_reached rule when approved_count < max then returns true', () => {
    const rule = makeRule('sales_count_reached', { max: 30 })
    const ctx: EligibilityContext = { ...baseCtx, salesCount: 29 }
    expect(evaluateRule(rule, ctx)).toBe(true)
  })

  it('given sales_count_reached rule when approved_count equals max then returns false', () => {
    const rule = makeRule('sales_count_reached', { max: 30 })
    const ctx: EligibilityContext = { ...baseCtx, salesCount: 30 }
    expect(evaluateRule(rule, ctx)).toBe(false)
  })

  it('given campaign rule when ctx.campaignId is in campaign_ids then returns true', () => {
    const campaignId = 'camp-abc-123'
    const rule = makeRule('campaign', { campaign_ids: [campaignId, 'camp-xyz-999'] })
    const ctx: EligibilityContext = { ...baseCtx, campaignId }
    expect(evaluateRule(rule, ctx)).toBe(true)
  })

  it('given campaign rule when ctx.campaignId is absent then returns false', () => {
    const rule = makeRule('campaign', { campaign_ids: ['camp-abc-123'] })
    expect(evaluateRule(rule, baseCtx)).toBe(false)
  })

  it('given channel rule when ctx.channel matches then returns true', () => {
    const rule = makeRule('channel', { channels: ['whatsapp', 'instagram'] })
    const ctx: EligibilityContext = { ...baseCtx, channel: 'whatsapp' }
    expect(evaluateRule(rule, ctx)).toBe(true)
  })

  it('given channel rule when ctx.channel does not match then returns false', () => {
    const rule = makeRule('channel', { channels: ['instagram'] })
    const ctx: EligibilityContext = { ...baseCtx, channel: 'email' }
    expect(evaluateRule(rule, ctx)).toBe(false)
  })

  it('given creative rule when ctx.creativeId is in creative_ids then returns true', () => {
    const creativeId = 'creative-001'
    const rule = makeRule('creative', { creative_ids: [creativeId] })
    const ctx: EligibilityContext = { ...baseCtx, creativeId }
    expect(evaluateRule(rule, ctx)).toBe(true)
  })

  it('given creative rule when ctx.creativeId is absent then returns false', () => {
    const rule = makeRule('creative', { creative_ids: ['creative-001'] })
    expect(evaluateRule(rule, baseCtx)).toBe(false)
  })

  it('given internal_use rule when ctx.isInternalUse is true then returns true', () => {
    const rule = makeRule('internal_use', {})
    const ctx: EligibilityContext = { ...baseCtx, isInternalUse: true }
    expect(evaluateRule(rule, ctx)).toBe(true)
  })

  it('given internal_use rule when ctx.isInternalUse is false then returns false', () => {
    const rule = makeRule('internal_use', {})
    const ctx: EligibilityContext = { ...baseCtx, isInternalUse: false }
    expect(evaluateRule(rule, ctx)).toBe(false)
  })

  it('given internal_use rule when ctx.isInternalUse is absent then returns false', () => {
    const rule = makeRule('internal_use', {})
    expect(evaluateRule(rule, baseCtx)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describe: BR-OFFER-ELIGIBILITY — evaluateRuleGroup (pure AND/OR)
// ---------------------------------------------------------------------------

describe('BR-OFFER-ELIGIBILITY — evaluateRuleGroup AND/OR', () => {
  // CT-ELIG-07 empty groups
  it('given AND group with no rules and no children when evaluated then returns true', () => {
    const group = makeGroup('and')
    expect(evaluateRuleGroup(group, baseCtx)).toBe(true)
  })

  it('given OR group with no rules and no children when evaluated then returns false', () => {
    const group = makeGroup('or')
    expect(evaluateRuleGroup(group, baseCtx)).toBe(false)
  })

  // CT-ELIG-04 AND pure
  it('given AND group with a passing rule and a failing rule when evaluated then returns false', () => {
    const passingRule = makeRule(
      'date_range',
      { start_at: '2026-04-01T00:00:00Z', end_at: '2026-05-01T00:00:00Z' },
      'r-pass',
    )
    const failingRule = makeRule(
      'campaign',
      { campaign_ids: ['camp-X'] },
      'r-fail',
    )
    const group = makeGroup('and', [passingRule, failingRule])
    // campaignId not in ctx → failing rule returns false → AND → false
    expect(evaluateRuleGroup(group, baseCtx)).toBe(false)
  })

  it('given AND group with all passing rules when evaluated then returns true', () => {
    const r1 = makeRule(
      'date_range',
      { start_at: '2026-04-01T00:00:00Z', end_at: '2026-05-01T00:00:00Z' },
      'r-1',
    )
    const r2 = makeRule('channel', { channels: ['whatsapp'] }, 'r-2')
    const ctx: EligibilityContext = { ...baseCtx, channel: 'whatsapp' }
    const group = makeGroup('and', [r1, r2])
    expect(evaluateRuleGroup(group, ctx)).toBe(true)
  })

  // CT-ELIG-05 OR pure
  it('given OR group with one passing and one failing rule when evaluated then returns true', () => {
    const passingRule = makeRule(
      'date_range',
      { start_at: '2026-04-01T00:00:00Z', end_at: '2026-05-01T00:00:00Z' },
      'r-pass',
    )
    const failingRule = makeRule('sales_count_reached', { max: 30 }, 'r-fail')
    // salesCount not set (0) → 0 < 30 → actually passes. Use salesCount=30 to fail.
    const ctx: EligibilityContext = { ...baseCtx, salesCount: 30 }
    const group = makeGroup('or', [passingRule, failingRule])
    expect(evaluateRuleGroup(group, ctx)).toBe(true)
  })

  it('given OR group with all failing rules when evaluated then returns false', () => {
    const r1 = makeRule('campaign', { campaign_ids: ['camp-X'] }, 'r-1')
    const r2 = makeRule('channel', { channels: ['instagram'] }, 'r-2')
    const ctx: EligibilityContext = { ...baseCtx, channel: 'email' }
    // no campaignId, wrong channel → both fail
    const group = makeGroup('or', [r1, r2])
    expect(evaluateRuleGroup(group, ctx)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// describe: BR-OFFER-ELIGIBILITY — nested groups
// ---------------------------------------------------------------------------

describe('BR-OFFER-ELIGIBILITY — nested groups (AND in OR, OR in AND)', () => {
  // CT-ELIG-06 — "(campaign X AND sales < 30) OR channel=whatsapp"
  it('given OR root with AND child failing and channel rule passing when ctx.channel=whatsapp then returns true', () => {
    // Sub-group A: AND [campaign([camp-X]), sales_count_reached(30)]
    const campaignRule = makeRule('campaign', { campaign_ids: ['camp-X'] }, 'r-campaign')
    const salesRule = makeRule('sales_count_reached', { max: 30 }, 'r-sales')
    const subgroupA: RuleGroup = {
      id: 'g-A',
      operator: 'and',
      rules: [campaignRule, salesRule],
      children: [],
    }

    // Root: OR [subgroupA, channel=whatsapp]
    const channelRule = makeRule('channel', { channels: ['whatsapp'] }, 'r-channel')
    const rootGroup: RuleGroup = {
      id: 'g-root',
      operator: 'or',
      rules: [channelRule],
      children: [subgroupA],
    }

    // ctx has channel=whatsapp but no campaignId → A fails, channel passes → OR → true
    const ctx: EligibilityContext = { ...baseCtx, channel: 'whatsapp', salesCount: 5 }
    expect(evaluateRuleGroup(rootGroup, ctx)).toBe(true)
  })

  it('given OR root with AND child failing and channel rule also failing when evaluated then returns false', () => {
    const campaignRule = makeRule('campaign', { campaign_ids: ['camp-X'] }, 'r-campaign')
    const salesRule = makeRule('sales_count_reached', { max: 30 }, 'r-sales')
    const subgroupA: RuleGroup = {
      id: 'g-A',
      operator: 'and',
      rules: [campaignRule, salesRule],
      children: [],
    }
    const channelRule = makeRule('channel', { channels: ['whatsapp'] }, 'r-channel')
    const rootGroup: RuleGroup = {
      id: 'g-root',
      operator: 'or',
      rules: [channelRule],
      children: [subgroupA],
    }
    // ctx: no campaignId → A fails; channel=email → channel rule fails → OR → false
    const ctx: EligibilityContext = { ...baseCtx, channel: 'email', salesCount: 5 }
    expect(evaluateRuleGroup(rootGroup, ctx)).toBe(false)
  })

  it('given AND root with two OR children both passing when evaluated then returns true', () => {
    // OR child 1: channel=whatsapp OR campaign=[camp-X]
    const channelRule = makeRule('channel', { channels: ['whatsapp'] }, 'r-ch')
    const campaignRule = makeRule('campaign', { campaign_ids: ['camp-X'] }, 'r-camp')
    const orChild1: RuleGroup = {
      id: 'g-or1',
      operator: 'or',
      rules: [channelRule, campaignRule],
      children: [],
    }

    // OR child 2: internal_use OR creative=[crea-1]
    const internalRule = makeRule('internal_use', {}, 'r-internal')
    const creativeRule = makeRule('creative', { creative_ids: ['crea-1'] }, 'r-creative')
    const orChild2: RuleGroup = {
      id: 'g-or2',
      operator: 'or',
      rules: [internalRule, creativeRule],
      children: [],
    }

    // AND root: [orChild1 AND orChild2]
    const andRoot: RuleGroup = {
      id: 'g-root',
      operator: 'and',
      rules: [],
      children: [orChild1, orChild2],
    }

    // ctx: channel=whatsapp (or1 passes via channelRule), creativeId=crea-1 (or2 passes via creativeRule)
    const ctx: EligibilityContext = {
      ...baseCtx,
      channel: 'whatsapp',
      creativeId: 'crea-1',
    }
    expect(evaluateRuleGroup(andRoot, ctx)).toBe(true)
  })

  it('given AND root with one OR child passing and one OR child failing when evaluated then returns false', () => {
    const channelRule = makeRule('channel', { channels: ['whatsapp'] }, 'r-ch')
    const orChild1: RuleGroup = {
      id: 'g-or1',
      operator: 'or',
      rules: [channelRule],
      children: [],
    }
    // This OR child has no passing rules
    const campaignRule = makeRule('campaign', { campaign_ids: ['camp-X'] }, 'r-camp')
    const orChild2: RuleGroup = {
      id: 'g-or2',
      operator: 'or',
      rules: [campaignRule],
      children: [],
    }

    const andRoot: RuleGroup = {
      id: 'g-root',
      operator: 'and',
      rules: [],
      children: [orChild1, orChild2],
    }

    // ctx: channel=whatsapp (or1 passes), no campaignId (or2 fails) → AND → false
    const ctx: EligibilityContext = { ...baseCtx, channel: 'whatsapp' }
    expect(evaluateRuleGroup(andRoot, ctx)).toBe(false)
  })

  it('given triple-level nesting (AND in OR in AND) when innermost fails then root returns false', () => {
    // Level 3 (inner AND): date_range AND sales_count_reached
    const dateRule = makeRule(
      'date_range',
      { start_at: '2026-04-01T00:00:00Z', end_at: '2026-05-01T00:00:00Z' },
      'r-date',
    )
    const salesRule = makeRule('sales_count_reached', { max: 10 }, 'r-sales')
    const innerAnd: RuleGroup = {
      id: 'g-inner',
      operator: 'and',
      rules: [dateRule, salesRule],
      children: [],
    }

    // Level 2 (middle OR): channel=instagram OR [innerAnd]
    const channelRule = makeRule('channel', { channels: ['instagram'] }, 'r-ch')
    const middleOr: RuleGroup = {
      id: 'g-middle',
      operator: 'or',
      rules: [channelRule],
      children: [innerAnd],
    }

    // Level 1 (root AND): internal_use AND [middleOr]
    const internalRule = makeRule('internal_use', {}, 'r-internal')
    const rootAnd: RuleGroup = {
      id: 'g-root',
      operator: 'and',
      rules: [internalRule],
      children: [middleOr],
    }

    // ctx: isInternalUse=true (root AND passes), channel=whatsapp (not instagram → channel rule fails),
    // salesCount=15 > 10 → inner AND fails → middleOr has no passing child → false → root AND → false
    const ctx: EligibilityContext = {
      ...baseCtx,
      isInternalUse: true,
      channel: 'whatsapp',
      salesCount: 15,
    }
    expect(evaluateRuleGroup(rootAnd, ctx)).toBe(false)
  })

  it('given triple-level nesting when all conditions satisfied then root returns true', () => {
    const dateRule = makeRule(
      'date_range',
      { start_at: '2026-04-01T00:00:00Z', end_at: '2026-05-01T00:00:00Z' },
      'r-date',
    )
    const salesRule = makeRule('sales_count_reached', { max: 30 }, 'r-sales')
    const innerAnd: RuleGroup = {
      id: 'g-inner',
      operator: 'and',
      rules: [dateRule, salesRule],
      children: [],
    }

    const channelRule = makeRule('channel', { channels: ['instagram'] }, 'r-ch')
    const middleOr: RuleGroup = {
      id: 'g-middle',
      operator: 'or',
      rules: [channelRule],
      children: [innerAnd],
    }

    const internalRule = makeRule('internal_use', {}, 'r-internal')
    const rootAnd: RuleGroup = {
      id: 'g-root',
      operator: 'and',
      rules: [internalRule],
      children: [middleOr],
    }

    // ctx: isInternalUse=true, salesCount=5 < 30 → innerAnd passes → middleOr passes → rootAnd passes
    const ctx: EligibilityContext = {
      ...baseCtx,
      isInternalUse: true,
      salesCount: 5,
    }
    expect(evaluateRuleGroup(rootAnd, ctx)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// describe: BR-OFFER-ELIGIBILITY — evaluateEligibility (entry-point)
// ---------------------------------------------------------------------------

describe('BR-OFFER-ELIGIBILITY — evaluateEligibility entry-point', () => {
  it('given a simple AND group with all passing rules when evaluateEligibility called then returns true', () => {
    const channelRule = makeRule('channel', { channels: ['whatsapp', 'email'] }, 'r-ch')
    const salesRule = makeRule('sales_count_reached', { max: 100 }, 'r-sales')
    const group = makeGroup('and', [channelRule, salesRule])
    const ctx: EligibilityContext = {
      ...baseCtx,
      channel: 'email',
      salesCount: 0,
    }
    expect(evaluateEligibility(group, ctx)).toBe(true)
  })

  it('given a simple OR group with all failing rules when evaluateEligibility called then returns false', () => {
    const creativeRule = makeRule('creative', { creative_ids: ['crea-999'] }, 'r-crea')
    const campaignRule = makeRule('campaign', { campaign_ids: ['camp-999'] }, 'r-camp')
    const group = makeGroup('or', [creativeRule, campaignRule])
    // ctx has no creativeId or campaignId → both fail → OR → false
    expect(evaluateEligibility(group, baseCtx)).toBe(false)
  })
})
