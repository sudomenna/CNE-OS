/**
 * MOD-OFFER — Typed domain errors
 *
 * docs/20-domain/10-offer-engine.md
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 */

export class OfferDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfferDomainError'
  }
}

/**
 * Lançado quando a linha offer_sales_counter não existe para o offerId informado.
 * Isso significa que a oferta foi criada sem o seed trigger, ou o offerId é inválido.
 */
export class OfferCounterNotFoundError extends OfferDomainError {
  readonly offerId: string

  constructor(offerId: string) {
    super(
      `offer_sales_counter row not found for offer ${offerId} — counter must be seeded at offer creation`,
    )
    this.name = 'OfferCounterNotFoundError'
    this.offerId = offerId
  }
}

/**
 * INV-OFFER-03: Lançado quando se tenta alterar issuing_legal_entity_id de uma oferta
 * que já possui ao menos uma transação com status 'approved' ou 'pending'.
 *
 * docs/20-domain/10-offer-engine.md §5 (INV-OFFER-03)
 */
export class OfferLegalEntityImmutableError extends OfferDomainError {
  readonly offerId: string

  constructor(offerId: string) {
    super(
      `INV-OFFER-03: cannot change issuing_legal_entity_id on offer ${offerId} — ` +
        `at least one transaction with status approved or pending exists for this offer.`,
    )
    this.name = 'OfferLegalEntityImmutableError'
    this.offerId = offerId
  }
}
