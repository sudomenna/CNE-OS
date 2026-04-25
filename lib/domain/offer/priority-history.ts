/**
 * MOD-OFFER — recordPriorityChange
 *
 * INV-OFFER-02: toda mudança em offer_condition.priority ou advantage_score
 * deve ser registrada em offer_condition_priority_history (append-only).
 *
 * docs/20-domain/10-offer-engine.md §3.8, INV-OFFER-02
 * ADR-10: lança DomainError (ou subtipo) — nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento (função muta estado)
 */

import type { DbTx } from '@/lib/db/client'
import { offerConditionPriorityHistory } from '@/lib/db/schema/offer'
import { OfferDomainError } from './errors'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Lançado quando priority e advantageScore são iguais antes e depois da mudança.
 * Sem-op — não inserir linha inútil no histórico append-only.
 *
 * INV-OFFER-02: o histórico só deve conter mudanças reais.
 */
export class NoPriorityChangeError extends OfferDomainError {
  readonly conditionId: string

  constructor(conditionId: string) {
    super(
      `NoPriorityChangeError: priority and advantageScore are unchanged for condition ${conditionId} — no history row inserted.`,
    )
    this.name = 'NoPriorityChangeError'
    this.conditionId = conditionId
  }
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type RecordPriorityChangeInput = {
  conditionId: string
  previousPriority: number
  newPriority: number
  previousAdvantageScore: number
  newAdvantageScore: number
  changedByUserId: string
}

// ---------------------------------------------------------------------------
// recordPriorityChange
// ---------------------------------------------------------------------------

/**
 * Insere 1 linha em offer_condition_priority_history registrando a mudança de
 * priority e/ou advantage_score de uma condição.
 *
 * INV-OFFER-02: chamado sempre que offer_condition.priority ou advantage_score
 * forem atualizados. A Server Action updateConditionPriorityAction é responsável
 * por chamar esta função ANTES (ou na mesma tx) de executar o UPDATE na
 * offer_condition.
 *
 * @throws NoPriorityChangeError quando os valores anterior e novo são idênticos
 *         (sem-op — não inserir linha inútil).
 *
 * @param tx    Transação DB ativa (ADR-11)
 * @param input Dados da mudança
 */
export async function recordPriorityChange(
  tx: DbTx,
  input: RecordPriorityChangeInput,
): Promise<void> {
  const {
    conditionId,
    previousPriority,
    newPriority,
    previousAdvantageScore,
    newAdvantageScore,
    changedByUserId,
  } = input

  // INV-OFFER-02: não registrar linha se nada mudou de fato.
  if (previousPriority === newPriority && previousAdvantageScore === newAdvantageScore) {
    throw new NoPriorityChangeError(conditionId)
  }

  await tx.insert(offerConditionPriorityHistory).values({
    offerConditionId: conditionId,
    fromPriority: previousPriority,
    toPriority: newPriority,
    fromAdvantageScore: String(previousAdvantageScore),
    toAdvantageScore: String(newAdvantageScore),
    changedByUserId,
    createdAt: new Date(),
  })
}
