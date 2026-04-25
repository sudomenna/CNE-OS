/**
 * MOD-CATALOG — Resolução de auto_tag de benefício comercial
 *
 * docs/20-domain/09-catalog.md §3.3
 * Função pura — sem I/O, sem DB.
 */

/**
 * Input mínimo necessário para resolução da auto_tag.
 * Permite passar apenas o subconjunto relevante do CommercialBenefit.
 */
export type AutoTagInput = {
  auto_tag: string | null | undefined
}

/**
 * Retorna a auto_tag do benefício se presente e não-vazia, ou null caso contrário.
 *
 * Usado por MOD-TRANSACTION para aplicar tag ao contato ao aprovar transação
 * que contém benefício com auto_tag configurada.
 *
 * docs/20-domain/09-catalog.md §3.3 (campo auto_tag)
 * FLOW-BENEFIT-AUTO-TAG
 */
export function resolveAutoTag(benefit: AutoTagInput): string | null {
  const tag = benefit.auto_tag
  if (tag === null || tag === undefined || tag.trim() === '') {
    return null
  }
  return tag
}
