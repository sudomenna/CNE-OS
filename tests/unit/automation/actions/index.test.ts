/**
 * T-11-08 — Testes unitários: executeAction dispatcher
 *
 * docs/20-domain/15-automation.md §7 Actions
 * Cobrir: kind desconhecido; params inválidos; dispatch correto para cada kind.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks individuais das actions
// ---------------------------------------------------------------------------

const applyTagMock = vi.fn().mockResolvedValue({ ok: true, output: { tag: 'vip', applied: true } })
const moveStageActionMock = vi.fn().mockResolvedValue({ ok: true, output: { previousStageId: 'a', newStageId: 'b' } })
const openTicketActionMock = vi.fn().mockResolvedValue({ ok: true, output: { ticketId: 't-1' } })
const notifyUserMock = vi.fn().mockResolvedValue({ ok: true, output: { notified: true } })
const emitTimelineEventActionMock = vi.fn().mockResolvedValue({ ok: true, output: { eventId: 'e-1' } })
const sendExternalMock = vi.fn().mockResolvedValue({ ok: true, output: { status: 200 } })

vi.mock('../../../../lib/domain/automation/actions/apply-tag', () => ({
  applyTag: applyTagMock,
}))
vi.mock('../../../../lib/domain/automation/actions/move-stage', () => ({
  moveStageAction: moveStageActionMock,
}))
vi.mock('../../../../lib/domain/automation/actions/open-ticket', () => ({
  openTicketAction: openTicketActionMock,
}))
vi.mock('../../../../lib/domain/automation/actions/notify-user', () => ({
  notifyUser: notifyUserMock,
}))
vi.mock('../../../../lib/domain/automation/actions/emit-timeline-event', () => ({
  emitTimelineEventAction: emitTimelineEventActionMock,
}))
vi.mock('../../../../lib/domain/automation/actions/send-external', () => ({
  sendExternal: sendExternalMock,
}))

// ---------------------------------------------------------------------------
// Import após mocks
// ---------------------------------------------------------------------------

const { executeAction } = await import('../../../../lib/domain/automation/actions/index')

const tx = {} as never
const ctx = {
  subject: {},
  subjectKind: 'contact',
  subjectId: '00000000-0000-0000-0000-000000000001',
}

const UUID = '00000000-0000-0000-0000-000000000099'

// ===========================================================================

describe('executeAction dispatcher', () => {
  describe('given unknown action kind', () => {
    it('when executeAction then returns ok=false with unknown action kind', async () => {
      const result = await executeAction('fly_to_moon', {}, ctx, tx)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('invalid params for action')
      }
    })
  })

  describe('given apply_tag with missing tag', () => {
    it('when executeAction then returns ok=false with validation error', async () => {
      const result = await executeAction('apply_tag', {}, ctx, tx)
      expect(result.ok).toBe(false)
    })
  })

  describe('given apply_tag with valid params', () => {
    it('when executeAction then delegates to applyTag and returns result', async () => {
      const result = await executeAction('apply_tag', { tag: 'vip' }, ctx, tx)
      expect(result.ok).toBe(true)
      expect(applyTagMock).toHaveBeenCalledWith({ tag: 'vip' }, ctx, tx)
    })
  })

  describe('given move_stage with valid params', () => {
    it('when executeAction then delegates to moveStageAction', async () => {
      const result = await executeAction(
        'move_stage',
        { funnel_id: UUID, stage_id: UUID },
        ctx,
        tx,
      )
      expect(result.ok).toBe(true)
      expect(moveStageActionMock).toHaveBeenCalledWith(
        { funnel_id: UUID, stage_id: UUID },
        ctx,
        tx,
      )
    })
  })

  describe('given open_ticket with valid params', () => {
    it('when executeAction then delegates to openTicketAction', async () => {
      const result = await executeAction('open_ticket', { title: 'Título' }, ctx, tx)
      expect(result.ok).toBe(true)
      expect(openTicketActionMock).toHaveBeenCalledWith(
        { title: 'Título', category: undefined },
        ctx,
        tx,
      )
    })
  })

  describe('given notify_user with valid params', () => {
    it('when executeAction then delegates to notifyUser', async () => {
      const result = await executeAction(
        'notify_user',
        { user_id: UUID, message: 'Olá' },
        ctx,
        tx,
      )
      expect(result.ok).toBe(true)
      expect(notifyUserMock).toHaveBeenCalledWith(
        { user_id: UUID, message: 'Olá' },
        ctx,
        tx,
      )
    })
  })

  describe('given emit_timeline_event with valid params', () => {
    it('when executeAction then delegates to emitTimelineEventAction', async () => {
      const result = await executeAction(
        'emit_timeline_event',
        { event_kind: 'automation_executed' },
        ctx,
        tx,
      )
      expect(result.ok).toBe(true)
      expect(emitTimelineEventActionMock).toHaveBeenCalledWith(
        { event_kind: 'automation_executed', body: undefined },
        ctx,
        tx,
      )
    })
  })

  describe('given send_external with valid params', () => {
    it('when executeAction then delegates to sendExternal', async () => {
      const result = await executeAction(
        'send_external',
        { url: 'https://example.com/hook' },
        ctx,
        tx,
      )
      expect(result.ok).toBe(true)
      expect(sendExternalMock).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com/hook' }),
        ctx,
        tx,
      )
    })
  })

  describe('given send_external with invalid url', () => {
    it('when executeAction then returns ok=false with validation error', async () => {
      const result = await executeAction('send_external', { url: 'not-a-url' }, ctx, tx)
      expect(result.ok).toBe(false)
    })
  })
})
