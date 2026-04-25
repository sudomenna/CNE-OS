/**
 * MOD-CATALOG — Typed domain errors
 *
 * docs/20-domain/09-catalog.md
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 */

export class CatalogDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogDomainError'
  }
}

/**
 * Lançado quando um slug não bate com o padrão kebab-case obrigatório.
 * INV-CATALOG-03: product.slug é único por marca e kebab-case (CHECK no DB + índice).
 * INV-CATALOG-06: commercial_benefit.auto_tag, quando presente, é kebab-case.
 */
export class InvalidSlugError extends CatalogDomainError {
  readonly slug: string

  constructor(slug: string) {
    super(
      `slug inválido: "${slug}". Deve ser kebab-case iniciando com letra ou número (^[a-z0-9][a-z0-9-]*$).`,
    )
    this.name = 'InvalidSlugError'
    this.slug = slug
  }
}
