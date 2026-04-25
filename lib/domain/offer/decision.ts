/**
 * MOD-OFFER — Pure condition selector
 *
 * Implements BR-OFFER-DECISION: given a list of eligible conditions, selects
 * exactly one to apply using a deterministic tiebreak hierarchy:
 *   priority DESC → advantageScore DESC → createdAt DESC → conflict
 *
 * This function is PURE (no I/O, no DB, no tx). The DB-backed wrapper that
 * loads conditions and calls evaluateEligibility lives in `index.ts`.
 *
 * T-6-14
 * docs/20-domain/10-offer-engine.md §11
 * docs/50-business-rules/BR-OFFER-DECISION.md
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single offer_condition that has already passed evaluateEligibility.
 * Callers must filter before passing to selectCondition.
 */
export type EligibleCondition = {
  id: string
  priority: number
  advantageScore: number
  createdAt: Date
  isDefault: boolean
}

/**
 * Result of selectCondition.
 *
 * kind='selected'  → a unique winner was found among eligible conditions.
 * kind='default'   → no eligible conditions; the is_default condition is used
 *                    as fallback (BR-OFFER-DECISION step 5).
 * kind='conflict'  → 2+ eligible conditions share the same priority + score +
 *                    timestamp — caller must open contact_issue and hold the
 *                    transaction as `pending` (BR-OFFER-DECISION step 7).
 * kind='none'      → no eligible conditions and no default exists (config error).
 */
export type SelectConditionResult =
  | { kind: 'selected'; conditionId: string }
  | { kind: 'default'; conditionId: string }
  | { kind: 'conflict'; conditionIds: string[] }
  | { kind: 'none' }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compare two EligibleConditions according to BR-OFFER-DECISION desempate:
 *   1. priority DESC  (higher wins)
 *   2. advantageScore DESC (higher wins)
 *   3. createdAt DESC (newer wins — BR-OFFER-DECISION §Tabela linha 4)
 *
 * Returns negative if a should come BEFORE b, positive otherwise.
 *
 * BR-OFFER-DECISION §Tabela de decisão passos 2-4
 */
function compareConditions(a: EligibleCondition, b: EligibleCondition): number {
  // Step 1: priority DESC
  if (b.priority !== a.priority) return b.priority - a.priority

  // Step 2: advantageScore DESC
  if (b.advantageScore !== a.advantageScore) {
    return b.advantageScore - a.advantageScore
  }

  // Step 3: createdAt DESC (newer wins → larger timestamp first)
  return b.createdAt.getTime() - a.createdAt.getTime()
}

/**
 * Returns true when two conditions are fully tied on all three desempate
 * criteria (priority + advantageScore + createdAt to the millisecond).
 *
 * BR-OFFER-DECISION step 7
 */
function fullyTied(a: EligibleCondition, b: EligibleCondition): boolean {
  return (
    a.priority === b.priority &&
    a.advantageScore === b.advantageScore &&
    a.createdAt.getTime() === b.createdAt.getTime()
  )
}

// ---------------------------------------------------------------------------
// Public API — pure, synchronous
// ---------------------------------------------------------------------------

/**
 * selectCondition — selects a single offer_condition from a list.
 *
 * @param conditions  All offer_conditions for the offer, already evaluated.
 *                    The function segregates eligible (non-default) and default
 *                    internally based on `isDefault`.
 *
 * Algorithm (BR-OFFER-DECISION):
 *  1. Separate eligible candidates (isDefault=false) from defaults (isDefault=true).
 *  2. If candidates is non-empty:
 *     a. Sort by (priority DESC, advantageScore DESC, createdAt DESC).
 *     b. If top[0] is fully tied with top[1] → collect all tied → 'conflict'.
 *     c. Otherwise → 'selected' with top[0].id.
 *  3. If candidates is empty AND a default exists → 'default' with default.id.
 *  4. If candidates is empty AND no default → 'none'.
 *
 * Note: `conditions` is expected to contain ONLY conditions that passed
 * evaluateEligibility. The `isDefault` flag is used solely for fallback
 * routing, not for re-evaluation.
 */
export function selectCondition(
  conditions: EligibleCondition[],
): SelectConditionResult {
  // Split: non-default eligible candidates vs default fallback
  // BR-OFFER-DECISION step 4 — fallback applies only when zero non-default candidates
  const candidates = conditions.filter((c) => !c.isDefault)
  const defaultCondition = conditions.find((c) => c.isDefault) ?? null

  if (candidates.length === 0) {
    // BR-OFFER-DECISION step 5: no eligible non-default → use default as fallback
    if (defaultCondition !== null) {
      return { kind: 'default', conditionId: defaultCondition.id }
    }
    // BR-OFFER-DECISION: no eligible and no default → cannot decide
    return { kind: 'none' }
  }

  // Sort candidates: priority DESC → advantageScore DESC → createdAt DESC
  // BR-OFFER-DECISION steps 2-4
  const sorted = [...candidates].sort(compareConditions)

  // candidates.length > 0 is guaranteed above, but TypeScript cannot narrow
  // array index access, so we assert non-null explicitly.
  const top = sorted[0] as EligibleCondition

  // Detect conflict: collect all candidates that are fully tied with top
  // BR-OFFER-DECISION step 7
  const tied = sorted.filter((c) => fullyTied(c, top))

  if (tied.length >= 2) {
    // BR-OFFER-DECISION §5: conflict — caller must open contact_issue
    return { kind: 'conflict', conditionIds: tied.map((c) => c.id) }
  }

  // Unique winner
  return { kind: 'selected', conditionId: top.id }
}
