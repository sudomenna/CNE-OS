/**
 * MOD-FUNNEL — Interface pública do módulo Funnel & Opportunity
 *
 * docs/20-domain/08-funnel-opportunity.md
 * docs/30-contracts/07-module-interfaces.md § MOD-FUNNEL
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md
 *
 * Funções implementadas em T-5-10:
 *   enterFunnel, moveStage, setOpportunityLabel
 *
 * Funções implementadas em T-5-11:
 *   markWon, markLost, recomputeScore (alias: updateScore — 07-module-interfaces.md)
 */

// ── Tipos exportados ─────────────────────────────────────────────────────────

export type { EnterFunnelInput, EnterFunnelResult } from './enter'
export type { SetOpportunityLabelInput, FunnelOpportunityLabel } from './label'
export type { MarkWonInput } from './won'
export type { MarkLostInput } from './lost'
export type { RecomputeScoreInput } from './score'
export type { UtmSnapshot, AttributionResult, EntryAttributionInput } from './attribution'

// Tipos Drizzle re-exportados para consumo pelos módulos consumidores
export type {
  FunnelEntry,
  FunnelStage,
  FunnelEntryStageHistory,
  FunnelEntryScoreHistory,
} from '@/lib/db/schema/funnel'

// ── Erros exportados ─────────────────────────────────────────────────────────

export {
  FunnelDomainError,
  FunnelEntryNotFoundError,
  FunnelStageMismatchError,
  FunnelEntryTerminalError,
  FunnelHasNoStagesError,
} from './errors'

export { WonRequiresTransactionError } from './won'
export { LostRequiresReasonError } from './lost'

// ── Funções públicas ─────────────────────────────────────────────────────────

export { enterFunnel } from './enter'
export { moveStage } from './move-stage'
export { setOpportunityLabel } from './label'
export { markWon } from './won'
export { markLost } from './lost'
// recomputeScore é o nome canônico da BR; updateScore é o alias do contrato de interface
// docs/30-contracts/07-module-interfaces.md § MOD-FUNNEL
export { recomputeScore, recomputeScore as updateScore } from './score'

// T-5-16: FLOW-14 — atribuição de entrada/conversão
export { resolveAttribution, applyEntryAttribution } from './attribution'
