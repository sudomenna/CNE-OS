/**
 * MOD-FUNNEL — markWon
 *
 * docs/20-domain/08-funnel-opportunity.md §2, §5 INV-FUNNEL-05, INV-FUNNEL-06
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md §2, §3
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
 * Lançado quando markWon é chamado sem transactionId.
 * BR-FUNNEL-OPPORTUNITY §2 + INV-FUNNEL-05: label='won' exige transaction_id IS NOT NULL.
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md CT-FUNNEL-04
 */
export class WonRequiresTransactionError extends FunnelDomainError {
  readonly entryId: string

  constructor(entryId: string) {
    super(`markWon requires a non-empty transactionId (entry ${entryId})`)
    this.name = 'WonRequiresTransactionError'
    this.entryId = entryId
  }
}

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export type MarkWonInput = {
  /** ID da funnel_entry a marcar como won. */
  entryId: string
  /** ID da transação aprovada — obrigatório (INV-FUNNEL-05). */
  transactionId: string
  /** Conversão: origem livre (ex: 'campaign', 'checkout'). Opcional. */
  conversionOrigin?: string | null
  /** ID da campanha que gerou a conversão (INV-FUNNEL-06). Opcional. */
  conversionCampaignId?: string | null
  /** ID do criativo que gerou a conversão (INV-FUNNEL-06). Opcional. */
  conversionCreativeId?: string | null
  /** Usuário que acionou (null = sistema/automação). */
  actorUserId?: string | null
  /** Sistema que acionou. */
  actorSystem?: string | null
}

// ---------------------------------------------------------------------------
// markWon
// ---------------------------------------------------------------------------

/**
 * Marca uma oportunidade como ganha, vinculando a transação aprovada.
 *
 * Comportamento (BR-FUNNEL-OPPORTUNITY §2):
 * 1. Valida que transactionId não é vazio → WonRequiresTransactionError.
 * 2. Carrega funnel_entry pelo entryId → FunnelEntryNotFoundError se ausente.
 * 3. Se label já é 'won' e transactionId é o mesmo → idempotente (no-op).
 * 4. Se label já é 'won' com transactionId diferente → FunnelEntryTerminalError.
 * 5. Se label é 'lost' → FunnelEntryTerminalError.
 * 6. UPDATE funnel_entry: label='won', transaction_id, conversion_*.
 * 7. Emite TE-OPPORTUNITY-WON.
 *
 * INV-FUNNEL-05: label='won' exige transaction_id IS NOT NULL.
 * INV-FUNNEL-06: conversion_* só preenchido quando label transita para 'won'.
 * BR-FUNNEL-OPPORTUNITY §2: idempotente (2x com mesmo transactionId = no-op).
 */
export async function markWon(tx: DbTx, input: MarkWonInput): Promise<void> {
  const {
    entryId,
    transactionId,
    conversionOrigin,
    conversionCampaignId,
    conversionCreativeId,
    actorUserId,
    actorSystem,
  } = input

  // BR-FUNNEL-OPPORTUNITY §2 + INV-FUNNEL-05: transactionId é obrigatório.
  if (!transactionId || transactionId.trim() === '') {
    throw new WonRequiresTransactionError(entryId)
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

  // BR-FUNNEL-OPPORTUNITY §2: idempotente — mesma transação em entry já 'won' = no-op.
  if (entry.label === 'won' && entry.transactionId === transactionId) {
    return
  }

  // Terminais: 'won' com transação diferente ou 'lost' → erro.
  if (entry.label === 'won' || entry.label === 'lost') {
    throw new FunnelEntryTerminalError(entryId, entry.label)
  }

  // UPDATE funnel_entry: label='won' + campos de conversão (INV-FUNNEL-06).
  await tx
    .update(funnelEntry)
    .set({
      label: 'won',
      transactionId,
      conversionOrigin: conversionOrigin ?? null,
      conversionCampaignId: conversionCampaignId ?? null,
      conversionCreativeId: conversionCreativeId ?? null,
      updatedAt: sql`now()`,
    })
    .where(eq(funnelEntry.id, entryId))

  // TE-OPPORTUNITY-WON: emitir após todas as mutações.
  // NOTA: o schema do kind 'opportunity_won' é registrado em T-5-15.
  const actor = actorUserId
    ? { actorUserId, actorSystem: null }
    : { actorUserId: null, actorSystem: actorSystem ?? 'MOD-FUNNEL' }

  await emitTimelineEvent(
    {
      contactId: entry.contactId,
      kind: 'opportunity_won',
      source: 'MOD-FUNNEL',
      ...actor,
      subjectKind: 'funnel_entry',
      subjectId: entryId,
      payload: {
        funnel_id: entry.funnelId,
        funnel_entry_id: entryId,
        transaction_id: transactionId,
        conversion_origin: conversionOrigin ?? null,
        conversion_campaign_id: conversionCampaignId ?? null,
        conversion_creative_id: conversionCreativeId ?? null,
      },
    },
    tx,
  )
}
