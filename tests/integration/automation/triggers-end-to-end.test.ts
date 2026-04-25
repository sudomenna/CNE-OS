/**
 * Testes de integração — T-11-09: hook pós-emit → dispatcher de automação
 *
 * docs/20-domain/15-automation.md §7 (triggers), §2 (dispatcher)
 * docs/80-roadmap/08-sprint-11-automations.md T-11-09
 *
 * Cenários cobertos:
 *   1. TE 'funnel_stage_changed' emitido → dispatchTrigger chamado com kind 'funnel_stage_change'
 *   2. TE 'sale_approved' emitido → dispatchTrigger chamado com kind 'sale_approved'
 *   3. TE 'automation_executed' emitido → dispatchTrigger NÃO chamado (anti-loop BR-AUTOMATION-LOOP)
 *   4. TE 'user_notification' emitido → dispatchTrigger NÃO chamado (anti-loop BR-AUTOMATION-LOOP)
 *   5. TE com kind sem mapeamento (ex: 'contact_created') → dispatchTrigger NÃO chamado
 *   6. dispatchTrigger retorna executionIds → inngest.send chamado para cada um
 *   7. inngest.send falha → TE ainda emitido com sucesso (fire-and-forget)
 *
 * Estratégia:
 *   - DB mockado via vi.mock (zero I/O real)
 *   - dispatchTrigger mockado via vi.mock para isolar o hook
 *   - inngest.send mockado via vi.mock
 *   - emitTimelineEvent chamado com tx stub
 *   - Padrão Given/When/Then
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — DEVEM vir antes de qualquer import do código de produção
// vi.mock faz hoisting automático para o topo do arquivo
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/client', () => ({
  db: {
    insert: vi.fn(),
  },
}))

vi.mock('@/lib/domain/automation/dispatch', () => ({
  dispatchTrigger: vi.fn(),
}))

vi.mock('@/inngest/client', () => ({
  inngest: {
    send: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Imports após mocks
// ---------------------------------------------------------------------------

import { emitTimelineEvent } from '@/lib/timeline/emit'
import type { TimelineEventInput } from '@/lib/timeline/emit'
import { dispatchTrigger } from '@/lib/domain/automation/dispatch'
import { inngest } from '@/inngest/client'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Constantes de fixture
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const ENTRY_ID = '00000000-0000-0000-0000-000000000010'
const STAGE_FROM = '00000000-0000-0000-0000-000000000020'
const STAGE_TO = '00000000-0000-0000-0000-000000000021'
const TRANSACTION_ID = '00000000-0000-0000-0000-000000000030'
const OFFER_ID = '00000000-0000-0000-0000-000000000031'
const CONDITION_ID = '00000000-0000-0000-0000-000000000032'
const SNAPSHOT_ID = '00000000-0000-0000-0000-000000000033'
const TICKET_ID = '00000000-0000-0000-0000-000000000040'
const FLOW_ID = '00000000-0000-0000-0000-000000000050'
const EXECUTION_ID_1 = '00000000-0000-0000-0000-000000000060'
const EXECUTION_ID_2 = '00000000-0000-0000-0000-000000000061'

// Minimal TE row returned by the mocked INSERT
function makeTeRow(kind: string) {
  return {
    id: '00000000-0000-0000-0000-000000000099',
    contactId: CONTACT_ID,
    brandId: null,
    kind,
    source: 'MOD-FUNNEL',
    actorUserId: null,
    actorSystem: 'test',
    subjectKind: null,
    subjectId: null,
    payload: {},
    occurredAt: new Date('2026-01-01T00:00:00Z'),
    createdAt: new Date('2026-01-01T00:00:00Z'),
  }
}

// ---------------------------------------------------------------------------
// tx stub — simula DbTx com insert chain
// ---------------------------------------------------------------------------

function makeTxStub(kind: string) {
  const row = makeTeRow(kind)
  const returningMock = vi.fn().mockResolvedValue([row])
  const valuesMock = vi.fn().mockReturnValue({ returning: returningMock })
  const insertMock = vi.fn().mockReturnValue({ values: valuesMock })
  return {
    tx: { insert: insertMock } as unknown as DbTx,
    insertMock,
    valuesMock,
    returningMock,
    row,
  }
}

// ---------------------------------------------------------------------------
// Helpers de asserção assíncrona para fire-and-forget
//
// dispatchTrigger e inngest.send são chamados de forma void/fire-and-forget
// dentro de .then(). Precisamos dar uma "volta" no event loop para que as
// Promises resolvam antes dos asserts.
// ---------------------------------------------------------------------------

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve))
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

describe('T-11-09 — hook pós-emit → dispatcher de automação', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: dispatchTrigger retorna [] (nenhuma execution criada)
    ;(dispatchTrigger as Mock).mockResolvedValue([])
    // Default: inngest.send resolve ok
    ;(inngest.send as Mock).mockResolvedValue(undefined)
  })

  // ─── Cenário 1: funnel_stage_changed → funnel_stage_change ─────────────────

  it('1. TE funnel_stage_changed emitido → dispatchTrigger chamado com kind funnel_stage_change', async () => {
    // Given
    const { tx } = makeTxStub('funnel_stage_changed')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'funnel_stage_changed',
      source: 'MOD-FUNNEL',
      actorSystem: 'test',
      subjectKind: 'funnel_entry',
      subjectId: ENTRY_ID,
      payload: {
        entry_id: ENTRY_ID,
        from_stage_id: STAGE_FROM,
        to_stage_id: STAGE_TO,
      },
    }

    // When
    const result = await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then
    expect(result.kind).toBe('funnel_stage_changed')
    expect(dispatchTrigger as Mock).toHaveBeenCalledOnce()
    expect(dispatchTrigger as Mock).toHaveBeenCalledWith(
      'funnel_stage_change',
      expect.objectContaining({
        subjectKind: 'funnel_entry',
        subjectId: ENTRY_ID,
        data: expect.objectContaining({ contactId: CONTACT_ID }),
      }),
      tx,
    )
  })

  // ─── Cenário 2: sale_approved → sale_approved ──────────────────────────────

  it('2. TE sale_approved emitido → dispatchTrigger chamado com kind sale_approved', async () => {
    // Given
    const { tx } = makeTxStub('sale_approved')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'sale_approved',
      source: 'MOD-TRANSACTION',
      actorSystem: 'digital_guru',
      subjectKind: 'transaction',
      subjectId: TRANSACTION_ID,
      payload: {
        transaction_id: TRANSACTION_ID,
        offer_id: OFFER_ID,
        condition_id: CONDITION_ID,
        snapshot_id: SNAPSHOT_ID,
      },
    }

    // When
    await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then
    expect(dispatchTrigger as Mock).toHaveBeenCalledOnce()
    expect(dispatchTrigger as Mock).toHaveBeenCalledWith(
      'sale_approved',
      expect.objectContaining({
        subjectKind: 'transaction',
        subjectId: TRANSACTION_ID,
      }),
      tx,
    )
  })

  // ─── Cenário 3: automation_executed → NÃO dispara (anti-loop) ──────────────

  it('3. TE automation_executed emitido → dispatchTrigger NÃO chamado (BR-AUTOMATION-LOOP)', async () => {
    // Given
    const { tx } = makeTxStub('automation_executed')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'automation_executed',
      source: 'MOD-AUTOMATION',
      actorSystem: 'automation',
      payload: {
        flow_id: FLOW_ID,
        execution_id: EXECUTION_ID_1,
      },
    }

    // When
    await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then — guard anti-loop deve impedir qualquer chamada
    expect(dispatchTrigger as Mock).not.toHaveBeenCalled()
    expect(inngest.send as Mock).not.toHaveBeenCalled()
  })

  // ─── Cenário 4: user_notification → NÃO dispara (anti-loop) ────────────────

  it('4. TE user_notification emitido → dispatchTrigger NÃO chamado (BR-AUTOMATION-LOOP)', async () => {
    // Given
    const { tx } = makeTxStub('user_notification')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'user_notification',
      source: 'MOD-AUTOMATION',
      actorSystem: 'automation',
      payload: {
        user_id: '00000000-0000-0000-0000-000000000099',
        message: 'test notification',
      },
    }

    // When
    await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then
    expect(dispatchTrigger as Mock).not.toHaveBeenCalled()
    expect(inngest.send as Mock).not.toHaveBeenCalled()
  })

  // ─── Cenário 5: kind sem mapeamento → NÃO dispara ──────────────────────────

  it('5. TE com kind sem mapeamento (contact_created) → dispatchTrigger NÃO chamado', async () => {
    // Given
    const { tx } = makeTxStub('contact_created')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'contact_created',
      source: 'MOD-CONTACT',
      actorSystem: 'integration',
      payload: { origin: 'manual' },
    }

    // When
    await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then
    expect(dispatchTrigger as Mock).not.toHaveBeenCalled()
    expect(inngest.send as Mock).not.toHaveBeenCalled()
  })

  // ─── Cenário 6: dispatchTrigger retorna executionIds → inngest.send chamado ─

  it('6. dispatchTrigger retorna 2 executionIds → inngest.send chamado com ambos', async () => {
    // Given
    ;(dispatchTrigger as Mock).mockResolvedValue([EXECUTION_ID_1, EXECUTION_ID_2])
    const { tx } = makeTxStub('ticket_opened')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'ticket_opened',
      source: 'MOD-TICKET',
      actorSystem: 'test',
      subjectKind: 'ticket',
      subjectId: TICKET_ID,
      payload: {
        ticket_id: TICKET_ID,
        ticket_number: 42,
        category: 'financial',
        priority: 'high',
      },
    }

    // When
    await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then
    expect(dispatchTrigger as Mock).toHaveBeenCalledOnce()
    expect(inngest.send as Mock).toHaveBeenCalledOnce()
    expect(inngest.send as Mock).toHaveBeenCalledWith([
      { name: 'automation/run', data: { executionId: EXECUTION_ID_1 } },
      { name: 'automation/run', data: { executionId: EXECUTION_ID_2 } },
    ])
  })

  // ─── Cenário 7: inngest.send falha → TE retornado com sucesso (fire-and-forget)

  it('7. inngest.send falha → emitTimelineEvent retorna TE sem lançar erro', async () => {
    // Given — dispatch retorna 1 execution, inngest.send rejeita
    ;(dispatchTrigger as Mock).mockResolvedValue([EXECUTION_ID_1])
    ;(inngest.send as Mock).mockRejectedValue(new Error('Inngest unavailable'))
    const { tx, row } = makeTxStub('funnel_stage_changed')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'funnel_stage_changed',
      source: 'MOD-FUNNEL',
      actorSystem: 'test',
      payload: {
        entry_id: ENTRY_ID,
        from_stage_id: STAGE_FROM,
        to_stage_id: STAGE_TO,
      },
    }

    // When — não deve lançar mesmo que inngest.send rejeite
    const result = await emitTimelineEvent(input, tx)
    // Dar tempo ao .catch() do fire-and-forget para rodar
    await flushPromises()

    // Then — TE retornado normalmente; inngest.send falhou em background
    expect(result).toEqual(row)
    expect(dispatchTrigger as Mock).toHaveBeenCalledOnce()
    // inngest.send foi chamado (fire-and-forget executou), mas falhou silenciosamente
    expect(inngest.send as Mock).toHaveBeenCalledOnce()
  })

  // ─── Cenário extra: dispatchTrigger retorna [] → inngest.send NÃO chamado ───

  it('extra. dispatchTrigger retorna [] → inngest.send NÃO chamado', async () => {
    // Given — sem fluxos ativos para o kind
    ;(dispatchTrigger as Mock).mockResolvedValue([])
    const { tx } = makeTxStub('sale_approved')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'sale_approved',
      source: 'MOD-TRANSACTION',
      actorSystem: 'digital_guru',
      payload: {
        transaction_id: TRANSACTION_ID,
        offer_id: OFFER_ID,
        condition_id: CONDITION_ID,
        snapshot_id: SNAPSHOT_ID,
      },
    }

    // When
    await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then
    expect(dispatchTrigger as Mock).toHaveBeenCalledOnce()
    expect(inngest.send as Mock).not.toHaveBeenCalled()
  })

  // ─── Cenário extra: dispatchTrigger falha → TE ainda retornado ─────────────

  it('extra. dispatchTrigger falha → emitTimelineEvent retorna TE sem lançar erro', async () => {
    // Given — dispatch rejeita (ex: DB down)
    ;(dispatchTrigger as Mock).mockRejectedValue(new Error('DB error in dispatch'))
    const { tx, row } = makeTxStub('funnel_stage_changed')
    const input: TimelineEventInput = {
      contactId: CONTACT_ID,
      kind: 'funnel_stage_changed',
      source: 'MOD-FUNNEL',
      actorSystem: 'test',
      payload: {
        entry_id: ENTRY_ID,
        from_stage_id: STAGE_FROM,
        to_stage_id: STAGE_TO,
      },
    }

    // When
    const result = await emitTimelineEvent(input, tx)
    await flushPromises()

    // Then — fire-and-forget: erro em dispatch não propaga para o caller
    expect(result).toEqual(row)
    expect(dispatchTrigger as Mock).toHaveBeenCalledOnce()
    // inngest.send não foi chamado pois dispatch falhou antes do .then()
    expect(inngest.send as Mock).not.toHaveBeenCalled()
  })
})
