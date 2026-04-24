/**
 * Testes unitários — openTicket
 *
 * docs/20-domain/06-ticket.md §2
 * T-3-13 — Funções de domínio ticket
 *
 * Estratégia: mockar @/lib/db/client e @/lib/timeline/emit para isolar
 * a lógica de domínio. A tx é um objeto mock que intercepta a chain Drizzle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const TICKET_ID = '00000000-0000-0000-0000-000000000010'
const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const BRAND_ID = '00000000-0000-0000-0000-000000000002'
const USER_ID = '00000000-0000-0000-0000-000000000099'
const CONV_ID = '00000000-0000-0000-0000-000000000030'

// ---------------------------------------------------------------------------
// Fixture de ticket retornado pelo INSERT
// ---------------------------------------------------------------------------

const ticketRow = {
  id: TICKET_ID,
  number: 1,
  contactId: CONTACT_ID,
  brandId: BRAND_ID,
  originConversationId: null,
  status: 'open' as const,
  priority: 'medium' as const,
  category: 'support' as const,
  title: 'Problema de acesso',
  description: null,
  assignedUserId: null,
  openedByUserId: USER_ID,
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

// ---------------------------------------------------------------------------
// Mock do emitTimelineEvent
// ---------------------------------------------------------------------------

const emitTimelineEventMock = vi.fn().mockResolvedValue({ id: 'te-1' })

vi.mock('@/lib/timeline/emit', () => ({
  emitTimelineEvent: emitTimelineEventMock,
}))

// ---------------------------------------------------------------------------
// Import dinâmico (após mocks declarados)
// ---------------------------------------------------------------------------

const { openTicket } = await import('../../../lib/domain/ticket/open')

// ---------------------------------------------------------------------------
// Helper: constrói tx mock para openTicket
// ---------------------------------------------------------------------------

function buildOpenTx(ticketInsertResult: Record<string, unknown>[] = [ticketRow]) {
  const tx = {
    insertCalls: [] as string[],
    insert: vi.fn(),
  }

  let insertCallCount = 0
  tx.insert.mockImplementation(() => {
    const callIndex = insertCallCount++
    return {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(callIndex === 0 ? ticketInsertResult : []),
      }),
    }
  })

  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('openTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('open.happy-path', () => {
    it(
      'given valid input ' +
        'when openTicket ' +
        'then returns ticket with status=open and inserts into status_history',
      async () => {
        const tx = buildOpenTx()

        const result = await openTicket(tx as unknown as Parameters<typeof openTicket>[0], {
          contactId: CONTACT_ID,
          brandId: BRAND_ID,
          category: 'support',
          priority: 'medium',
          title: 'Problema de acesso',
          openedByUserId: USER_ID,
        })

        expect(result.id).toBe(TICKET_ID)
        expect(result.status).toBe('open')
        expect(result.contactId).toBe(CONTACT_ID)

        // INSERT should have been called twice: ticket + status_history
        expect(tx.insert).toHaveBeenCalledTimes(2)

        // emitTimelineEvent should emit ticket_opened
        expect(emitTimelineEventMock).toHaveBeenCalledOnce()
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            contactId: CONTACT_ID,
            kind: 'ticket_opened',
            source: 'MOD-TICKET',
            actorUserId: USER_ID,
            subjectKind: 'ticket',
            subjectId: TICKET_ID,
            payload: expect.objectContaining({
              ticket_id: TICKET_ID,
              category: 'support',
              priority: 'medium',
            }),
          }),
          tx,
        )
      },
    )
  })

  describe('open.with-conversation', () => {
    it(
      'given originConversationId provided ' +
        'when openTicket ' +
        'then returned ticket has originConversationId set',
      async () => {
        const ticketWithConv = { ...ticketRow, originConversationId: CONV_ID }
        const tx = buildOpenTx([ticketWithConv])

        const result = await openTicket(tx as unknown as Parameters<typeof openTicket>[0], {
          contactId: CONTACT_ID,
          brandId: BRAND_ID,
          category: 'support',
          priority: 'low',
          title: 'Abertura a partir de conversa',
          openedByUserId: USER_ID,
          originConversationId: CONV_ID,
        })

        expect(result.originConversationId).toBe(CONV_ID)
        expect(emitTimelineEventMock).toHaveBeenCalledOnce()
      },
    )
  })

  describe('open.status-history-insert', () => {
    it(
      'given valid input ' +
        'when openTicket ' +
        'then INSERT to ticket_status_history has fromStatus=null and toStatus=open',
      async () => {
        const tx = buildOpenTx()

        // Capture the values passed to the second INSERT (status_history)
        const insertValuesMocks: ReturnType<typeof vi.fn>[] = []
        let insertCallCount = 0
        tx.insert.mockImplementation(() => {
          const callIndex = insertCallCount++
          const valuesMock = vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue(callIndex === 0 ? [ticketRow] : []),
          })
          insertValuesMocks.push(valuesMock)
          return { values: valuesMock }
        })

        await openTicket(tx as unknown as Parameters<typeof openTicket>[0], {
          contactId: CONTACT_ID,
          brandId: BRAND_ID,
          category: 'support',
          priority: 'medium',
          title: 'Test',
          openedByUserId: USER_ID,
        })

        // Second INSERT call (index 1) is for ticket_status_history
        const statusHistoryValues = insertValuesMocks[1]
        expect(statusHistoryValues).toHaveBeenCalledWith(
          expect.objectContaining({
            ticketId: TICKET_ID,
            fromStatus: null,
            toStatus: 'open',
            changedByUserId: USER_ID,
          }),
        )
      },
    )
  })
})
