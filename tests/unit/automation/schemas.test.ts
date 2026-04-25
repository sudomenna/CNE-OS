/**
 * T-11-13 — Testes unitários dos schemas Zod de condição, trigger e action
 *
 * INV-AUTOMATION-04: actionParamsSchema.parse() rejeita antes de persistir.
 * Todos os ramos de cada discriminated union são cobertos.
 */
import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { conditionExprSchema } from '@/lib/domain/automation/schemas/condition'
import { triggerFilterSchema } from '@/lib/domain/automation/schemas/trigger'
import { actionParamsSchema } from '@/lib/domain/automation/schemas/action'

// ===========================================================================
// conditionExprSchema
// ===========================================================================

describe('conditionExprSchema', () => {
  // --- operadores de comparação (folha) ---

  it('given op eq with string right when parse then returns typed object', () => {
    const result = conditionExprSchema.parse({
      op: 'eq',
      left: '$contact.classification',
      right: 'lead',
    })
    expect(result).toMatchObject({ op: 'eq', left: '$contact.classification', right: 'lead' })
  })

  it('given op eq with number right when parse then accepts', () => {
    const result = conditionExprSchema.parse({ op: 'eq', left: '$score', right: 42 })
    expect(result).toMatchObject({ op: 'eq', left: '$score', right: 42 })
  })

  it('given op eq with null right when parse then accepts', () => {
    const result = conditionExprSchema.parse({ op: 'eq', left: '$x', right: null })
    expect(result).toMatchObject({ op: 'eq', left: '$x', right: null })
  })

  it('given op neq when parse then returns typed object', () => {
    const result = conditionExprSchema.parse({ op: 'neq', left: '$status', right: 'blocked' })
    expect(result).toMatchObject({ op: 'neq', left: '$status', right: 'blocked' })
  })

  it('given op gte when parse then accepts', () => {
    const result = conditionExprSchema.parse({ op: 'gte', left: '$score', right: 20 })
    expect(result).toMatchObject({ op: 'gte', left: '$score', right: 20 })
  })

  it('given op lte when parse then accepts', () => {
    const result = conditionExprSchema.parse({ op: 'lte', left: '$amount', right: 500 })
    expect(result).toMatchObject({ op: 'lte', left: '$amount', right: 500 })
  })

  it('given op gt when parse then accepts', () => {
    const result = conditionExprSchema.parse({ op: 'gt', left: '$attempts', right: 0 })
    expect(result).toMatchObject({ op: 'gt', left: '$attempts', right: 0 })
  })

  it('given op lt when parse then accepts', () => {
    const result = conditionExprSchema.parse({ op: 'lt', left: '$age', right: 30 })
    expect(result).toMatchObject({ op: 'lt', left: '$age', right: 30 })
  })

  it('given op in when parse then accepts array of values', () => {
    const result = conditionExprSchema.parse({
      op: 'in',
      left: '$status',
      values: ['active', 'lead'],
    })
    expect(result).toMatchObject({ op: 'in', left: '$status', values: ['active', 'lead'] })
  })

  it('given op in with empty values array when parse then throws ZodError', () => {
    expect(() =>
      conditionExprSchema.parse({ op: 'in', left: '$x', values: [] }),
    ).toThrow(ZodError)
  })

  it('given op contains when parse then accepts', () => {
    const result = conditionExprSchema.parse({
      op: 'contains',
      left: '$contact.name',
      value: 'Silva',
    })
    expect(result).toMatchObject({ op: 'contains', left: '$contact.name', value: 'Silva' })
  })

  it('given op has_tag when parse then accepts tag string', () => {
    const result = conditionExprSchema.parse({ op: 'has_tag', tag: 'vip' })
    expect(result).toMatchObject({ op: 'has_tag', tag: 'vip' })
  })

  it('given op has_tag with empty tag when parse then throws ZodError', () => {
    expect(() => conditionExprSchema.parse({ op: 'has_tag', tag: '' })).toThrow(ZodError)
  })

  // --- operadores lógicos (recursivos) ---

  it('given op and with children when parse then accepts nested expression', () => {
    const result = conditionExprSchema.parse({
      op: 'and',
      children: [
        { op: 'eq', left: '$contact.classification', right: 'lead' },
        { op: 'gte', left: '$score', right: 20 },
      ],
    })
    expect(result).toMatchObject({ op: 'and' })
  })

  it('given op and with empty children when parse then throws ZodError', () => {
    expect(() => conditionExprSchema.parse({ op: 'and', children: [] })).toThrow(ZodError)
  })

  it('given op or with children when parse then accepts', () => {
    const result = conditionExprSchema.parse({
      op: 'or',
      children: [
        { op: 'has_tag', tag: 'vip' },
        { op: 'eq', left: '$status', right: 'active' },
      ],
    })
    expect(result).toMatchObject({ op: 'or' })
  })

  it('given op not with child when parse then accepts', () => {
    const result = conditionExprSchema.parse({
      op: 'not',
      child: { op: 'has_tag', tag: 'blocked' },
    })
    expect(result).toMatchObject({ op: 'not' })
  })

  it('given deeply nested and/or/not expression when parse then succeeds', () => {
    const expr = {
      op: 'and',
      children: [
        {
          op: 'or',
          children: [
            { op: 'eq', left: '$a', right: 1 },
            { op: 'not', child: { op: 'has_tag', tag: 'x' } },
          ],
        },
        { op: 'gte', left: '$score', right: 5 },
      ],
    }
    expect(() => conditionExprSchema.parse(expr)).not.toThrow()
  })

  it('given unknown op when parse then throws ZodError', () => {
    expect(() =>
      conditionExprSchema.parse({ op: 'regex', left: '$x', right: 'foo' }),
    ).toThrow(ZodError)
  })

  it('given eq missing left when parse then throws ZodError', () => {
    expect(() => conditionExprSchema.parse({ op: 'eq', right: 'x' })).toThrow(ZodError)
  })
})

