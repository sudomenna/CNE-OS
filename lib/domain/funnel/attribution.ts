/**
 * MOD-FUNNEL — Attribution (T-5-16, FLOW-14)
 *
 * Resolve atribuição de entrada/conversão a partir de UTM snapshot e aplica
 * nos campos entry_campaign_id / entry_creative_id / entry_trackable_link_id
 * da funnel_entry.
 *
 * docs/20-domain/08-funnel-opportunity.md §10 cases 3,4
 * docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md §2
 *
 * ADR-10: funções públicas retornam Promise<T> e lançam DomainError em caso de
 *         erro de regra de negócio. Funções puras não têm I/O.
 * ADR-11: funções que mutam estado recebem tx como primeiro argumento.
 */
import { and, eq, sql } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import { trackableLink } from '@/lib/db/schema/campaign'
import { funnelEntry } from '@/lib/db/schema/funnel'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Snapshot de UTM recebido no clique / entrada no funil.
 * Campos alinhados com o schema gerado por generateUtm.
 */
export type UtmSnapshot = {
  utm_campaign: string
  utm_source: string
  utm_content?: string | null
}

/**
 * Resultado da resolução de atribuição.
 * null quando nenhum trackable_link bate com os UTMs fornecidos.
 */
export type AttributionResult = {
  campaign_id: string
  creative_id: string | null
  trackable_link_id: string
} | null

/**
 * Dados de atribuição de entrada a aplicar na funnel_entry.
 * Subconjunto de AttributionResult para applyEntryAttribution.
 */
export type EntryAttributionInput = {
  campaign_id: string
  creative_id: string | null
  trackable_link_id: string
}

// ---------------------------------------------------------------------------
// resolveAttribution
// ---------------------------------------------------------------------------

/**
 * Resolve atribuição de entrada a partir de um snapshot de UTM.
 *
 * Algoritmo (FLOW-14):
 * 1. Busca trackable_link cujo jsonb utm->>'utm_campaign' = utm.utm_campaign
 *    AND utm->>'utm_source' = utm.utm_source
 *    AND (utm_content ausente OR utm->>'utm_content' = utm.utm_content).
 * 2. Se encontrar → retorna { campaign_id, creative_id, trackable_link_id }.
 * 3. Se não encontrar → retorna null.
 *
 * Quando múltiplos links batem (edge case), usa o mais recente (maior createdAt).
 *
 * BR-FUNNEL-OPPORTUNITY §2: atribuição de entrada resolve campaign_id e creative_id
 * a partir do link rastreável clicado antes da entrada no funil.
 */
export async function resolveAttribution(
  tx: DbTx,
  input: UtmSnapshot,
): Promise<AttributionResult> {
  const { utm_campaign, utm_source, utm_content } = input

  // Construir condição de matching nos campos jsonb do utm snapshot.
  // trackable_link.utm é jsonb: { utm_source, utm_medium, utm_campaign, utm_content?, ... }
  // BR-FUNNEL-OPPORTUNITY §2: resolução por campos utm_campaign + utm_source + utm_content.
  const conditions = [
    // utm_campaign deve bater
    sql`${trackableLink.utm}->>'utm_campaign' = ${utm_campaign}`,
    // utm_source deve bater
    sql`${trackableLink.utm}->>'utm_source' = ${utm_source}`,
  ]

  if (utm_content != null && utm_content.trim() !== '') {
    // Se utm_content fornecido, deve bater exatamente
    conditions.push(sql`${trackableLink.utm}->>'utm_content' = ${utm_content}`)
  }

  const rows = await tx
    .select({
      id: trackableLink.id,
      campaignId: trackableLink.campaignId,
      creativeId: trackableLink.creativeId,
      createdAt: trackableLink.createdAt,
    })
    .from(trackableLink)
    .where(and(...conditions))
    .orderBy(sql`${trackableLink.createdAt} DESC`)
    .limit(1)

  const link = rows[0]
  if (!link || !link.campaignId) {
    // Sem match ou link órfão (campaignId null — SET NULL quando campaign removida)
    return null
  }

  return {
    campaign_id: link.campaignId,
    creative_id: link.creativeId ?? null,
    trackable_link_id: link.id,
  }
}

// ---------------------------------------------------------------------------
// applyEntryAttribution
// ---------------------------------------------------------------------------

/**
 * Aplica atribuição de entrada em uma funnel_entry existente.
 *
 * Atualiza os campos:
 *   entry_campaign_id, entry_creative_id, entry_trackable_link_id
 *
 * Comportamento (FLOW-14 / docs/20-domain/08-funnel-opportunity.md §10 case 3):
 * - Atualiza somente os campos de entrada (entry_*).
 * - Não toca conversion_* (preenchidos somente em markWon).
 * - Idempotente: pode ser chamado mais de uma vez; sobrescreve com os valores
 *   fornecidos (útil para re-atribuição manual).
 *
 * INV-FUNNEL-06: conversion_* somente em markWon — esta função não os toca.
 *
 * Nota: entry_trackable_link_id não é coluna explícita no schema Drizzle
 * (não está no DDL spec de 08-funnel-opportunity.md). A atribuição de link
 * rastreável é armazenada via entryOrigin (text) + entryCampaignId + entryCreativeId.
 * O trackable_link_id é persistido em entryOrigin como referência de auditoria.
 *
 * @see docs/20-domain/08-funnel-opportunity.md §3 (DDL funnel_entry)
 */
export async function applyEntryAttribution(
  tx: DbTx,
  entryId: string,
  attribution: EntryAttributionInput,
): Promise<void> {
  // BR-FUNNEL-OPPORTUNITY §2: preenche entry_campaign_id e entry_creative_id
  // a partir do link rastreável clicado na entrada do funil (FLOW-14).
  await tx
    .update(funnelEntry)
    .set({
      entryCampaignId: attribution.campaign_id,
      entryCreativeId: attribution.creative_id ?? null,
      // Persiste o trackable_link_id como referência de auditoria em entryOrigin.
      // Formato: 'trackable_link:<id>' para permitir rastreamento posterior.
      // O campo entryOrigin é text livre (docs/20-domain/08-funnel-opportunity.md §3).
      entryOrigin: `trackable_link:${attribution.trackable_link_id}`,
      updatedAt: sql`now()`,
    })
    .where(eq(funnelEntry.id, entryId))
}
