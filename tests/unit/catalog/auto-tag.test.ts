import { describe, it, expect } from 'vitest'
import { resolveAutoTag } from '../../../lib/domain/catalog/auto-tag'

describe('FLOW-BENEFIT-AUTO-TAG — resolveAutoTag', () => {
  it('given auto_tag present with value when resolveAutoTag then returns the tag', () => {
    expect(resolveAutoTag({ auto_tag: 'vip-bronze' })).toBe('vip-bronze')
  })

  it('given auto_tag null when resolveAutoTag then returns null', () => {
    expect(resolveAutoTag({ auto_tag: null })).toBeNull()
  })

  it('given auto_tag undefined when resolveAutoTag then returns null', () => {
    expect(resolveAutoTag({ auto_tag: undefined })).toBeNull()
  })

  it('given auto_tag empty string when resolveAutoTag then returns null', () => {
    expect(resolveAutoTag({ auto_tag: '' })).toBeNull()
  })

  it('given auto_tag whitespace-only string when resolveAutoTag then returns null', () => {
    expect(resolveAutoTag({ auto_tag: '   ' })).toBeNull()
  })

  it('given auto_tag with numeric kebab-case when resolveAutoTag then returns the tag', () => {
    expect(resolveAutoTag({ auto_tag: 'aluno-2024' })).toBe('aluno-2024')
  })

  it('given auto_tag with value that has content when resolveAutoTag then returns exact value without trimming', () => {
    // resolveAutoTag não normaliza o valor — apenas verifica presença
    expect(resolveAutoTag({ auto_tag: 'tag-com-valor' })).toBe('tag-com-valor')
  })
})
