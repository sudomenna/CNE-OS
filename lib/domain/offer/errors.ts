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

/**
 * BR-RENEWAL E-01: Lançado quando a oferta referenciada não é do tipo 'renewal'
 * ou não possui renews_offer_id preenchido.
 *
 * docs/50-business-rules/BR-RENEWAL.md §Algoritmo passo 1
 */
export class OfferNotRenewal extends OfferDomainError {
  readonly offerId: string

  constructor(offerId: string) {
    super(
      `BR-RENEWAL E-01: offer ${offerId} is not a renewal offer — ` +
        `type must be 'renewal' and renews_offer_id must be set.`,
    )
    this.name = 'OfferNotRenewal'
    this.offerId = offerId
  }
}

/**
 * BR-RENEWAL E-02 / E-03: Lançado quando o contato não possui entitlement ativo
 * (ou dentro da janela de graça de 30 dias) proveniente da oferta original.
 * Inclui o caso de entitlement revogado por refund.
 *
 * docs/50-business-rules/BR-RENEWAL.md §Algoritmo passo 5, tabela de decisão linhas 1 e 5
 */
export class RenewalWithoutActiveEntitlement extends OfferDomainError {
  readonly contactId: string
  readonly originOfferId: string

  constructor(contactId: string, originOfferId: string) {
    super(
      `BR-RENEWAL E-02/E-03: contact ${contactId} has no active or grace-period entitlement ` +
        `from origin offer ${originOfferId} — renewal requires an active entitlement.`,
    )
    this.name = 'RenewalWithoutActiveEntitlement'
    this.contactId = contactId
    this.originOfferId = originOfferId
  }
}
