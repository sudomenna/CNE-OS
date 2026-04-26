/**
 * MOD-CAMPAIGN / FLOW-14 — Inngest function: processamento de clique em link rastreável
 *
 * Evento: 'campaign/link.clicked'
 * Payload:
 *   {
 *     trackableLinkId: string        // UUID do trackable_link clicado
 *     campaignId?: string            // UUID da campanha (nullable — SET NULL ao arquivar)
 *     creativeId?: string            // UUID do criativo (nullable)
 *     utmSnapshot: Record<string, unknown>  // snapshot das UTMs no momento do clique
 *     contactId?: string             // UUID do contato identificado (ausente = anônimo)
 *     sessionId?: string             // ID de sessão anônima (obrigatório se contactId ausente)
 *     ip?: string                    // IP do visitante (capturado pela edge function)
 *     userAgent?: string             // User-Agent do visitante
 *   }
 *
 * Fluxo:
 *   1. Se contactId presente (clique identificado):
 *      - Emite TE-CAMPAIGN-CLICK via emitTimelineEvent com kind 'campaign_link_clicked'
 *   2. Se contactId ausente (clique anônimo):
 *      - INSERT em trackable_link_click_anonymous com sessionId
 *      - Não emite timeline event (será emitido retroativamente em E-03 quando identificado)
 *
 * docs/60-flows/14-campaign-attribution.md §Clique passos 2–3
 * docs/20-domain/07-campaign-creative.md §8
 * docs/30-contracts/03-timeline-event-catalog.md TE-CAMPAIGN-CLICK
 */
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { trackableLinkClickAnonymous } from '@/lib/db/schema/campaign'
import { emitTimelineEvent } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const campaignLinkClicked = inngest.createFunction(
  {
    id: 'campaign-link-clicked',
    name: 'Campaign: process link click',
    retries: 3,
  },
  { event: 'campaign/link.clicked' as const },
  async ({ event, step }) => {
    const {
      trackableLinkId,
      campaignId,
      creativeId,
      utmSnapshot,
      contactId,
      sessionId,
      ip,
      userAgent,
    } = event.data as {
      trackableLinkId: string
      campaignId?: string
      creativeId?: string
      utmSnapshot: Record<string, unknown>
      contactId?: string
      sessionId?: string
      ip?: string
      userAgent?: string
    }

    if (contactId) {
      // ── Clique identificado: emitir TE-CAMPAIGN-CLICK ──────────────────
      // docs/60-flows/14-campaign-attribution.md passo 2 (contactId conhecido)
      // FLOW-14: emite com source='MOD-CAMPAIGN', actorSystem='redirector'
      await step.run('emit-campaign-click-timeline', async () => {
        await emitTimelineEvent({
          contactId,
          kind: 'campaign_link_clicked',
          source: 'MOD-CAMPAIGN',
          actorSystem: 'redirector',
          subjectKind: 'trackable_link',
          subjectId: trackableLinkId,
          payload: {
            trackable_link_id: trackableLinkId,
            campaign_id: campaignId,
            creative_id: creativeId,
            utm: utmSnapshot,
          },
        })
      })

      return { identified: true, contactId, trackableLinkId }
    }

    // ── Clique anônimo: gravar em trackable_link_click_anonymous ─────────
    // docs/60-flows/14-campaign-attribution.md passo 2 (anônimo)
    // FLOW-14 E-03: será resolvido retroativamente se contato for identificado na sessão
    await step.run('insert-anonymous-click', async () => {
      if (!sessionId) {
        // Sem sessionId não é possível resolver retroativamente — logar e sair
        console.warn('[campaign-link-clicked] anonymous click without sessionId', {
          trackableLinkId,
        })
        return
      }

      await db
        .insert(trackableLinkClickAnonymous)
        .values({
          trackableLinkId,
          sessionId,
          utmSnapshot: utmSnapshot ?? {},
          ip: ip ?? null,
          userAgent: userAgent ?? null,
        })
        .onConflictDoNothing() // idempotência: uq_anon_click_session_link
    })

    return { identified: false, trackableLinkId }
  },
)
