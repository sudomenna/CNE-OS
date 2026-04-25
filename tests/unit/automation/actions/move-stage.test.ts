/**
 * T-11-08 — Testes unitários: move_stage
 *
 * docs/20-domain/15-automation.md §7 Actions, §13.6
 * Cobrir: stage atualizado via MOD-FUNNEL.moveStage; entry não encontrada retorna error.
 */
import { describe, it, expect, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const FUNNEL_ID = '00000000-0000-0000-0000-000000000010'
const ENTRY_ID = '00000000-0000-0000-0000-000000000020'
const FROM_STAGE_ID = '00000000-0000-0000-0000-000000000030'
const TO_STAGE_ID = '00000000-0000-0000-0000-000000000031'

// ---------------------------------------------------------------------------
// Mock do MOD-FUNNEL.moveStage
// ---------------------------------------------------------------------------

const moveStageModMock = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/domain/funnel/move-stage', () => ({
  moveStage: moveStageModMock,
}))

// ---------------------------------------------------------------------------
// Import (após mocks declarados)
// ---------------------------------------------------------------------------

const { moveStageAction } = await import('../../../../lib/domain/automation/actions/move-stage')

// ---------------------------------------------------------------------------
// tx helpers
// ---------------------------------------------------------------------------

function makeTx({ entryExists = true }: { entryExists?: boolean } = {}) {
  const tx = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(
      entryExists
        ? [{ id: ENTRY_ID, currentStageId: FROM_STAGE_ID }]
        : [],
    ),
  }
  return tx
}

function makeCtx() {
  return {
    subject: { id: CONTACT_ID },
    subjectKind: 'contact',
    subjectId: CONTACT_ID,
  }
}

// ===========================================================================

describe('move_stage action', () => {
  describe('given funnel_entry not found for contact+funnel', () => {
    it('when moveStageAction then returns ok=false with error', async () => {
      const tx = makeTx({ entryExists: false })
      const result = await moveStageAction(
        { funnel_id: FUNNEL_ID, stage_id: TO_STAGE_ID },
        makeCtx(),
        tx as never,
      )

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toContain('not found')
      }
      expect(moveStageModMock).not.toHaveBeenCalled()
    })
  })

  describe('given funnel_entry exists', () => {
    it('when moveStageAction then calls MOD-FUNNEL.moveStage and returns ok=true with stage ids', async () => {
      moveStageModMock.mockClear()
      const tx = makeTx({ entryExists: true })
      const result = await moveStageAction(
        { funnel_id: FUNNEL_ID, stage_id: TO_STAGE_ID },
        makeCtx(),
        tx as never,
      )

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.output).toEqual({
          previousStageId: FROM_STAGE_ID,
          newStageId: TO_STAGE_ID,
        })
      }

      // Deve ter chamado MOD-FUNNEL.moveStage com entryId correto
      expect(moveStageModMock).toHaveBeenCalledWith(
        tx,
        ENTRY_ID,
        TO_STAGE_ID,
        'automation',
      )
    })
  })
})
