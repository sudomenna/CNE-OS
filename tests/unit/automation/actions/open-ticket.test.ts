/**
 * T-11-08 — Testes unitários: open_ticket
 *
 * docs/20-domain/15-automation.md §7 Actions, §13.6
 * Cobrir: ticket criado com campos corretos; brandId ausente retorna error;
 *         actorUserId ausente retorna error.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const BRAND_ID = '00000000-0000-0000-0000-000000000002'
const USER_ID = '00000000-0000-0000-0000-000000000099'
const TICKET_ID = '00000000-0000-0000-0000-000000000010'

// ---------------------------------------------------------------------------
// Mock MOD-TICKET.openTicket
// ---------------------------------------------------------------------------

const openTicketMock = vi.fn().mockResolvedValue({ id: TICKET_ID, number: 1 })

vi.mock('@/lib/domain/ticket/open', () => ({
  openTicket: openTicketMock,
}))

// ---------------------------------------------------------------------------
// Import (após mocks declarados)
// ---------------------------------------------------------------------------

const { openTicketAction } = await import('../../../../lib/domain/automation/actions/open-ticket')

// ---------------------------------------------------------------------------
// tx mock (não é usado por openTicketAction diretamente — apenas repassado)
// ---------------------------------------------------------------------------

const tx = {} as never

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    subject: {
      brandId: BRAND_ID,
      actorUserId: USER_ID,
      ...overrides,
    },
    subjectKind: 'contact',
    subjectId: CONTACT_ID,
  }
}

// ===========================================================================

describe('open_ticket action', () => {
  describe('given brandId not in context', () => {
    it('when openTicketAction then returns ok=false with error', async () => {
      const ctx = makeCtx({ brandId: undefined })
      const result = await openTicketAction({ title: 'Ticket teste' }, ctx, tx)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('brandId')
      }
      expect(openTicketMock).not.toHaveBeenCalled()
    })
  })

  describe('given actorUserId not in context', () => {
    it('when openTicketAction then returns ok=false with error', async () => {
      const ctx = makeCtx({ actorUserId: undefined })
      const result = await openTicketAction({ title: 'Ticket teste' }, ctx, tx)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('actorUserId')
      }
      expect(openTicketMock).not.toHaveBeenCalled()
    })
  })

  describe('given brandId and actorUserId available', () => {
    it('when openTicketAction with title then creates ticket and returns ticketId', async () => {
      openTicketMock.mockClear()
      const ctx = makeCtx()
      const result = await openTicketAction({ title: 'Problema de acesso' }, ctx, tx)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.output).toEqual({ ticketId: TICKET_ID })
      }

      expect(openTicketMock).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          contactId: CONTACT_ID,
          brandId: BRAND_ID,
          title: 'Problema de acesso',
          category: 'other',   // category padrão quando não fornecida
          openedByUserId: USER_ID,
        }),
      )
    })

    it('when openTicketAction with valid category then passes category to openTicket', async () => {
      openTicketMock.mockClear()
      const ctx = makeCtx()
      const result = await openTicketAction({ title: 'Financeiro', category: 'financial' }, ctx, tx)

      expect(result.ok).toBe(true)
      expect(openTicketMock).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ category: 'financial' }),
      )
    })

    it('when openTicketAction with invalid category then uses other fallback', async () => {
      openTicketMock.mockClear()
      const ctx = makeCtx()
      const result = await openTicketAction({ title: 'Título', category: 'invalid_cat' }, ctx, tx)

      expect(result.ok).toBe(true)
      expect(openTicketMock).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ category: 'other' }),
      )
    })
  })
})
