/**
 * MOD-AUTOMATION — Schemas Zod (T-11-13)
 *
 * Re-exporta schemas de condição, trigger e action.
 * docs/20-domain/15-automation.md §8 (DSL de condição) + §7 (triggers/actions)
 */
export { conditionExprSchema } from './condition'
export type { ConditionExprInput } from './condition'

export { triggerFilterSchema } from './trigger'
export type { TriggerFilterInput } from './trigger'

export { actionParamsSchema } from './action'
export type { ActionParamsInput } from './action'
