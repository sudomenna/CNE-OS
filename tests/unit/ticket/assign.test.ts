/**
 * Testes unitários — assignTicket
 *
 * docs/20-domain/06-ticket.md §3 (INV-TICKET-03, INV-TICKET-06)
 * T-3-13 — Funções de domínio ticket
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const TICKET_ID = '00000000-0000-0000-0000-000000000010'
const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const BRAND_ID = '00000000-0000-0000-0000-000000000002'
const ASSIGNED_BY_USER_ID = '00000000-0000-0000-0000-000000000099'
const TO_USER_ID = '00000000-0000-0000-0000-000000000050'
const PREV_USER_ID = '00000000-0000-0000-0000-000000000040'

// ---------------------------------------------------------------------------
// Fixture de ticket
// ---------------------------------------------------------------------------

function makeTicket(assignedUserId: string | null = null) {
  return {
    id: TICKET_ID,
    number: 1,
    contactId: CONTACT_ID,
    brandId: BRAND_ID,
    originConversationId: null,
    status: 'open',
    priority: 'medium',
    category: 'support',
    title: 'Test ticket',
    description: null,
    assignedUserId,
    openedByUserId: ASSIGNED_BY_USER_ID,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  }
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

const { assignTicket } = await import('../../../lib/domain/ticket/assign')
const { TicketNotFoundError } = await import('../../../lib/domain/ticket/errors')

// ---------------------------------------------------------------------------
// Helper: constrói tx mock para assignTicket
// ---------------------------------------------------------------------------

function buildAssignTx(currentTicket: Record<string, unknown> | null) {
  const selectResult = currentTicket ? [currentTicket] : []

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(selectResult),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue([]),
    }),
  }
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('assignTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: assign para usuário ───────────────────────────────────────────

  describe('assign.to-user', () => {
    it(
      'given unassigned ticket ' +
        'when assignTicket to toUserId ' +
        'then history created and emits ticket_assigned',
      async () => {
        const tx = buildAssignTx(makeTicket(null))

        await assignTicket(
          tx as unknown as Parameters<typeof assignTicket>[0],
          TICKET_ID,
          TO_USER_ID,
          ASSIGNED_BY_USER_ID,
        )

        // UPDATE ticket.assigned_user_id
        expect(tx.update).toHaveBeenCalledOnce()

        // INSERT to assignment_history
        expect(tx.insert).toHaveBeenCalledOnce()

        // Timeline: ticket_assigned
        expect(emitTimelineEventMock).toHaveBeenCalledOnce()
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'ticket_assigned',
            source: 'MOD-TICKET',
            actorUserId: ASSIGNED_BY_USER_ID,
            payload: expect.objectContaining({
              ticket_id: TICKET_ID,
              from_user_id: null,
              to_user_id: TO_USER_ID,
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: reassign (de usuário A para usuário B) ─────────────────────────

  describe('assign.reassign', () => {
    it(
      'given ticket already assigned to prevUser ' +
        'when assignTicket to new toUserId ' +
        'then history has from_user_id=prevUser and emits ticket_assigned',
      async () => {
        const tx = buildAssignTx(makeTicket(PREV_USER_ID))

        // Capture INSERT values
        const insertValuesMock = vi.fn().mockResolvedValue([])
        tx.insert.mockReturnValue({ values: insertValuesMock })

        await assignTicket(
          tx as unknown as Parameters<typeof assignTicket>[0],
          TICKET_ID,
          TO_USER_ID,
          ASSIGNED_BY_USER_ID,
        )

        // History should record from_user_id
        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            ticketId: TICKET_ID,
            fromUserId: PREV_USER_ID,
            toUserId: TO_USER_ID,
            assignedByUserId: ASSIGNED_BY_USER_ID,
          }),
        )
      },
    )
  })

  // ── Caso 3: unassign (toUserId=null) ──────────────────────────────────────

  describe('assign.unassign', () => {
    it(
      'given assigned ticket ' +
        'when assignTicket with toUserId=null ' +
        'then history created with to_user_id=null and emits ticket_unassigned',
      async () => {
        const tx = buildAssignTx(makeTicket(PREV_USER_ID))

        await assignTicket(
          tx as unknown as Parameters<typeof assignTicket>[0],
          TICKET_ID,
          null,
          ASSIGNED_BY_USER_ID,
        )

        // UPDATE called
        expect(tx.update).toHaveBeenCalledOnce()

        // INSERT called
        expect(tx.insert).toHaveBeenCalledOnce()

        // Timeline: ticket_unassigned (not ticket_assigned)
        expect(emitTimelineEventMock).toHaveBeenCalledOnce()
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'ticket_unassigned',
            source: 'MOD-TICKET',
            actorUserId: ASSIGNED_BY_USER_ID,
            payload: expect.objectContaining({
              ticket_id: TICKET_ID,
              from_user_id: PREV_USER_ID,
            }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 4: ticket not found ──────────────────────────────────────────────

  describe('assign.ticket-not-found', () => {
    it(
      'given non-existent ticketId ' +
        'when assignTicket ' +
        'then throws TicketNotFoundError',
      async () => {
        const tx = buildAssignTx(null)

        await expect(
          assignTicket(
            tx as unknown as Parameters<typeof assignTicket>[0],
            'non-existent-uuid',
            TO_USER_ID,
            ASSIGNED_BY_USER_ID,
          ),
        ).rejects.toThrow(TicketNotFoundError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })
})
