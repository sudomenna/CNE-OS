/**
 * T-11-08 — Testes unitários: emit_timeline_event
 *
 * docs/20-domain/15-automation.md §7 Actions, §11, §13.6
 * Cobrir: emit chamado com params corretos; kind inválido retorna ok=false; eventId retornado.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const FLOW_ID = '00000000-0000-0000-0000-000000000050'
const EXEC_ID = '00000000-0000-0000-0000-000000000060'
const TE_ID = 'te-00000000-0000-0000-0000-000000000001'

// ---------------------------------------------------------------------------
// Mock emitTimelineEvent
// ---------------------------------------------------------------------------

const emitMock = vi.fn().mockResolvedValue({ id: TE_ID })

vi.mock('@/lib/timeline/emit', () => ({
  emitTimelineEvent: emitMock,
}))

// ---------------------------------------------------------------------------
// Import (após mocks declarados)
// ---------------------------------------------------------------------------

const { emitTimelineEventAction } = await import(
  '../../../../lib/domain/automation/actions/emit-timeline-event'
)

const tx = {} as never

function makeCtx() {
  return {
    subject: {
      flowId: FLOW_ID,
      executionId: EXEC_ID,
    },
    subjectKind: 'contact',
    subjectId: CONTACT_ID,
  }
}

// ===========================================================================

describe('emit_timeline_event action', () => {
  describe('given valid event_kind and emit succeeds', () => {
    it('when emitTimelineEventAction then calls emitTimelineEvent with correct params and returns eventId', async () => {
      emitMock.mockClear()
      const ctx = makeCtx()

      const result = await emitTimelineEventAction(
        { event_kind: 'automation_executed', body: { custom: 'data' } },
        ctx,
        tx,
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.output).toEqual({ eventId: TE_ID })
      }

      expect(emitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: CONTACT_ID,
          kind: 'automation_executed',
          source: 'MOD-AUTOMATION',
          payload: expect.objectContaining({
            custom: 'data',
            flow_id: FLOW_ID,
            execution_id: EXEC_ID,
          }),
        }),
        tx,
      )
    })

    it('when emitTimelineEventAction without body then still emits with context fields only', async () => {
      emitMock.mockClear()
      const ctx = makeCtx()

      const result = await emitTimelineEventAction(
        { event_kind: 'automation_executed' },
        ctx,
        tx,
      )

      expect(result.ok).toBe(true)
    })
  })

  describe('given unknown event_kind (emit throws UnknownTimelineKindError)', () => {
    it('when emitTimelineEventAction then returns ok=false with error message', async () => {
      emitMock.mockRejectedValueOnce(new Error('unknown timeline kind: bogus_kind'))

      const ctx = makeCtx()
      const result = await emitTimelineEventAction({ event_kind: 'bogus_kind' }, ctx, tx)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('unknown timeline kind')
      }
    })
  })

  describe('given DB error (non-kind error)', () => {
    it('when emitTimelineEventAction then propagates the error (for Inngest retry)', async () => {
      emitMock.mockRejectedValueOnce(new Error('DB connection refused'))

      const ctx = makeCtx()
      await expect(
        emitTimelineEventAction({ event_kind: 'automation_executed' }, ctx, tx),
      ).rejects.toThrow('DB connection refused')
    })
  })
})
