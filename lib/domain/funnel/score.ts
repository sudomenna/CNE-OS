/**
 * MOD-FUNNEL — recomputeScore
 *
 * docs/20-domain/08-funnel-opportunity.md §2, §5 INV-FUNNEL-04
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md §4
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { and, eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  funnelEntry,
  funnelEntryScoreHistory,
  funnelScoreRule,
} from '@/lib/db/schema/funnel'
import { FunnelEntryNotFoundError } from './errors'

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

/**
 * Para recomputeScore, o chamador informa quais event_kinds ocorreram para
 * esta entrada. O engine soma os deltas das regras ativas cujo event_kind
 * corresponde a algum dos eventos fornecidos.
 *
 * OQ-FUNNEL-03: DSL de event_kind interna; por ora matching exato por string.
 */
export type RecomputeScoreInput = {
  /** ID da funnel_entry a re-pontuar. */
  entryId: string
  /**
   * Kinds de eventos ocorridos que devem acionar regras de score.
   * Ex: ['message_inbound', 'stage_entered:abc-stage-id']
   */
  eventKinds: string[]
  /** Motivo descritivo para o registro em funnel_entry_score_history (opcional). */
  reason?: string | null
}

// ---------------------------------------------------------------------------
// recomputeScore
// ---------------------------------------------------------------------------

/**
 * Recalcula o score de uma oportunidade aplicando as regras de score do funil.
 *
 * Comportamento (BR-FUNNEL-OPPORTUNITY §4):
 * 1. Carrega funnel_entry pelo entryId → FunnelEntryNotFoundError se ausente.
 * 2. Busca funnel_score_rule ativas do funil (is_active=true).
 * 3. Para cada regra cuja event_kind está em eventKinds → soma o delta.
 * 4. Se nenhuma regra bater ou delta total = 0 → retorna score atual sem mutação.
 * 5. Atualiza funnel_entry.score += totalDelta.
 * 6. INSERT em funnel_entry_score_history (INV-FUNNEL-04).
 * 7. Retorna o novo score como número.
 *
 * INV-FUNNEL-04: toda mudança de score gera linha em funnel_entry_score_history.
 * BR-FUNNEL-OPPORTUNITY §4: score configurável por funil via funnel_score_rule.
 *
 * NOTA: o schema persiste `score` como numeric (string no TypeScript Drizzle).
 * Convertemos para number na lógica de cálculo e devolvemos number.
 */
export async function recomputeScore(
  tx: DbTx,
  input: RecomputeScoreInput,
): Promise<number> {
  const { entryId, eventKinds, reason } = input

  // Carregar funnel_entry.
  const entryRows = await tx
    .select()
    .from(funnelEntry)
    .where(eq(funnelEntry.id, entryId))

  const entry = entryRows[0]
  if (!entry) {
    throw new FunnelEntryNotFoundError(entryId)
  }

  // BR-FUNNEL-OPPORTUNITY §4: buscar regras de score ativas do funil.
  const rules = await tx
    .select()
    .from(funnelScoreRule)
    .where(
      and(
        eq(funnelScoreRule.funnelId, entry.funnelId),
        eq(funnelScoreRule.isActive, true),
      ),
    )

  // Calcular delta total: soma dos deltas das regras cujo event_kind bate.
  // OQ-FUNNEL-03: por ora matching exato por string (sem wildcards).
  const eventKindSet = new Set(eventKinds)
  let totalDelta = 0

  for (const rule of rules) {
    if (eventKindSet.has(rule.eventKind)) {
      // delta é string no Drizzle (numeric) — converter para número.
      totalDelta += parseFloat(rule.delta)
    }
  }

  const currentScore = parseFloat(entry.score ?? '0')

  // Se nenhum delta → retorna score atual sem mutação (sem history desnecessário).
  if (totalDelta === 0) {
    return currentScore
  }

  const newScore = currentScore + totalDelta

  // UPDATE funnel_entry.score.
  await tx
    .update(funnelEntry)
    .set({
      score: String(newScore),
      updatedAt: sql`now()`,
    })
    .where(eq(funnelEntry.id, entryId))

  // INV-FUNNEL-04: INSERT em funnel_entry_score_history (append-only).
  await tx.insert(funnelEntryScoreHistory).values({
    funnelEntryId: entryId,
    fromScore: entry.score ?? '0',
    toScore: String(newScore),
    reason:
      reason ??
      `event_kinds=[${[...eventKindSet].join(',')}] delta=${totalDelta > 0 ? '+' : ''}${totalDelta}`,
  })

  return newScore
}
