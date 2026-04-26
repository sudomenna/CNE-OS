/**
 * MOD-CHANNEL — Interface pública do módulo
 *
 * T-15-03
 * ADR-10: funções retornam Promise<T> e lançam ChannelDomainError.
 * ADR-11: funções mutativas recebem tx: DbTx como primeiro argumento.
 * ADR-18: credentials sempre encriptadas; decrypt restrito a adapters.
 *
 * Alinhado com docs/30-contracts/07-module-interfaces.md §MOD-CHANNEL
 * (a ser documentado em T-15-06).
 */

// Criação de channel_account
export { createChannelAccount } from './create-channel-account'
export type {
  CreateChannelAccountInput,
  CreateChannelAccountResult,
  ChannelKind,
} from './create-channel-account'

// Atualização de channel_account
export { updateChannelAccount } from './update-channel-account'
export type { UpdateChannelAccountInput } from './update-channel-account'

// Listagem por marca (somente metadados — sem credentials)
export { listChannelsByBrand } from './list-channels-by-brand'
export type { ChannelAccountListItem } from './list-channels-by-brand'

// Decriptação de credentials (restrito a adapters de integração)
export { getChannelCredentials } from './get-channel-credentials'

// Tipos compartilhados
export type { EncryptFn, DecryptFn } from './types'

// Erros
export {
  ChannelDomainError,
  ChannelAccountNotFoundError,
  BrandNotFoundError,
  DuplicateChannelAccountError,
  InvalidChannelKindError,
} from './errors'
