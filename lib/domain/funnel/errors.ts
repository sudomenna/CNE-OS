/**
 * MOD-FUNNEL — Typed domain errors
 *
 * docs/20-domain/08-funnel-opportunity.md
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 */

export class FunnelDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FunnelDomainError'
  }
}

/**
 * Lançado quando a funnel_entry solicitada não é encontrada pelo ID.
 */
export class FunnelEntryNotFoundError extends FunnelDomainError {
  readonly entryId: string

  constructor(entryId: string) {
    super(`funnel_entry ${entryId} not found`)
    this.name = 'FunnelEntryNotFoundError'
    this.entryId = entryId
  }
}

/**
 * Lançado quando o estágio de destino não pertence ao mesmo funil da entrada.
 * BR-FUNNEL-OPPORTUNITY §5: cada transição de current_stage_id persiste em histórico.
 * O sistema deve rejeitar movimentação para estágio de funil diferente.
 */
export class FunnelStageMismatchError extends FunnelDomainError {
  readonly entryId: string
  readonly targetStageId: string
  readonly expectedFunnelId: string

  constructor(entryId: string, targetStageId: string, expectedFunnelId: string) {
    super(
      `stage ${targetStageId} does not belong to funnel ${expectedFunnelId} (entry ${entryId})`,
    )
    this.name = 'FunnelStageMismatchError'
    this.entryId = entryId
    this.targetStageId = targetStageId
    this.expectedFunnelId = expectedFunnelId
  }
}

/**
 * Lançado quando se tenta mover estágio ou alterar label em entrada com
 * label terminal ('won' ou 'lost').
 * BR-FUNNEL-OPPORTUNITY §1: won/lost são terminais — moveStage é recusado.
 */
export class FunnelEntryTerminalError extends FunnelDomainError {
  readonly entryId: string
  readonly label: string

  constructor(entryId: string, label: string) {
    super(
      `funnel_entry ${entryId} has terminal label '${label}' — stage movement is not allowed`,
    )
    this.name = 'FunnelEntryTerminalError'
    this.entryId = entryId
    this.label = label
  }
}

/**
 * Lançado quando o funil solicitado não possui nenhum estágio configurado
 * e enterFunnel não consegue determinar o estágio inicial.
 */
export class FunnelHasNoStagesError extends FunnelDomainError {
  readonly funnelId: string

  constructor(funnelId: string) {
    super(`funnel ${funnelId} has no stages — cannot enter without a stage`)
    this.name = 'FunnelHasNoStagesError'
    this.funnelId = funnelId
  }
}
