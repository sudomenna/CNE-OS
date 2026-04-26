/**
 * MOD-CHANNEL — Typed domain errors
 *
 * docs/80-roadmap/12-sprint-15-rbac-integrations.md (T-15-03)
 * ADR-10: funções de domínio lançam DomainError (ou subtipo), nunca retornam Result<T,E>
 *
 * Hierarquia:
 *   ChannelDomainError
 *     ChannelAccountNotFoundError   — NotFoundError
 *     BrandNotFoundError            — NotFoundError
 *     DuplicateChannelAccountError  — ConflictError
 *     InvalidChannelKindError       — ValidationError
 */

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------

export class ChannelDomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChannelDomainError'
  }
}

// ---------------------------------------------------------------------------
// NotFoundError
// ---------------------------------------------------------------------------

/**
 * Lançado quando o channel_account solicitado não é encontrado.
 */
export class ChannelAccountNotFoundError extends ChannelDomainError {
  readonly channelAccountId: string

  constructor(channelAccountId: string) {
    super(`channel_account ${channelAccountId} not found`)
    this.name = 'ChannelAccountNotFoundError'
    this.channelAccountId = channelAccountId
  }
}

/**
 * Lançado quando a brand referenciada não é encontrada.
 */
export class BrandNotFoundError extends ChannelDomainError {
  readonly brandId: string

  constructor(brandId: string) {
    super(`brand ${brandId} not found`)
    this.name = 'BrandNotFoundError'
    this.brandId = brandId
  }
}

// ---------------------------------------------------------------------------
// ConflictError
// ---------------------------------------------------------------------------

/**
 * Lançado quando já existe um channel_account com o mesmo
 * (brandId, channelKind, externalId).
 *
 * INV-INBOX: par (canal, marca, external_id) é único.
 */
export class DuplicateChannelAccountError extends ChannelDomainError {
  readonly brandId: string
  readonly channelKind: string
  readonly externalId: string

  constructor(brandId: string, channelKind: string, externalId: string) {
    super(
      `channel_account already exists for brand=${brandId} kind=${channelKind} externalId=${externalId}`,
    )
    this.name = 'DuplicateChannelAccountError'
    this.brandId = brandId
    this.channelKind = channelKind
    this.externalId = externalId
  }
}

// ---------------------------------------------------------------------------
// ValidationError
// ---------------------------------------------------------------------------

/**
 * Lançado quando o channelKind informado não é um valor válido do enum channel_kind.
 * docs/30-contracts/01-enums.md — channel_kind: whatsapp | instagram | email
 */
export class InvalidChannelKindError extends ChannelDomainError {
  readonly channelKind: string

  constructor(channelKind: string) {
    super(
      `invalid channel_kind '${channelKind}' — valid values: whatsapp, instagram, email`,
    )
    this.name = 'InvalidChannelKindError'
    this.channelKind = channelKind
  }
}
