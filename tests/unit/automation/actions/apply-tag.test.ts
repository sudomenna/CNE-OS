/**
 * T-11-08 — Testes unitários: apply_tag
 *
 * docs/20-domain/15-automation.md §7 Actions, §13.6
 * Cobrir: contact existe + tag adicionada; tag duplicada não duplica; subject não é contact.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const TAG = 'vip'

// ---------------------------------------------------------------------------
// Mock da chain Drizzle (tx)
// ---------------------------------------------------------------------------

function makeTx({
  contactExists = true,
  tagAlreadyExists = false,
}: {
  contactExists?: boolean
  tagAlreadyExists?: boolean
} = {}) {
  const insertMock = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) })

  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(),
    insert: insertMock,
  }

  // Primeira chamada select: busca contact
  // Segunda chamada select: busca contactTag existente
  let callCount = 0
  tx.limit.mockImplementation(() => {
    callCount++
    if (callCount === 1) {
      return Promise.resolve(contactExists ? [{ id: CONTACT_ID }] : [])
    }
    return Promise.resolve(tagAlreadyExists ? [{ id: 'tag-1' }] : [])
  })

  return tx
}

// ---------------------------------------------------------------------------
// Import (após mocks inline de tx)
// ---------------------------------------------------------------------------

const { applyTag } = await import('../../../../lib/domain/automation/actions/apply-tag')

// ---------------------------------------------------------------------------
// RunFlowContext helpers
// ---------------------------------------------------------------------------

function makeContactCtx(subjectId = CONTACT_ID) {
  return {
    subject: { id: subjectId },
    subjectKind: 'contact',
    subjectId,
  }
}

function makeNonContactCtx() {
  return {
    subject: { id: 'tx-1' },
    subjectKind: 'transaction',
    subjectId: 'tx-1',
  }
}

// ===========================================================================

describe('apply_tag action', () => {
  describe('given subject is not a contact', () => {
    it('when applyTag then returns ok=false with error message', async () => {
      const tx = makeTx()
      const result = await applyTag({ tag: TAG }, makeNonContactCtx(), tx as never)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('not a contact')
      }
    })
  })

  describe('given contact does not exist', () => {
    it('when applyTag then returns ok=false with not found error', async () => {
      const tx = makeTx({ contactExists: false })
      const result = await applyTag({ tag: TAG }, makeContactCtx(), tx as never)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('not found')
      }
    })
  })

  describe('given contact exists and tag does not exist', () => {
    it('when applyTag then inserts tag and returns ok=true with applied=true', async () => {
      const tx = makeTx({ contactExists: true, tagAlreadyExists: false })
      const result = await applyTag({ tag: TAG }, makeContactCtx(), tx as never)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.output).toEqual({ tag: TAG, applied: true })
      }
      // Verifica que insert foi chamado
      expect(tx.insert).toHaveBeenCalled()
    })
  })

  describe('given contact exists and tag already exists', () => {
    it('when applyTag then does NOT insert and returns ok=true with applied=false', async () => {
      const tx = makeTx({ contactExists: true, tagAlreadyExists: true })
      const result = await applyTag({ tag: TAG }, makeContactCtx(), tx as never)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.output).toEqual({ tag: TAG, applied: false })
      }
      // Não deve inserir tag duplicada
      expect(tx.insert).not.toHaveBeenCalled()
    })
  })
})
