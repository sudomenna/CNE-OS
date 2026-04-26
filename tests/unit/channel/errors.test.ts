/**
 * Unit tests — lib/domain/channel/errors.ts
 *
 * T-15-03
 * ADR-10: hierarquia de erros tipada
 *
 * Padrão: Given/When/Then
 */
import { describe, it, expect } from 'vitest'
import {
  ChannelDomainError,
  ChannelAccountNotFoundError,
  BrandNotFoundError,
  DuplicateChannelAccountError,
  InvalidChannelKindError,
} from '@/lib/domain/channel/errors'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChannelDomainError hierarchy', () => {
  it('ChannelAccountNotFoundError is instance of ChannelDomainError and Error', () => {
    const err = new ChannelAccountNotFoundError('id-1')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ChannelDomainError)
    expect(err).toBeInstanceOf(ChannelAccountNotFoundError)
    expect(err.name).toBe('ChannelAccountNotFoundError')
    expect(err.channelAccountId).toBe('id-1')
    expect(err.message).toContain('id-1')
  })

  it('BrandNotFoundError is instance of ChannelDomainError and Error', () => {
    const err = new BrandNotFoundError('brand-1')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ChannelDomainError)
    expect(err).toBeInstanceOf(BrandNotFoundError)
    expect(err.name).toBe('BrandNotFoundError')
    expect(err.brandId).toBe('brand-1')
    expect(err.message).toContain('brand-1')
  })

  it('DuplicateChannelAccountError is instance of ChannelDomainError and has all fields', () => {
    const err = new DuplicateChannelAccountError('brand-1', 'whatsapp', '+5511')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ChannelDomainError)
    expect(err.name).toBe('DuplicateChannelAccountError')
    expect(err.brandId).toBe('brand-1')
    expect(err.channelKind).toBe('whatsapp')
    expect(err.externalId).toBe('+5511')
    expect(err.message).toContain('brand-1')
    expect(err.message).toContain('whatsapp')
  })

  it('InvalidChannelKindError is instance of ChannelDomainError and references kind', () => {
    const err = new InvalidChannelKindError('telegram')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ChannelDomainError)
    expect(err.name).toBe('InvalidChannelKindError')
    expect(err.channelKind).toBe('telegram')
    expect(err.message).toContain('telegram')
    expect(err.message).toContain('whatsapp')
    expect(err.message).toContain('email')
  })
})
