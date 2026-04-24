/**
 * INV-CAMPAIGN-04: UTMs geradas pelo sistema são deterministas dadas as mesmas entradas.
 * Função pura — sem I/O, sem efeitos colaterais.
 */

export type UtmContext = {
  brand: { slug: string };
  campaign: { slug: string };
  creative?: { slug: string; channel?: string };
  funnel?: { slug: string };
  /** Sobrescreve o utm_medium calculado a partir do canal do criativo. */
  mediumOverride?: string;
};

export type Utm = {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string;
  utm_term?: string;
};

/**
 * Gera os parâmetros UTM canônicos a partir do contexto de campanha/criativo/funil.
 *
 * Regras de montagem (spec §9 de 07-campaign-creative.md):
 *   utm_source   = brand.slug
 *   utm_medium   = mediumOverride ?? creative.channel ?? 'organic'
 *   utm_campaign = campaign.slug
 *   utm_content  = creative.slug   (omitido quando creative ausente)
 *   utm_term     = funnel.slug     (omitido quando funnel ausente)
 *
 * Campos com valor vazio ("") são omitidos do resultado.
 */
// INV-CAMPAIGN-04: função pura — mesmos inputs sempre produzem o mesmo output
export function generateUtm(ctx: UtmContext): Utm {
  const utm_source = ctx.brand.slug;
  const utm_campaign = ctx.campaign.slug;

  const rawMedium =
    ctx.mediumOverride ?? ctx.creative?.channel ?? "organic";
  const utm_medium = rawMedium.trim() === "" ? "organic" : rawMedium;

  const result: Utm = {
    utm_source,
    utm_medium,
    utm_campaign,
  };

  const contentSlug = ctx.creative?.slug;
  if (contentSlug !== undefined && contentSlug.trim() !== "") {
    result.utm_content = contentSlug;
  }

  const termSlug = ctx.funnel?.slug;
  if (termSlug !== undefined && termSlug.trim() !== "") {
    result.utm_term = termSlug;
  }

  return result;
}
