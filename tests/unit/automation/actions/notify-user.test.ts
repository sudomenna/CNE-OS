/**
 * T-11-08 — Testes unitários: notify_user
 *
 * docs/20-domain/15-automation.md §7 Actions, §13.6
 * Cobrir: timeline event inserido com campos corretos; retorna { notified: true }.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const USER_ID = '00000000-0000-0000-0000-000000000099'
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

const { notifyUser } = await import('../../../../lib/domain/automation/actions/notify-user')

const tx = {} as never

function makeCtx(overrides: Partial<{ flowId: string; executionId: string }> = {}) {
  return {
    subject: {
      flowId: overrides.flowId,
      executionId: overrides.executionId,
    },
    subjectKind: 'contact',
    subjectId: CONTACT_ID,
  }
}

// ===========================================================================

describe('notify_user action', () => {
  describe('given valid params and context', () => {
    it('when notifyUser then emits timeline event with kind user_notification and returns notified=true', async () => {
      emitMock.mockClear()
      const ctx = makeCtx({ flowId: FLOW_ID, executionId: EXEC_ID })

      const result = await notifyUser({ user_id: USER_ID, message: 'Novo lead chegou' }, ctx, tx)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.output).toEqual({ notified: true })
      }

      expect(emitMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: CONTACT_ID,
          kind: 'user_notification',
          source: 'MOD-AUTOMATION',
          payload: expect.objectContaining({
            user_id: USER_ID,
            message: 'Novo lead chegou',
            flow_id: FLOW_ID,
            execution_id: EXEC_ID,
          }),
        }),
        tx,
      )
    })

    it('when notifyUser without flowId then still emits with undefined flow_id', async () => {
      emitMock.mockClear()
      const ctx = makeCtx()

      const result = await notifyUser({ user_id: USER_ID, message: 'Mensagem' }, ctx, tx)

      expect(result.ok).toBe(true)
      expect(emitMock).toHaveBeenCalledOnce()
    })
  })
})
