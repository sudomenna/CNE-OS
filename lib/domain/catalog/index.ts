/**
 * MOD-CATALOG — Interface pública do domínio de catálogo
 *
 * docs/20-domain/09-catalog.md §2
 * docs/30-contracts/07-module-interfaces.md §MOD-CATALOG
 *
 * Exporta apenas as funções e tipos que outros módulos podem consumir.
 * Funções com I/O (upsertProduct, upsertBenefit, getProduct, getCommercialBenefit)
 * serão adicionadas em T-6-04 quando as Server Actions forem implementadas.
 */

// Normalização e validação de slug
export { normalizeSlug, validateSlug, ensureValidSlug } from './normalize'

// Resolução de auto_tag para MOD-TRANSACTION
export { resolveAutoTag } from './auto-tag'
export type { AutoTagInput } from './auto-tag'

// Erros tipados
export { CatalogDomainError, InvalidSlugError } from './errors'
