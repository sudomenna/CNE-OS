import { describe, it, expect } from 'vitest'
import {
  normalizeSlug,
  validateSlug,
  ensureValidSlug,
} from '../../../lib/domain/catalog/normalize'
import { InvalidSlugError } from '../../../lib/domain/catalog/errors'

describe('INV-CATALOG-03 — normalizeSlug', () => {
  it('given camelCase string when normalizeSlug then returns kebab-case', () => {
    expect(normalizeSlug('MeuProduto')).toBe('meuproduto')
  })

  it('given string with spaces when normalizeSlug then replaces spaces with hyphens', () => {
    expect(normalizeSlug('meu produto legal')).toBe('meu-produto-legal')
  })

  it('given string with underscores when normalizeSlug then replaces underscores with hyphens', () => {
    expect(normalizeSlug('meu_produto_legal')).toBe('meu-produto-legal')
  })

  it('given string with special chars when normalizeSlug then removes them', () => {
    expect(normalizeSlug('produto@especial!')).toBe('produtoespecial')
  })

  it('given string with accented chars when normalizeSlug then removes them', () => {
    expect(normalizeSlug('curso-avançado')).toBe('curso-avanado')
  })

  it('given string with multiple consecutive hyphens when normalizeSlug then collapses to single', () => {
    expect(normalizeSlug('produto--legal---aqui')).toBe('produto-legal-aqui')
  })

  it('given string with leading and trailing hyphens when normalizeSlug then strips them', () => {
    expect(normalizeSlug('-produto-')).toBe('produto')
  })

  it('given already valid kebab-case slug when normalizeSlug then returns unchanged', () => {
    expect(normalizeSlug('curso-online-avancado')).toBe('curso-online-avancado')
  })

  it('given uppercase with underscores and spaces when normalizeSlug then produces kebab', () => {
    expect(normalizeSlug('Meu Produto_Legal')).toBe('meu-produto-legal')
  })

  it('given mix of hyphens spaces and underscores when normalizeSlug then collapses to single hyphens', () => {
    expect(normalizeSlug('produto _ legal - teste')).toBe('produto-legal-teste')
  })

  it('given string starting with number when normalizeSlug then preserves number at start', () => {
    expect(normalizeSlug('2024 curso')).toBe('2024-curso')
  })
})

describe('INV-CATALOG-03 — validateSlug', () => {
  it('given valid kebab-case slug when validateSlug then returns true', () => {
    expect(validateSlug('curso-online')).toBe(true)
  })

  it('given slug starting with number when validateSlug then returns true', () => {
    expect(validateSlug('2024-oferta')).toBe(true)
  })

  it('given single alphanumeric char when validateSlug then returns true', () => {
    expect(validateSlug('a')).toBe(true)
  })

  it('given slug with uppercase when validateSlug then returns false', () => {
    expect(validateSlug('Curso-Online')).toBe(false)
  })

  it('given slug starting with hyphen when validateSlug then returns false', () => {
    expect(validateSlug('-curso')).toBe(false)
  })

  it('given slug with spaces when validateSlug then returns false', () => {
    expect(validateSlug('curso online')).toBe(false)
  })

  it('given empty string when validateSlug then returns false', () => {
    expect(validateSlug('')).toBe(false)
  })

  it('given slug with special chars when validateSlug then returns false', () => {
    expect(validateSlug('curso@online')).toBe(false)
  })

  it('given slug with underscores when validateSlug then returns false', () => {
    expect(validateSlug('curso_online')).toBe(false)
  })
})

describe('INV-CATALOG-03 — ensureValidSlug', () => {
  it('given valid input when ensureValidSlug then returns normalized slug', () => {
    expect(ensureValidSlug('Meu Produto')).toBe('meu-produto')
  })

  it('given already valid slug when ensureValidSlug then returns it unchanged', () => {
    expect(ensureValidSlug('curso-online-2024')).toBe('curso-online-2024')
  })

  it('given input that normalizes to valid slug when ensureValidSlug then returns normalized', () => {
    expect(ensureValidSlug('  curso  avançado  ')).toBe('curso-avanado')
  })

  it('given input that normalizes to empty string when ensureValidSlug then throws InvalidSlugError', () => {
    // input com apenas chars especiais → normaliza para '' → inválido
    expect(() => ensureValidSlug('---')).toThrow(InvalidSlugError)
  })

  it('given input with only special chars when ensureValidSlug then throws InvalidSlugError', () => {
    expect(() => ensureValidSlug('@@@!!!')).toThrow(InvalidSlugError)
  })

  it('given empty string when ensureValidSlug then throws InvalidSlugError', () => {
    expect(() => ensureValidSlug('')).toThrow(InvalidSlugError)
  })

  it('given InvalidSlugError thrown it contains the original input', () => {
    let error: InvalidSlugError | null = null
    try {
      ensureValidSlug('---')
    } catch (e) {
      error = e as InvalidSlugError
    }
    expect(error).toBeInstanceOf(InvalidSlugError)
    expect(error!.slug).toBe('---')
  })
})