// ===========================================================================
// triggerFilterSchema
// ===========================================================================

describe('triggerFilterSchema', () => {
  it('given kind funnel_enter without funnel_id when parse then accepts', () => {
    const result = triggerFilterSchema.parse({ kind: 'funnel_enter' })
    expect(result.kind).toBe('funnel_enter')
  })

  it('given kind funnel_enter with valid funnel_id when parse then accepts', () => {
    const result = triggerFilterSchema.parse({
      kind: 'funnel_enter',
      funnel_id: '00000000-0000-0000-0000-000000000001',
    })
    expect(result.kind).toBe('funnel_enter')
  })

  it('given kind funnel_enter with invalid uuid funnel_id when parse then throws ZodError', () => {
    expect(() =>
      triggerFilterSchema.parse({ kind: 'funnel_enter', funnel_id: 'not-a-uuid' }),
    ).toThrow(ZodError)
  })

  it('given kind funnel_stage_change with all optional fields when parse then accepts', () => {
    const result = triggerFilterSchema.parse({
      kind: 'funnel_stage_change',
      funnel_id: '00000000-0000-0000-0000-000000000002',
      from_stage: 'prospecto',
      to_stage: 'qualificado',
    })
    expect(result.kind).toBe('funnel_stage_change')
  })

  it('given kind funnel_stage_change without optional fields when parse then accepts', () => {
    const result = triggerFilterSchema.parse({ kind: 'funnel_stage_change' })
    expect(result.kind).toBe('funnel_stage_change')
  })

  it('given kind new_message with valid channel when parse then accepts', () => {
    const result = triggerFilterSchema.parse({ kind: 'new_message', channel: 'whatsapp' })
    expect(result.kind).toBe('new_message')
  })

  it('given kind new_message with invalid channel when parse then throws ZodError', () => {
    expect(() =>
      triggerFilterSchema.parse({ kind: 'new_message', channel: 'sms' }),
    ).toThrow(ZodError)
  })

  it('given kind new_message without channel when parse then accepts', () => {
    const result = triggerFilterSchema.parse({ kind: 'new_message' })
    expect(result.kind).toBe('new_message')
  })

  it('given kind checkout_abandoned with offer_id when parse then accepts', () => {
    const result = triggerFilterSchema.parse({
      kind: 'checkout_abandoned',
      offer_id: '00000000-0000-0000-0000-000000000003',
    })
    expect(result.kind).toBe('checkout_abandoned')
  })

  it('given kind sale_approved without filter when parse then accepts', () => {
    const result = triggerFilterSchema.parse({ kind: 'sale_approved' })
    expect(result.kind).toBe('sale_approved')
  })

  it('given kind ticket_opened with category when parse then accepts', () => {
    const result = triggerFilterSchema.parse({ kind: 'ticket_opened', category: 'support' })
    expect(result.kind).toBe('ticket_opened')
  })

  it('given kind brevo_event with event_name when parse then accepts', () => {
    const result = triggerFilterSchema.parse({ kind: 'brevo_event', event_name: 'click' })
    expect(result.kind).toBe('brevo_event')
  })

  it('given kind integration_event with event_type when parse then accepts', () => {
    const result = triggerFilterSchema.parse({
      kind: 'integration_event',
      event_type: 'order.created',
    })
    expect(result.kind).toBe('integration_event')
  })

  it('given unknown kind when parse then throws ZodError', () => {
    expect(() =>
      triggerFilterSchema.parse({ kind: 'unknown_trigger' }),
    ).toThrow(ZodError)
  })
})

