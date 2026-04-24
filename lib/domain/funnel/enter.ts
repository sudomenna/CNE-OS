/**
 * MOD-FUNNEL — enterFunnel
 *
 * docs/20-domain/08-funnel-opportunity.md §2
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md
 *
 * ADR-10: lança erros tipados, nunca retorna Result<T,E>
 * ADR-11: tx obrigatório como primeiro argumento
 */
import { and, asc, eq, notInArray } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  funnelEntry,
  funnelEntryStageHistory,
  funnelStage,
} from '@/lib/db/schema/funnel'
import type { FunnelEntry } from '@/lib/db/schema/funnel'
import { emitTimelineEvent } from '@/lib/timeline/emit'
import { FunnelHasNoStagesError } from './errors'

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export type EnterFunnelInput = {
  /** ID do contato entrando no funil. */
  contactId: string
  /** ID do funil. */
  funnelId: string
  /** Estágio inicial; se ausente, usa o estágio de menor position. */
  initialStageId?: string | null
  /** ID da campanha de origem da entrada. */
  entryCampaignId?: string | null
  /** ID do criativo de origem da entrada. */
  entryCreativeId?: string | null
  /** Descrição de origem livre (ex: 'manual', 'import', 'campaign'). */
  entryOrigin?: string | null
  /** Usuário proprietário da oportunidade. */
  ownerUserId?: string | null
  /** Identificador de quem acionou (para timeline). Mutuamente exclusivo com actorSystem. */
  actorUserId?: string | null
  /** Sistema que acionou (para timeline). Mutuamente exclusivo com actorUserId. */
  actorSystem?: string | null
}

export type EnterFunnelResult = {
  entry: FunnelEntry
  /** true = nova oportunidade criada; false = entrada existente retornada (idempotente). */
  created: boolean
}

// ---------------------------------------------------------------------------
// enterFunnel
// ---------------------------------------------------------------------------

/**
 * Entra um contato em um funil, criando uma nova oportunidade ou retornando
 * a existente se já houver uma ativa para o par (contactId, funnelId).
 *
 * Comportamento (BR-FUNNEL-OPPORTUNITY §1):
 * 1. Busca funnel_entry ativa (label NOT IN ('won','lost')) para (contactId, funnelId).
 * 2. Se encontrada → retorna {entry, created: false} sem efeitos (idempotente).
 * 3. Se não encontrada → resolve estágio inicial:
 *    a. Se initialStageId informado → usa esse estágio.
 *    b. Senão → busca funnel_stage com menor position para funnelId.
 *    c. Se nenhum estágio → lança FunnelHasNoStagesError.
 * 4. INSERT em funnel_entry com label='open'.
 * 5. INSERT em funnel_entry_stage_history (from_stage_id=null, to_stage_id=initialStage).
 * 6. Emite TE-FUNNEL-ENTERED.
 *
 * INV-FUNNEL-01: unicidade de oportunidade ativa por (contact_id, funnel_id)
 * é enforçada pelo índice único parcial no DB; a verificação aqui é uma
 * camada de domínio para retorno idempotente sem depender de exceção de constraint.
 */
export async function enterFunnel(
  tx: DbTx,
  input: EnterFunnelInput,
): Promise<EnterFunnelResult> {
  const {
    contactId,
    funnelId,
    initialStageId,
    entryCampaignId,
    entryCreativeId,
    entryOrigin,
    ownerUserId,
    actorUserId,
    actorSystem,
  } = input

  // BR-FUNNEL-OPPORTUNITY §1: INV-FUNNEL-01 — no máximo 1 oportunidade ativa por par.
  // Busca entrada ativa: label NOT IN ('won','lost').
  const activeRows = await tx
    .select()
    .from(funnelEntry)
    .where(
      and(
        eq(funnelEntry.contactId, contactId),
        eq(funnelEntry.funnelId, funnelId),
        notInArray(funnelEntry.label, ['won', 'lost']),
      ),
    )

  const activeEntry = activeRows[0]

  // Idempotente: oportunidade ativa já existe → retorna sem efeitos.
  if (activeEntry) {
    return { entry: activeEntry, created: false }
  }

  // Resolver estágio inicial.
  let resolvedStageId: string

  if (initialStageId) {
    resolvedStageId = initialStageId
  } else {
    // Usa o estágio com menor position (primeiro estágio do pipeline).
    const firstStageRows = await tx
      .select()
      .from(funnelStage)
      .where(eq(funnelStage.funnelId, funnelId))
      .orderBy(asc(funnelStage.position))
      .limit(1)

    const firstStage = firstStageRows[0]
    if (!firstStage) {
      throw new FunnelHasNoStagesError(funnelId)
    }

    resolvedStageId = firstStage.id
  }

  // INSERT funnel_entry com label='open' (padrão).
  const insertedRows = await tx
    .insert(funnelEntry)
    .values({
      funnelId,
      contactId,
      currentStageId: resolvedStageId,
      ownerUserId: ownerUserId ?? null,
      label: 'open',
      entryOrigin: entryOrigin ?? null,
      entryCampaignId: entryCampaignId ?? null,
      entryCreativeId: entryCreativeId ?? null,
    })
    .returning()

  const newEntry = insertedRows[0]
  if (!newEntry) {
    throw new Error('enterFunnel: INSERT funnel_entry returned no row')
  }

  // INV-FUNNEL-03: toda mudança de current_stage_id gera linha em funnel_entry_stage_history.
  // Na entrada inicial, from_stage_id=null (sem estágio anterior).
  await tx.insert(funnelEntryStageHistory).values({
    funnelEntryId: newEntry.id,
    fromStageId: null,
    toStageId: resolvedStageId,
    changedBy: null,
    reason: 'Entrada no funil',
  })

  // TE-FUNNEL-ENTERED: emitir após todas as mutações.
  // NOTA: o schema do kind 'funnel_entered' é registrado em T-5-15 (lib/timeline/schemas/funnel-events.ts).
  const actor = actorUserId ? { actorUserId, actorSystem: null } : { actorUserId: null, actorSystem: actorSystem ?? 'MOD-FUNNEL' }
  await emitTimelineEvent(
    {
      contactId,
      kind: 'funnel_entered',
      source: 'MOD-FUNNEL',
      ...actor,
      subjectKind: 'funnel_entry',
      subjectId: newEntry.id,
      payload: {
        funnel_id: funnelId,
        funnel_entry_id: newEntry.id,
        initial_stage_id: resolvedStageId,
        entry_origin: entryOrigin ?? null,
        entry_campaign_id: entryCampaignId ?? null,
        entry_creative_id: entryCreativeId ?? null,
      },
    },
    tx,
  )

  return { entry: newEntry, created: true }
}
