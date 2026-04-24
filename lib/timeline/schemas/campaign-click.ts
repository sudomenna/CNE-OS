/**
 * MOD-CAMPAIGN — Timeline event schema: TE-CAMPAIGN-CLICK
 *
 * docs/30-contracts/03-timeline-event-catalog.md (Marketing / Funil)
 * docs/20-domain/07-campaign-creative.md §8
 *
 * Emitido via Inngest (fire-and-forget) no Route Handler /go/[slug].
 */
import { z } from 'zod'

/**
 * Payload Zod para o evento `campaign_link_clicked`.
 *
 * Alinhado ao catálogo TE-CAMPAIGN-CLICK:
 *   { campaign_id, creative_id?, trackable_link_id, utm: {...} }
 *
 * Campos extras capturados na camada de transporte (IP, UA) para análise
 * de atribuição futura (FLOW-CAMPAIGN-CLICK).
 */
export const campaignLinkClickedSchema = z.object({
  kind: z.literal('campaign_link_clicked'),

  // TE-CAMPAIGN-CLICK: obrigatório
  trackable_link_id: z.string().uuid(),
  slug: z.string().min(1),

  // utm snapshot — estrutura livre (jsonb), capturada do trackable_link.utm
  utm_snapshot: z.record(z.string(), z.unknown()),

  // context de transporte — opcionais
  ip: z.string().optional(),
  user_agent: z.string().optional(),
})

export type CampaignLinkClicked = z.infer<typeof campaignLinkClickedSchema>

/**
 * Payload-only schema for KIND_REGISTRY (no embedded `kind` field).
 * Alinhado ao catálogo TE-CAMPAIGN-CLICK:
 *   { campaign_id, creative_id?, trackable_link_id, utm: {...} }
 */
export const campaignLinkClickedPayloadSchema = z.object({
  // TE-CAMPAIGN-CLICK: campos do catálogo
  campaign_id: z.string().uuid().optional(),
  creative_id: z.string().uuid().optional(),
  trackable_link_id: z.string().uuid(),
  utm: z.record(z.string(), z.unknown()).optional(),
})

export type CampaignLinkClickedPayload = z.infer<typeof campaignLinkClickedPayloadSchema>
