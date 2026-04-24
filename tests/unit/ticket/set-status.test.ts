/**
 * Testes unitários — setTicketStatus
 *
 * docs/20-domain/06-ticket.md §6 — matriz de transições
 * T-3-13 — Funções de domínio ticket
 *
 * Cobre os 6 casos mínimos exigidos pelo critério de aceite:
 *  1. open → resolved       (status atualizado, resolved_at preenchido)
 *  2. open → waiting_reply  (válido)
 *  3. resolved → open       (reabertura válida)
 *  4. cancelled → resolved  (lança InvalidTicketTransitionError)
 *  5. waiting_reply → cancelled (válido)
 *  6. resolved → waiting_reply  (lança InvalidTicketTransitionError — extra da doc)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const TICKET_ID = '00000000-0000-0000-0000-000000000010'
const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const BRAND_ID = '00000000-0000-0000-0000-000000000002'
const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000099'

// ---------------------------------------------------------------------------
// Factory: constrói ticket fixture com status dado
// ---------------------------------------------------------------------------

function makeTicket(status: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id: TICKET_ID,
    number: 1,
    contactId: CONTACT_ID,
    brandId: BRAND_ID,
    originConversationId: null,
    status,
    priority: 'medium',
    category: 'support',
    title: 'Test ticket',
    description: null,
    assignedUserId: null,
    openedByUserId: ACTOR_USER_ID,
    resolvedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...extra,
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

const { setTicketStatus } = await import('../../../lib/domain/ticket/set-status')
const { InvalidTicketTransitionError, TicketNotFoundError } =
  await import('../../../lib/domain/ticket/errors')

// ---------------------------------------------------------------------------
// Helper: constrói tx mock para setTicketStatus
// ---------------------------------------------------------------------------

function buildSetStatusTx(currentTicket: Record<string, unknown> | null, updatedTicket?: Record<string, unknown>) {
  const selectResult = currentTicket ? [currentTicket] : []
  const updateResult = updatedTicket ? [updatedTicket] : currentTicket ? [currentTicket] : []

  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(selectResult),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue(updateResult),
        }),
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

describe('setTicketStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: open → resolved ───────────────────────────────────────────────

  describe('transition.open-to-resolved', () => {
    it(
      'given ticket with status=open ' +
        'when setTicketStatus to resolved ' +
        'then status updated and emits ticket_resolved',
      async () => {
        const current = makeTicket('open')
        const updated = makeTicket('resolved', { resolvedAt: new Date() })
        const tx = buildSetStatusTx(current, updated)

        const result = await setTicketStatus(
          tx as unknown as Parameters<typeof setTicketStatus>[0],
          TICKET_ID,
          'resolved',
          ACTOR_USER_ID,
          'Questão resolvida',
        )

        expect(result.status).toBe('resolved')

        // UPDATE must have been called
        expect(tx.update).toHaveBeenCalledOnce()

        // INSERT to status_history
        expect(tx.insert).toHaveBeenCalledOnce()

        // Timeline: ticket_resolved
        expect(emitTimelineEventMock).toHaveBeenCalledOnce()
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'ticket_resolved',
            source: 'MOD-TICKET',
            actorUserId: ACTOR_USER_ID,
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: open → waiting_reply ─────────────────────────────────────────

  describe('transition.open-to-waiting-reply', () => {
    it(
      'given ticket with status=open ' +
        'when setTicketStatus to waiting_reply ' +
        'then valid transition — emits ticket_status_changed',
      async () => {
        const current = makeTicket('open')
        const updated = makeTicket('waiting_reply')
        const tx = buildSetStatusTx(current, updated)

        const result = await setTicketStatus(
          tx as unknown as Parameters<typeof setTicketStatus>[0],
          TICKET_ID,
          'waiting_reply',
          ACTOR_USER_ID,
        )

        expect(result.status).toBe('waiting_reply')
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'ticket_status_changed' }),
          tx,
        )
      },
    )
  })

  // ── Caso 3: resolved → open (reabertura) ─────────────────────────────────

  describe('transition.resolved-to-open', () => {
    it(
      'given ticket with status=resolved ' +
        'when setTicketStatus to open ' +
        'then valid reopening — emits ticket_reopened',
      async () => {
        const current = makeTicket('resolved', { resolvedAt: new Date() })
        const updated = makeTicket('open')
        const tx = buildSetStatusTx(current, updated)

        const result = await setTicketStatus(
          tx as unknown as Parameters<typeof setTicketStatus>[0],
          TICKET_ID,
          'open',
          ACTOR_USER_ID,
          'cliente solicitou retomar',
        )

        expect(result.status).toBe('open')
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'ticket_reopened',
            source: 'MOD-TICKET',
            payload: expect.objectContaining({ from_status: 'resolved' }),
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 4: cancelled → resolved (INVÁLIDO) ───────────────────────────────

  describe('transition.cancelled-to-resolved-invalid', () => {
    it(
      'given ticket with status=cancelled ' +
        'when setTicketStatus to resolved ' +
        'then throws InvalidTicketTransitionError',
      async () => {
        const current = makeTicket('cancelled')
        const tx = buildSetStatusTx(current)

        await expect(
          setTicketStatus(
            tx as unknown as Parameters<typeof setTicketStatus>[0],
            TICKET_ID,
            'resolved',
            ACTOR_USER_ID,
          ),
        ).rejects.toThrow(InvalidTicketTransitionError)

        // No UPDATE should have been called
        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: waiting_reply → cancelled ────────────────────────────────────

  describe('transition.waiting-reply-to-cancelled', () => {
    it(
      'given ticket with status=waiting_reply ' +
        'when setTicketStatus to cancelled ' +
        'then valid transition — emits ticket_status_changed',
      async () => {
        const current = makeTicket('waiting_reply')
        const updated = makeTicket('cancelled')
        const tx = buildSetStatusTx(current, updated)

        const result = await setTicketStatus(
          tx as unknown as Parameters<typeof setTicketStatus>[0],
          TICKET_ID,
          'cancelled',
          ACTOR_USER_ID,
          'Solicitante cancelou',
        )

        expect(result.status).toBe('cancelled')
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({ kind: 'ticket_status_changed' }),
          tx,
        )
      },
    )
  })

  // ── Caso 6: resolved → waiting_reply (INVÁLIDO) ───────────────────────────

  describe('transition.resolved-to-waiting-reply-invalid', () => {
    it(
      'given ticket with status=resolved ' +
        'when setTicketStatus to waiting_reply ' +
        'then throws InvalidTicketTransitionError',
      async () => {
        const current = makeTicket('resolved', { resolvedAt: new Date() })
        const tx = buildSetStatusTx(current)

        await expect(
          setTicketStatus(
            tx as unknown as Parameters<typeof setTicketStatus>[0],
            TICKET_ID,
            'waiting_reply',
            ACTOR_USER_ID,
          ),
        ).rejects.toThrow(InvalidTicketTransitionError)

        expect(tx.update).not.toHaveBeenCalled()
        expect(emitTimelineEventMock).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso extra: cancelled → in_progress (INVÁLIDO) ────────────────────────

  describe('transition.cancelled-is-terminal', () => {
    it(
      'given ticket with status=cancelled ' +
        'when setTicketStatus to in_progress ' +
        'then throws InvalidTicketTransitionError',
      async () => {
        const current = makeTicket('cancelled')
        const tx = buildSetStatusTx(current)

        await expect(
          setTicketStatus(
            tx as unknown as Parameters<typeof setTicketStatus>[0],
            TICKET_ID,
            'in_progress',
            ACTOR_USER_ID,
          ),
        ).rejects.toThrow(InvalidTicketTransitionError)
      },
    )
  })

  // ── Caso extra: ticket not found ─────────────────────────────────────────

  describe('transition.ticket-not-found', () => {
    it(
      'given non-existent ticketId ' +
        'when setTicketStatus ' +
        'then throws TicketNotFoundError',
      async () => {
        const tx = buildSetStatusTx(null)

        await expect(
          setTicketStatus(
            tx as unknown as Parameters<typeof setTicketStatus>[0],
            'non-existent-uuid',
            'resolved',
            ACTOR_USER_ID,
          ),
        ).rejects.toThrow(TicketNotFoundError)
      },
    )
  })

  // ── Caso extra: cancelled → open (reabertura válida) ─────────────────────

  describe('transition.cancelled-to-open-reopen', () => {
    it(
      'given ticket with status=cancelled ' +
        'when setTicketStatus to open ' +
        'then valid reopening — emits ticket_reopened',
      async () => {
        const current = makeTicket('cancelled')
        const updated = makeTicket('open')
        const tx = buildSetStatusTx(current, updated)

        const result = await setTicketStatus(
          tx as unknown as Parameters<typeof setTicketStatus>[0],
          TICKET_ID,
          'open',
          ACTOR_USER_ID,
          'Reabertura por solicitação',
        )

        expect(result.status).toBe('open')
        expect(emitTimelineEventMock).toHaveBeenCalledWith(
          expect.objectContaining({
            kind: 'ticket_reopened',
            payload: expect.objectContaining({ from_status: 'cancelled' }),
          }),
          tx,
        )
      },
    )
  })
})
