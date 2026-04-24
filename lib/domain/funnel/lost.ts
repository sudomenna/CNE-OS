/**
 * MOD-FUNNEL — markLost
 *
 * docs/20-domain/08-funnel-opportunity.md §2, §5 INV-FUNNEL-05
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md §1
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { eq } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { funnelEntry } from '@/lib/db/schema/funnel'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import {
  FunnelDomainError,
  FunnelEntryNotFoundError,
  FunnelEntryTerminalError,
} from './errors'

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Lançado quando markLost é chamado sem razão (string vazia ou ausente).
 * INV-FUNNEL-05: label='lost' exige lost_reason IS NOT NULL.
 * docs/20-domain/08-funnel-opportunity.md §10 case 4: markLost(entry,'') rejeitado.
 */
export class LostRequiresReasonError extends FunnelDomainError {
  readonly entryId: string

  constructor(entryId: string) {
    super(`markLost requires a non-empty reason (entry ${entryId})`)
    this.name = 'LostRequiresReasonError'
    this.entryId = entryId
  }
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type MarkLostInput = {
  /** ID da funnel_entry a marcar como lost. */
  entryId: string
  /** Motivo da perda — obrigatório (INV-FUNNEL-05). */
  reason: string
  /** Usuário que acionou (null = sistema/automação). */
  actorUserId?: string | null
  /** Sistema que acionou. */
  actorSystem?: string | null
}

// ---------------------------------------------------------------------------
// markLost
// ---------------------------------------------------------------------------

/**
 * Marca uma oportunidade como perdida.
 *
 * Comportamento (BR-FUNNEL-OPPORTUNITY §1):
 * 1. Valida que reason não é vazio → LostRequiresReasonError.
 * 2. Carrega funnel_entry pelo entryId → FunnelEntryNotFoundError se ausente.
 * 3. Se label já é 'won' ou 'lost' → FunnelEntryTerminalError.
 * 4. UPDATE funnel_entry: label='lost', lost_reason=reason.
 * 5. Emite TE-OPPORTUNITY-LOST.
 *
 * INV-FUNNEL-05: label='lost' exige lost_reason IS NOT NULL.
 * BR-FUNNEL-OPPORTUNITY §1: won e lost são terminais — markLost recusa entry já terminal.
 */
export async function markLost(tx: DbTx, input: MarkLostInput): Promise<void> {
  const { entryId, reason, actorUserId, actorSystem } = input

  // INV-FUNNEL-05: lost_reason IS NOT NULL — validação de domínio antecipa o CHECK do DB.
  if (!reason || reason.trim() === '') {
    throw new LostRequiresReasonError(entryId)
  }

  // Carregar funnel_entry.
  const entryRows = await tx
    .select()
    .from(funnelEntry)
    .where(eq(funnelEntry.id, entryId))

  const entry = entryRows[0]
  if (!entry) {
    throw new FunnelEntryNotFoundError(entryId)
  }

  // BR-FUNNEL-OPPORTUNITY §1: won e lost são terminais.
  if (entry.label === 'won' || entry.label === 'lost') {
    throw new FunnelEntryTerminalError(entryId, entry.label)
  }

  // UPDATE funnel_entry: label='lost' + lost_reason.
  await tx
    .update(funnelEntry)
    .set({
      label: 'lost',
      lostReason: reason,
      updatedAt: sql`now()`,
    })
    .where(eq(funnelEntry.id, entryId))

  // TE-OPPORTUNITY-LOST: emitir após todas as mutações.
  // NOTA: o schema do kind 'opportunity_lost' é registrado em T-5-15.
  const actor = actorUserId
    ? { actorUserId, actorSystem: null }
    : { actorUserId: null, actorSystem: actorSystem ?? 'MOD-FUNNEL' }

  await emitTimelineEvent(
    {
      contactId: entry.contactId,
      kind: 'opportunity_lost',
      source: 'MOD-FUNNEL',
      ...actor,
      subjectKind: 'funnel_entry',
      subjectId: entryId,
      payload: {
        funnel_id: entry.funnelId,
        funnel_entry_id: entryId,
        lost_reason: reason,
      },
    },
    tx,
  )
}
