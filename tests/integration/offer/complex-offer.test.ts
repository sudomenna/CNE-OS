/**
 * T-6-24 — Integration test: oferta complexa com 12 contextos
 *
 * Testa a pipeline completa evaluateEligibility + selectCondition com uma
 * oferta complexa simulada. Testes PUROS (sem DB, sem tx) — apenas funções
 * de domínio.
 *
 * Fixture:
 *   Condição A  priority=10, advantageScore=5  — regra AND: campaign(['campaign-vip'])
 *   Condição B  priority=10, advantageScore=8  — regra AND: channel(['whatsapp','email'])
 *   Condição C  priority=5,  advantageScore=100 — grupo AND vazio → sempre elegível
 *   Condição D  (cenários 11-12) OR: [sales_count_reached(max=5) OR channel(['whatsapp'])]
 *   Condição DFT  is_default=true — fallback
 *
 * Mapeamento de rule kinds para os cenários descritos na tarefa:
 *   "purchase_count >= 3"        → campaign(['campaign-vip'])   (elegível quando campaignId=vip)
 *   "funnel_label IN [won,active]" → channel(['whatsapp','email']) (elegível quando channel=whatsapp|email)
 *
 * docs/20-domain/10-offer-engine.md §10, §11
 * docs/50-business-rules/BR-OFFER-DECISION.md
 * docs/50-business-rules/BR-OFFER-ELIGIBILITY.md
 */

import { describe, it, expect } from 'vitest'
import {
  evaluateEligibility,
  type EligibilityContext,
  type Rule,
  type RuleGroup,
} from '@/lib/domain/offer/eligibility'
import {
  selectCondition,
  type EligibleCondition,
} from '@/lib/domain/offer/decision'

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const ID_A = 'cond-a-0000-0000-0000-000000000001'
const ID_B = 'cond-b-0000-0000-0000-000000000002'
const ID_C = 'cond-c-0000-0000-0000-000000000003'
const ID_D = 'cond-d-0000-0000-0000-000000000004'
const ID_DFT = 'cond-dft-000-0000-0000-000000000005'

const CAMPAIGN_VIP = 'campaign-vip-0000-0000-0000-000000000099'

// ---------------------------------------------------------------------------
// Shared base date — prevents date_range interference in group timestamps
// ---------------------------------------------------------------------------

const T_BASE = new Date('2026-04-15T12:00:00Z')
const T_SAME = new Date('2026-04-15T09:00:00Z') // same ts for conflict tests

// ---------------------------------------------------------------------------
// Rule builders (pure helpers — no DB)
// ---------------------------------------------------------------------------

function makeRule(id: string, kind: Rule['kind'], params: unknown): Rule {
  return { id, kind, params }
}

function makeGroup(
  id: string,
  operator: 'and' | 'or',
  rules: Rule[],
  children: RuleGroup[] = [],
): RuleGroup {
  return { id, operator, rules, children }
}

// ---------------------------------------------------------------------------
// Fixture root groups
// ---------------------------------------------------------------------------

/**
 * Condição A — AND group with one rule: campaign(['campaign-vip'])
 * Eligible when ctx.campaignId === CAMPAIGN_VIP.
 * priority=10, advantageScore=5
 */
const groupA: RuleGroup = makeGroup(
  'grp-a',
  'and',
  [makeRule('rule-a-1', 'campaign', { campaign_ids: [CAMPAIGN_VIP] })],
)

/**
 * Condição B — AND group with one rule: channel(['whatsapp','email'])
 * Eligible when ctx.channel is 'whatsapp' or 'email'.
 * priority=10, advantageScore=8
 */
const groupB: RuleGroup = makeGroup(
  'grp-b',
  'and',
  [makeRule('rule-b-1', 'channel', { channels: ['whatsapp', 'email'] })],
)

/**
 * Condição C — AND group with zero rules → vacuous truth → always eligible.
 * priority=5, advantageScore=100
 */
const groupC: RuleGroup = makeGroup('grp-c', 'and', [])

/**
 * Condição D — OR group: sales_count_reached(max=5) OR channel(['whatsapp'])
 * Used only in scenarios 11-12.
 */
const groupD: RuleGroup = makeGroup(
  'grp-d',
  'or',
  [
    makeRule('rule-d-1', 'sales_count_reached', { max: 5 }),
    makeRule('rule-d-2', 'channel', { channels: ['whatsapp'] }),
  ],
)

// ---------------------------------------------------------------------------
// EligibleCondition factory
// ---------------------------------------------------------------------------

function makeEligibleCondition(
  id: string,
  priority: number,
  advantageScore: number,
  createdAt: Date,
  isDefault = false,
): EligibleCondition {
  return { id, priority, advantageScore, createdAt, isDefault }
}

