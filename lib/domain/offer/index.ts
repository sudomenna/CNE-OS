/**
 * MOD-OFFER — Interface pública
 *
 * Alinhado com docs/30-contracts/07-module-interfaces.md §MOD-OFFER
 *
 * Exports ativos:
 *   - incrementSalesCounter          (T-6-15)
 *   - evaluateEligibility            (T-6-13)
 *   - evaluateRuleGroup              (T-6-13)
 *   - evaluateRule                   (T-6-13)
 *   - selectCondition                (T-6-14)
 *   - assertRenewalEligibility       (FLOW-10 / BR-RENEWAL)
 *   - OfferCounterNotFoundError / OfferDomainError
 *   - OfferNotRenewal / RenewalWithoutActiveEntitlement
 */

export { incrementSalesCounter } from './sales-counter'
export {
  OfferCounterNotFoundError,
  OfferDomainError,
  OfferLegalEntityImmutableError,
  OfferNotRenewal,
  RenewalWithoutActiveEntitlement,
} from './errors'
export { assertRenewalEligibility } from './renewal'
export {
  evaluateEligibility,
  evaluateRuleGroup,
  evaluateRule,
} from './eligibility'
export type { EligibilityContext, RuleGroup, Rule } from './eligibility'
export { selectCondition } from './decision'
export type { EligibleCondition, SelectConditionResult } from './decision'
export { guardLegalEntityImmutable } from './guards'
export { recordPriorityChange, NoPriorityChangeError } from './priority-history'
export type { RecordPriorityChangeInput } from './priority-history'