// ===========================================================================
// actionParamsSchema — INV-AUTOMATION-04
// ===========================================================================

describe('actionParamsSchema (INV-AUTOMATION-04)', () => {
  // apply_tag

  it('given kind apply_tag with tag when parse then returns params', () => {
    const result = actionParamsSchema.parse({ kind: 'apply_tag', tag: 'vip' })
    expect(result).toMatchObject({ kind: 'apply_tag', tag: 'vip' })
  })

  it('given kind apply_tag without tag when parse then throws ZodError', () => {
    expect(() => actionParamsSchema.parse({ kind: 'apply_tag' })).toThrow(ZodError)
  })

  it('given kind apply_tag with empty tag when parse then throws ZodError', () => {
    expect(() => actionParamsSchema.parse({ kind: 'apply_tag', tag: '' })).toThrow(ZodError)
  })

  // move_stage

  it('given kind move_stage with funnel_id and stage_id when parse then accepts', () => {
    const result = actionParamsSchema.parse({
      kind: 'move_stage',
      funnel_id: '00000000-0000-0000-0000-000000000010',
      stage_id: '00000000-0000-0000-0000-000000000011',
    })
    expect(result).toMatchObject({ kind: 'move_stage' })
  })

  it('given kind move_stage without stage_id when parse then throws ZodError', () => {
    expect(() =>
      actionParamsSchema.parse({
        kind: 'move_stage',
        funnel_id: '00000000-0000-0000-0000-000000000010',
      }),
    ).toThrow(ZodError)
  })

  it('given kind move_stage with invalid uuid when parse then throws ZodError', () => {
    expect(() =>
      actionParamsSchema.parse({ kind: 'move_stage', funnel_id: 'bad', stage_id: 'bad' }),
    ).toThrow(ZodError)
  })

  // open_ticket

  it('given kind open_ticket with title when parse then accepts', () => {
    const result = actionParamsSchema.parse({ kind: 'open_ticket', title: 'Dúvida de acesso' })
    expect(result).toMatchObject({ kind: 'open_ticket', title: 'Dúvida de acesso' })
  })

  it('given kind open_ticket with title and category when parse then accepts', () => {
    const result = actionParamsSchema.parse({
      kind: 'open_ticket',
      title: 'Problema financeiro',
      category: 'financial',
    })
    expect(result).toMatchObject({ kind: 'open_ticket', category: 'financial' })
  })

  it('given kind open_ticket without title when parse then throws ZodError', () => {
    expect(() => actionParamsSchema.parse({ kind: 'open_ticket' })).toThrow(ZodError)
  })

  it('given kind open_ticket with empty title when parse then throws ZodError', () => {
    expect(() => actionParamsSchema.parse({ kind: 'open_ticket', title: '' })).toThrow(ZodError)
  })

  // notify_user

  it('given kind notify_user with user_id and message when parse then accepts', () => {
    const result = actionParamsSchema.parse({
      kind: 'notify_user',
      user_id: '00000000-0000-0000-0000-000000000020',
      message: 'Novo lead chegou',
    })
    expect(result).toMatchObject({ kind: 'notify_user' })
  })

  it('given kind notify_user without message when parse then throws ZodError', () => {
    expect(() =>
      actionParamsSchema.parse({
        kind: 'notify_user',
        user_id: '00000000-0000-0000-0000-000000000020',
      }),
    ).toThrow(ZodError)
  })

  it('given kind notify_user with invalid user_id when parse then throws ZodError', () => {
    expect(() =>
      actionParamsSchema.parse({ kind: 'notify_user', user_id: 'not-uuid', message: 'hi' }),
    ).toThrow(ZodError)
  })

  // emit_timeline_event

  it('given kind emit_timeline_event with event_kind when parse then accepts', () => {
    const result = actionParamsSchema.parse({
      kind: 'emit_timeline_event',
      event_kind: 'te_automation_executed',
    })
    expect(result).toMatchObject({ kind: 'emit_timeline_event', event_kind: 'te_automation_executed' })
  })

  it('given kind emit_timeline_event with body when parse then accepts', () => {
    const result = actionParamsSchema.parse({
      kind: 'emit_timeline_event',
      event_kind: 'te_custom',
      body: { foo: 'bar', count: 1 },
    })
    expect(result).toMatchObject({ kind: 'emit_timeline_event', body: { foo: 'bar', count: 1 } })
  })

  it('given kind emit_timeline_event without event_kind when parse then throws ZodError', () => {
    expect(() => actionParamsSchema.parse({ kind: 'emit_timeline_event' })).toThrow(ZodError)
  })

  // send_external

  it('given kind send_external with url when parse then accepts', () => {
    const result = actionParamsSchema.parse({
      kind: 'send_external',
      url: 'https://hooks.example.com/notify',
    })
    expect(result).toMatchObject({ kind: 'send_external', url: 'https://hooks.example.com/notify' })
  })

  it('given kind send_external with url method and payload when parse then accepts', () => {
    const result = actionParamsSchema.parse({
      kind: 'send_external',
      url: 'https://hooks.example.com/notify',
      method: 'POST',
      payload: { event: 'sale' },
    })
    expect(result).toMatchObject({ kind: 'send_external', method: 'POST' })
  })

  it('given kind send_external without url when parse then throws ZodError', () => {
    expect(() => actionParamsSchema.parse({ kind: 'send_external' })).toThrow(ZodError)
  })

  it('given kind send_external with invalid url when parse then throws ZodError', () => {
    expect(() =>
      actionParamsSchema.parse({ kind: 'send_external', url: 'not-a-url' }),
    ).toThrow(ZodError)
  })

  it('given kind send_external with invalid method when parse then throws ZodError', () => {
    expect(() =>
      actionParamsSchema.parse({
        kind: 'send_external',
        url: 'https://example.com',
        method: 'DELETE',
      }),
    ).toThrow(ZodError)
  })

  // discriminated union — unknown kind

  it('given unknown action kind when parse then throws ZodError', () => {
    expect(() =>
      actionParamsSchema.parse({ kind: 'unknown_action', tag: 'x' }),
    ).toThrow(ZodError)
  })
})