// Canonical EligibleCondition for each condition in the fixture
const COND_A = makeEligibleCondition(ID_A, 10, 5, T_BASE)
const COND_B = makeEligibleCondition(ID_B, 10, 8, T_BASE)
const COND_C = makeEligibleCondition(ID_C, 5, 100, T_BASE)
const COND_DFT = makeEligibleCondition(ID_DFT, 0, 0, T_BASE, true)

// ---------------------------------------------------------------------------
// Helper: evaluate all fixture conditions for a context, collect eligible
// (non-default) EligibleConditions, optionally append default, then select.
//
// This mirrors the pipeline in docs/20-domain/10-offer-engine.md §11:
//   1. evaluateEligibility per condition
//   2. build EligibleCondition array from those that passed
//   3. selectCondition on the array
// ---------------------------------------------------------------------------

type ContextWithEligibleGroups = {
  groups: Array<{ group: RuleGroup; condition: EligibleCondition }>
  defaultCondition: EligibleCondition | null
  ctx: EligibilityContext
}

function runPipeline({
  groups,
  defaultCondition,
  ctx,
}: ContextWithEligibleGroups) {
  const eligible: EligibleCondition[] = []

  for (const { group, condition } of groups) {
    if (evaluateEligibility(group, ctx)) {
      eligible.push(condition)
    }
  }

  // Add default to the candidate list for selectCondition if it exists
  // (the default is always passed through; selectCondition handles fallback logic)
  const allConditions: EligibleCondition[] = defaultCondition
    ? [...eligible, defaultCondition]
    : eligible

  return selectCondition(allConditions)
}

// ---------------------------------------------------------------------------
// Base context builder
// ---------------------------------------------------------------------------

function makeCtx(
  overrides: Partial<EligibilityContext> = {},
): EligibilityContext {
  return {
    now: T_BASE,
    contactId: 'contact-test-001',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// The 12 contexts
// ---------------------------------------------------------------------------

describe('complex offer fixture — evaluateEligibility + selectCondition pipeline', () => {

  // ── Scenario 1: no campaign, no channel ──────────────────────────────────
  describe('context 1: no campaignId, no channel', () => {
    it('given ctx=no campaign + no channel when pipeline runs then kind:selected conditionId:C (A and B ineligible, C always eligible, priority=5 wins alone)', () => {
      const ctx = makeCtx()

      // A: campaign rule → no campaignId → ineligible
      expect(evaluateEligibility(groupA, ctx)).toBe(false)
      // B: channel rule → no channel → ineligible
      expect(evaluateEligibility(groupB, ctx)).toBe(false)
      // C: empty AND → eligible
      expect(evaluateEligibility(groupC, ctx)).toBe(true)

      const result = runPipeline({
        groups: [
          { group: groupA, condition: COND_A },
          { group: groupB, condition: COND_B },
          { group: groupC, condition: COND_C },
        ],
        defaultCondition: COND_DFT,
        ctx,
      })

      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_C)
      }
    })
  })

  // ── Scenario 2: campaignId=vip, no channel ───────────────────────────────
  describe('context 2: campaignId=vip, no channel', () => {
    it('given ctx=campaignId=vip + no channel when pipeline runs then kind:selected conditionId:A (A priority=10 > C priority=5)', () => {
      const ctx = makeCtx({ campaignId: CAMPAIGN_VIP })

      // A: campaign rule → campaignId matches → eligible
      expect(evaluateEligibility(groupA, ctx)).toBe(true)
      // B: channel rule → no channel → ineligible
      expect(evaluateEligibility(groupB, ctx)).toBe(false)
      // C: empty AND → eligible
      expect(evaluateEligibility(groupC, ctx)).toBe(true)

      const result = runPipeline({
        groups: [
          { group: groupA, condition: COND_A },
          { group: groupB, condition: COND_B },
          { group: groupC, condition: COND_C },
        ],
        defaultCondition: COND_DFT,
        ctx,
      })

      // A(priority=10, score=5) vs C(priority=5, score=100) → A wins on priority
      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_A)
      }
    })
  })

  // ── Scenario 3: campaignId=vip, channel=whatsapp ─────────────────────────
  describe('context 3: campaignId=vip, channel=whatsapp', () => {
    it('given ctx=campaignId=vip + channel=whatsapp when pipeline runs then kind:selected conditionId:B (same priority=10, B score=8 > A score=5)', () => {
      const ctx = makeCtx({ campaignId: CAMPAIGN_VIP, channel: 'whatsapp' })

      // A: campaign rule → eligible
      expect(evaluateEligibility(groupA, ctx)).toBe(true)
      // B: channel rule → whatsapp matches → eligible
      expect(evaluateEligibility(groupB, ctx)).toBe(true)
      // C: empty AND → eligible
      expect(evaluateEligibility(groupC, ctx)).toBe(true)

      const result = runPipeline({
        groups: [
          { group: groupA, condition: COND_A },
          { group: groupB, condition: COND_B },
          { group: groupC, condition: COND_C },
        ],
        defaultCondition: COND_DFT,
        ctx,
      })

      // A(10,5) vs B(10,8) vs C(5,100) → B wins: same priority=10, B score=8 > A score=5
      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_B)
      }
    })
  })

  // ── Scenario 4: no campaign, channel=whatsapp ─────────────────────────────
  describe('context 4: no campaignId, channel=whatsapp', () => {
    it('given ctx=no campaign + channel=whatsapp when pipeline runs then kind:selected conditionId:B (B priority=10 > C priority=5)', () => {
      const ctx = makeCtx({ channel: 'whatsapp' })

      // A: campaign rule → no campaignId → ineligible
      expect(evaluateEligibility(groupA, ctx)).toBe(false)
      // B: channel rule → whatsapp → eligible
      expect(evaluateEligibility(groupB, ctx)).toBe(true)
      // C: empty AND → eligible
      expect(evaluateEligibility(groupC, ctx)).toBe(true)

      const result = runPipeline({
        groups: [
          { group: groupA, condition: COND_A },
          { group: groupB, condition: COND_B },
          { group: groupC, condition: COND_C },
        ],
        defaultCondition: COND_DFT,
        ctx,
      })

      // B(10,8) vs C(5,100) → B wins on priority
      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_B)
      }
    })
  })

  // ── Scenario 5: campaignId=vip, channel=email ────────────────────────────
  describe('context 5: campaignId=vip, channel=email', () => {
    it('given ctx=campaignId=vip + channel=email when pipeline runs then kind:selected conditionId:B (same priority=10, B score=8 > A score=5)', () => {
      const ctx = makeCtx({ campaignId: CAMPAIGN_VIP, channel: 'email' })

      // A: campaign rule → eligible
      expect(evaluateEligibility(groupA, ctx)).toBe(true)
      // B: channel rule → email matches → eligible
      expect(evaluateEligibility(groupB, ctx)).toBe(true)
      // C: empty AND → eligible
      expect(evaluateEligibility(groupC, ctx)).toBe(true)

      const result = runPipeline({
        groups: [
          { group: groupA, condition: COND_A },
          { group: groupB, condition: COND_B },
          { group: groupC, condition: COND_C },
        ],
        defaultCondition: COND_DFT,
        ctx,
      })

      // B(10,8) wins over A(10,5) on score
      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_B)
      }
    })
  })

  // ── Scenario 6: unknown campaign, channel=instagram ──────────────────────
  describe('context 6: campaignId=other, channel=instagram', () => {
    it('given ctx=unknown campaignId + channel=instagram when pipeline runs then kind:selected conditionId:C (only C eligible)', () => {
      const ctx = makeCtx({
        campaignId: 'campaign-other-not-in-rule',
        channel: 'instagram',
      })

      // A: campaign rule → campaignId does not match → ineligible
      expect(evaluateEligibility(groupA, ctx)).toBe(false)
      // B: channel rule → instagram NOT in ['whatsapp','email'] → ineligible
      expect(evaluateEligibility(groupB, ctx)).toBe(false)
      // C: empty AND → eligible
      expect(evaluateEligibility(groupC, ctx)).toBe(true)

      const result = runPipeline({
        groups: [
          { group: groupA, condition: COND_A },
          { group: groupB, condition: COND_B },
          { group: groupC, condition: COND_C },
        ],
        defaultCondition: COND_DFT,
        ctx,
      })

      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_C)
      }
    })
  })

  // ── Scenario 7: no campaign, no channel (same as 1, explicit) ─────────────
  describe('context 7: no campaignId, no channel (explicit C-only path)', () => {
    it('given ctx=completely empty context when pipeline runs then kind:selected conditionId:C', () => {
      const ctx = makeCtx()

      expect(evaluateEligibility(groupA, ctx)).toBe(false)
      expect(evaluateEligibility(groupB, ctx)).toBe(false)
      expect(evaluateEligibility(groupC, ctx)).toBe(true)

      const result = runPipeline({
        groups: [
          { group: groupA, condition: COND_A },
          { group: groupB, condition: COND_B },
          { group: groupC, condition: COND_C },
        ],
        defaultCondition: COND_DFT,
        ctx,
      })

      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_C)
      }
    })
  })

  // ── Scenario 8: conflict — A and B tied on all three criteria ─────────────
  describe('context 8: A and B tied on priority, score, and createdAt', () => {
    it('given A and B with priority=10 score=8 same createdAt when pipeline runs then kind:conflict with both IDs', () => {
      // Override COND_A with same score as COND_B and same timestamp
      const condATied = makeEligibleCondition(ID_A, 10, 8, T_SAME)
      const condBTied = makeEligibleCondition(ID_B, 10, 8, T_SAME)

      const ctx = makeCtx({ campaignId: CAMPAIGN_VIP, channel: 'whatsapp' })

      // Both A and B are eligible in this context
      expect(evaluateEligibility(groupA, ctx)).toBe(true)
      expect(evaluateEligibility(groupB, ctx)).toBe(true)

      const result = selectCondition([condATied, condBTied])

      // BR-OFFER-DECISION step 7: full tie → conflict
      expect(result.kind).toBe('conflict')
      if (result.kind === 'conflict') {
        expect(result.conditionIds).toHaveLength(2)
        expect(result.conditionIds).toContain(ID_A)
        expect(result.conditionIds).toContain(ID_B)
      }
    })
  })

  // ── Scenario 9: zero eligible, no default → kind:none ─────────────────────
  describe('context 9: no eligible conditions and no default', () => {
    it('given all conditions ineligible and no default condition when selectCondition called then kind:none', () => {
      // Provide no eligible candidates and no default
      const result = selectCondition([])

      expect(result.kind).toBe('none')
    })
  })

  // ── Scenario 10: zero eligible but has default → kind:default ─────────────
  describe('context 10: no eligible conditions but default exists', () => {
    it('given all non-default conditions ineligible when pipeline runs with default then kind:default conditionId:DFT', () => {
      // Context where A and B are ineligible
      const ctx = makeCtx() // no campaignId, no channel → A and B fail

      expect(evaluateEligibility(groupA, ctx)).toBe(false)
      expect(evaluateEligibility(groupB, ctx)).toBe(false)

      // Only pass the default (no non-default conditions passed eligibility)
      const result = selectCondition([COND_DFT])

      // BR-OFFER-DECISION step 5: no eligible candidates → use default fallback
      expect(result.kind).toBe('default')
      if (result.kind === 'default') {
        expect(result.conditionId).toBe(ID_DFT)
      }
    })
  })

  // ── Scenario 11: OR group — eligible via second branch ────────────────────
  describe('context 11: OR group — salesCount=30 (fails first rule) + channel=whatsapp (passes second rule)', () => {
    it('given OR group [sales_count_reached(max=5) OR channel(whatsapp)] when ctx salesCount=30 channel=whatsapp then evaluateEligibility=true (eligible via OR branch)', () => {
      // salesCount=30 >= max=5 → sales rule FAILS (rule: salesCount < max → 30 < 5 = false)
      // channel=whatsapp → channel rule PASSES
      // OR → true
      const ctx = makeCtx({ salesCount: 30, channel: 'whatsapp' })

      const condD = makeEligibleCondition(ID_D, 8, 10, T_BASE)

      expect(evaluateEligibility(groupD, ctx)).toBe(true)

      const result = selectCondition([condD])

      expect(result.kind).toBe('selected')
      if (result.kind === 'selected') {
        expect(result.conditionId).toBe(ID_D)
      }
    })
  })

  // ── Scenario 12: OR group — ineligible when both branches fail ────────────
  describe('context 12: OR group — salesCount=30 (fails) + channel=email (fails, only whatsapp in rule)', () => {
    it('given OR group [sales_count_reached(max=5) OR channel(whatsapp)] when ctx salesCount=30 channel=email then evaluateEligibility=false (both branches fail)', () => {
      // salesCount=30 >= max=5 → sales rule FAILS (30 < 5 = false)
      // channel=email → NOT in ['whatsapp'] → channel rule FAILS
      // OR → false
      const ctx = makeCtx({ salesCount: 30, channel: 'email' })

      expect(evaluateEligibility(groupD, ctx)).toBe(false)

      // With no eligible candidates and no default: kind:none
      const result = runPipeline({
        groups: [{ group: groupD, condition: makeEligibleCondition(ID_D, 8, 10, T_BASE) }],
        defaultCondition: null,
        ctx,
      })

      expect(result.kind).toBe('none')
    })
  })

  // ── Bonus: verify OR group when first branch passes (salesCount=2 < 5) ────
  describe('context 11b: OR group — salesCount=2 < max=5 (first branch passes)', () => {
    it('given OR group when ctx salesCount=2 channel=email then evaluateEligibility=true (eligible via sales_count_reached branch)', () => {
      // salesCount=2 < max=5 → sales rule PASSES
      // channel=email NOT in ['whatsapp'] → channel rule FAILS
      // OR → true (first branch passes)
      const ctx = makeCtx({ salesCount: 2, channel: 'email' })

      expect(evaluateEligibility(groupD, ctx)).toBe(true)
    })
  })
})
