/**
 * Unit tests — timeline KIND_REGISTRY payload schemas
 *
 * docs/30-contracts/03-timeline-event-catalog.md
 * docs/20-domain/04-timeline.md INV-TIMELINE-04
 * T-3-15
 *
 * For every kind registered: valid payload passes, invalid payload fails.
 */
import { describe, it, expect } from 'vitest'
import { KIND_REGISTRY } from '@/lib/timeline/schemas/index'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const UUID_A = '00000000-0000-0000-0000-000000000001'
const UUID_B = '00000000-0000-0000-0000-000000000002'

// ---------------------------------------------------------------------------
// Helper: asserts a payload passes and fails schema for a given kind
// ---------------------------------------------------------------------------
function valid(kind: string, payload: Record<string, unknown>) {
  const entry = KIND_REGISTRY[kind]
  if (!entry) throw new Error(`KIND_REGISTRY has no entry for kind "${kind}"`)
  const result = entry.schema.safeParse(payload)
  expect(result.success, `Expected "${kind}" to accept payload: ${JSON.stringify(payload)} — errors: ${
    result.success ? '' : JSON.stringify((result as { error: unknown }).error)
  }`).toBe(true)
}

function invalid(kind: string, payload: Record<string, unknown>) {
  const entry = KIND_REGISTRY[kind]
  if (!entry) throw new Error(`KIND_REGISTRY has no entry for kind "${kind}"`)
  const result = entry.schema.safeParse(payload)
  expect(result.success, `Expected "${kind}" to REJECT payload: ${JSON.stringify(payload)}`).toBe(false)
}

// ---------------------------------------------------------------------------
// Contact / identity
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — contact_created schema', () => {
  it('given valid origin when parsed then success', () => {
    valid('contact_created', { origin: 'manual' })
    valid('contact_created', { origin: 'checkout', source_ref: 'ref-123' })
  })
  it('given unknown origin when parsed then fails', () => {
    invalid('contact_created', { origin: 'unknown_origin' })
    invalid('contact_created', {})
  })
})

describe('BR-TIMELINE — contact_updated schema', () => {
  it('given valid field/from/to when parsed then success', () => {
    valid('contact_updated', { field: 'full_name', from: 'Alice', to: 'Bob' })
  })
  it('given missing field when parsed then fails', () => {
    invalid('contact_updated', { from: 'Alice', to: 'Bob' })
    invalid('contact_updated', {})
  })
})

describe('BR-TIMELINE — contact_tag_added schema', () => {
  it('given valid tag and source when parsed then success', () => {
    valid('contact_tag_added', { tag: 'vip', source: 'manual' })
    valid('contact_tag_added', { tag: 'student', source: 'benefit' })
  })
  it('given invalid source enum when parsed then fails', () => {
    invalid('contact_tag_added', { tag: 'vip', source: 'unknown' })
    invalid('contact_tag_added', { tag: 'vip' })
  })
})

describe('BR-TIMELINE — contact_tag_removed schema', () => {
  it('given valid tag when parsed then success', () => {
    valid('contact_tag_removed', { tag: 'vip' })
  })
  it('given missing tag when parsed then fails', () => {
    invalid('contact_tag_removed', {})
  })
})

describe('BR-TIMELINE — contact_blacklisted schema', () => {
  it('given optional fields when parsed then success', () => {
    valid('contact_blacklisted', { reason: 'spam' })
    valid('contact_blacklisted', {})
  })
})

describe('BR-TIMELINE — contact_issue_opened schema', () => {
  it('given valid issue fields when parsed then success', () => {
    valid('contact_issue_opened', { issue_id: UUID_A, kind: 'duplicate', detail: 'dup' })
  })
  it('given missing issue_id when parsed then fails', () => {
    invalid('contact_issue_opened', { kind: 'duplicate', detail: 'dup' })
  })
})

describe('BR-TIMELINE — contact_issue_resolved schema', () => {
  it('given valid resolution when parsed then success', () => {
    valid('contact_issue_resolved', { issue_id: UUID_A, resolution: 'resolved' })
  })
  it('given missing resolution when parsed then fails', () => {
    invalid('contact_issue_resolved', { issue_id: UUID_A })
  })
})

describe('BR-TIMELINE — contact_merged schema', () => {
  it('given valid UUIDs and reason when parsed then success', () => {
    valid('contact_merged', { merged_into: UUID_A, merged_from: UUID_B, reason: 'duplicate' })
  })
  it('given non-UUID merged_into when parsed then fails', () => {
    invalid('contact_merged', { merged_into: 'not-a-uuid', merged_from: UUID_B, reason: 'dup' })
  })
  it('given missing reason when parsed then fails', () => {
    invalid('contact_merged', { merged_into: UUID_A, merged_from: UUID_B })
  })
})

describe('BR-TIMELINE — contact_unmerged schema', () => {
  it('given valid UUIDs when parsed then success', () => {
    valid('contact_unmerged', {
      merge_id: UUID_A,
      principal_contact_id: UUID_A,
      secondary_contact_id: UUID_B,
      reason: 'mistake',
    })
  })
  it('given missing merge_id when parsed then fails', () => {
    invalid('contact_unmerged', {
      principal_contact_id: UUID_A,
      secondary_contact_id: UUID_B,
      reason: 'mistake',
    })
  })
})

// ---------------------------------------------------------------------------
// Transaction
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — sale_approved schema', () => {
  it('given valid transaction fields when parsed then success', () => {
    valid('sale_approved', { transaction_id: UUID_A, amount: 99.9, offer_id: UUID_B })
  })
  it('given negative amount when parsed then fails', () => {
    invalid('sale_approved', { transaction_id: UUID_A, amount: -50, offer_id: UUID_B })
  })
  it('given missing offer_id when parsed then fails', () => {
    invalid('sale_approved', { transaction_id: UUID_A, amount: 50 })
  })
})

// ---------------------------------------------------------------------------
// Inbox — messages
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — message_inbound schema', () => {
  it('given valid inbound message when parsed then success', () => {
    valid('message_inbound', {
      conversation_id: UUID_A,
      direction: 'inbound',
      body_preview: 'Hello!',
    })
  })
  it('given invalid direction when parsed then fails', () => {
    invalid('message_inbound', {
      conversation_id: UUID_A,
      direction: 'unknown',
      body_preview: 'Hello!',
    })
  })
  it('given body_preview exceeding 200 chars when parsed then fails', () => {
    invalid('message_inbound', {
      conversation_id: UUID_A,
      direction: 'inbound',
      body_preview: 'x'.repeat(201),
    })
  })
  it('given missing conversation_id when parsed then fails', () => {
    invalid('message_inbound', { direction: 'inbound', body_preview: 'Hi' })
  })
})

describe('BR-TIMELINE — message_outbound schema', () => {
  it('given valid outbound message when parsed then success', () => {
    valid('message_outbound', {
      conversation_id: UUID_A,
      direction: 'outbound',
      body_preview: 'Reply sent',
    })
  })
  it('given invalid direction when parsed then fails', () => {
    invalid('message_outbound', {
      conversation_id: UUID_A,
      direction: 'fax',
      body_preview: 'Reply',
    })
  })
})

// ---------------------------------------------------------------------------
// Inbox — conversation events
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — conversation_opened schema', () => {
  it('given valid IDs when parsed then success', () => {
    valid('conversation_opened', {
      conversation_id: UUID_A,
      channel_account_id: UUID_B,
    })
  })
  it('given missing channel_account_id when parsed then fails', () => {
    invalid('conversation_opened', { conversation_id: UUID_A })
  })
  it('given non-UUID conversation_id when parsed then fails', () => {
    invalid('conversation_opened', {
      conversation_id: 'bad-id',
      channel_account_id: UUID_B,
    })
  })
})

describe('BR-TIMELINE — conversation_reopened schema', () => {
  it('given valid UUID when parsed then success', () => {
    valid('conversation_reopened', { conversation_id: UUID_A })
  })
  it('given missing conversation_id when parsed then fails', () => {
    invalid('conversation_reopened', {})
  })
})

describe('BR-TIMELINE — conversation_closed schema', () => {
  it('given valid UUID when parsed then success', () => {
    valid('conversation_closed', { conversation_id: UUID_A })
    valid('conversation_closed', { conversation_id: UUID_A, reason: 'resolved' })
  })
  it('given missing conversation_id when parsed then fails', () => {
    invalid('conversation_closed', { reason: 'resolved' })
  })
})

describe('BR-TIMELINE — conversation_assigned schema', () => {
  it('given valid IDs when parsed then success', () => {
    valid('conversation_assigned', { conversation_id: UUID_A, to_user_id: UUID_B })
  })
  it('given missing to_user_id when parsed then fails', () => {
    invalid('conversation_assigned', { conversation_id: UUID_A })
  })
  it('given non-UUID to_user_id when parsed then fails', () => {
    invalid('conversation_assigned', { conversation_id: UUID_A, to_user_id: 'not-uuid' })
  })
})

describe('BR-TIMELINE — conversation_unassigned schema', () => {
  it('given valid UUID when parsed then success', () => {
    valid('conversation_unassigned', { conversation_id: UUID_A })
  })
  it('given missing conversation_id when parsed then fails', () => {
    invalid('conversation_unassigned', {})
  })
})

describe('BR-TIMELINE — conversation_status_changed schema', () => {
  it('given valid statuses when parsed then success', () => {
    valid('conversation_status_changed', {
      conversation_id: UUID_A,
      from_status: 'open',
      to_status: 'closed',
    })
  })
  it('given missing to_status when parsed then fails', () => {
    invalid('conversation_status_changed', {
      conversation_id: UUID_A,
      from_status: 'open',
    })
  })
})

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — ticket_opened schema', () => {
  it('given valid fields when parsed then success', () => {
    valid('ticket_opened', {
      ticket_id: UUID_A,
      ticket_number: 42,
      category: 'suporte',
      priority: 'high',
    })
  })
  it('given non-positive ticket_number when parsed then fails', () => {
    invalid('ticket_opened', {
      ticket_id: UUID_A,
      ticket_number: 0,
      category: 'suporte',
      priority: 'high',
    })
  })
  it('given missing category when parsed then fails', () => {
    invalid('ticket_opened', {
      ticket_id: UUID_A,
      ticket_number: 1,
      priority: 'high',
    })
  })
})

describe('BR-TIMELINE — ticket_status_changed schema', () => {
  it('given valid status transition when parsed then success', () => {
    valid('ticket_status_changed', {
      ticket_id: UUID_A,
      from_status: 'open',
      to_status: 'in_progress',
    })
    valid('ticket_status_changed', {
      ticket_id: UUID_A,
      from_status: 'open',
      to_status: 'resolved',
      reason: 'fixed',
    })
  })
  it('given missing from_status when parsed then fails', () => {
    invalid('ticket_status_changed', { ticket_id: UUID_A, to_status: 'resolved' })
  })
})

describe('BR-TIMELINE — ticket_resolved schema', () => {
  it('given valid fields when parsed then success', () => {
    valid('ticket_resolved', { ticket_id: UUID_A, from_status: 'in_progress' })
    valid('ticket_resolved', { ticket_id: UUID_A, from_status: 'open', reason: 'done' })
  })
  it('given missing from_status when parsed then fails', () => {
    invalid('ticket_resolved', { ticket_id: UUID_A })
  })
})

describe('BR-TIMELINE — ticket_reopened schema', () => {
  it('given valid fields when parsed then success', () => {
    valid('ticket_reopened', { ticket_id: UUID_A, from_status: 'resolved' })
  })
  it('given missing ticket_id when parsed then fails', () => {
    invalid('ticket_reopened', { from_status: 'resolved' })
  })
})

describe('BR-TIMELINE — ticket_assigned schema', () => {
  it('given valid IDs when parsed then success', () => {
    valid('ticket_assigned', {
      ticket_id: UUID_A,
      from_user_id: null,
      to_user_id: UUID_B,
    })
    valid('ticket_assigned', {
      ticket_id: UUID_A,
      from_user_id: UUID_B,
      to_user_id: UUID_A,
    })
  })
  it('given missing to_user_id when parsed then fails', () => {
    invalid('ticket_assigned', { ticket_id: UUID_A, from_user_id: null })
  })
  it('given non-UUID to_user_id when parsed then fails', () => {
    invalid('ticket_assigned', {
      ticket_id: UUID_A,
      from_user_id: null,
      to_user_id: 'not-uuid',
    })
  })
})

describe('BR-TIMELINE — ticket_unassigned schema', () => {
  it('given valid fields when parsed then success', () => {
    valid('ticket_unassigned', { ticket_id: UUID_A, from_user_id: UUID_B })
    valid('ticket_unassigned', { ticket_id: UUID_A, from_user_id: null })
  })
  it('given missing ticket_id when parsed then fails', () => {
    invalid('ticket_unassigned', { from_user_id: UUID_B })
  })
})

// ---------------------------------------------------------------------------
// Campaign (T-5-15)
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — campaign_link_clicked schema', () => {
  it('given valid trackable_link_id when parsed then success', () => {
    valid('campaign_link_clicked', {
      trackable_link_id: UUID_A,
    })
  })
  it('given full payload with optional fields when parsed then success', () => {
    valid('campaign_link_clicked', {
      campaign_id: UUID_A,
      creative_id: UUID_B,
      trackable_link_id: UUID_A,
      utm: { utm_source: 'instagram', utm_medium: 'social' },
    })
  })
  it('given missing trackable_link_id when parsed then fails', () => {
    invalid('campaign_link_clicked', {
      campaign_id: UUID_A,
    })
  })
  it('given non-UUID trackable_link_id when parsed then fails', () => {
    invalid('campaign_link_clicked', {
      trackable_link_id: 'not-a-uuid',
    })
  })
})

// ---------------------------------------------------------------------------
// Funnel / Opportunity (T-5-15)
// ---------------------------------------------------------------------------
describe('BR-TIMELINE — funnel_entered schema', () => {
  it('given required IDs when parsed then success', () => {
    valid('funnel_entered', {
      funnel_id: UUID_A,
      entry_id: UUID_B,
      stage_id: UUID_A,
    })
  })
  it('given all fields including optionals when parsed then success', () => {
    valid('funnel_entered', {
      funnel_id: UUID_A,
      entry_id: UUID_B,
      stage_id: UUID_A,
      entry_creative_id: UUID_B,
      entry_campaign_id: UUID_A,
    })
  })
  it('given missing stage_id when parsed then fails', () => {
    invalid('funnel_entered', {
      funnel_id: UUID_A,
      entry_id: UUID_B,
    })
  })
  it('given non-UUID funnel_id when parsed then fails', () => {
    invalid('funnel_entered', {
      funnel_id: 'not-uuid',
      entry_id: UUID_B,
      stage_id: UUID_A,
    })
  })
})

describe('BR-TIMELINE — funnel_stage_changed schema', () => {
  it('given required IDs when parsed then success', () => {
    valid('funnel_stage_changed', {
      entry_id: UUID_A,
      from_stage_id: UUID_B,
      to_stage_id: UUID_A,
    })
  })
  it('given optional score when parsed then success', () => {
    valid('funnel_stage_changed', {
      entry_id: UUID_A,
      from_stage_id: UUID_B,
      to_stage_id: UUID_A,
      score: 42,
    })
  })
  it('given missing from_stage_id when parsed then fails', () => {
    invalid('funnel_stage_changed', {
      entry_id: UUID_A,
      to_stage_id: UUID_A,
    })
  })
  it('given non-UUID to_stage_id when parsed then fails', () => {
    invalid('funnel_stage_changed', {
      entry_id: UUID_A,
      from_stage_id: UUID_B,
      to_stage_id: 'bad',
    })
  })
})

describe('BR-TIMELINE — opportunity_label_changed schema', () => {
  it('given valid label transition when parsed then success', () => {
    valid('opportunity_label_changed', {
      entry_id: UUID_A,
      from: 'open',
      to: 'negotiating',
    })
  })
  it('given won/lost transition when parsed then success', () => {
    valid('opportunity_label_changed', {
      entry_id: UUID_A,
      from: 'negotiating',
      to: 'won',
    })
  })
  it('given invalid label enum value when parsed then fails', () => {
    invalid('opportunity_label_changed', {
      entry_id: UUID_A,
      from: 'open',
      to: 'invalid_label',
    })
  })
  it('given missing entry_id when parsed then fails', () => {
    invalid('opportunity_label_changed', {
      from: 'open',
      to: 'won',
    })
  })
})

describe('BR-TIMELINE — opportunity_won schema', () => {
  it('given valid entry_id and transaction_id when parsed then success', () => {
    valid('opportunity_won', {
      entry_id: UUID_A,
      transaction_id: UUID_B,
    })
  })
  it('given missing transaction_id when parsed then fails', () => {
    invalid('opportunity_won', {
      entry_id: UUID_A,
    })
  })
  it('given non-UUID entry_id when parsed then fails', () => {
    invalid('opportunity_won', {
      entry_id: 'not-uuid',
      transaction_id: UUID_B,
    })
  })
})

describe('BR-TIMELINE — opportunity_lost schema', () => {
  it('given valid entry_id and reason when parsed then success', () => {
    valid('opportunity_lost', {
      entry_id: UUID_A,
      reason: 'no budget',
    })
  })
  it('given missing reason when parsed then fails', () => {
    invalid('opportunity_lost', {
      entry_id: UUID_A,
    })
  })
  it('given empty string reason when parsed then fails', () => {
    invalid('opportunity_lost', {
      entry_id: UUID_A,
      reason: '',
    })
  })
  it('given missing entry_id when parsed then fails', () => {
    invalid('opportunity_lost', {
      reason: 'no budget',
    })
  })
})

// ---------------------------------------------------------------------------
// Registry coverage — every registered kind must have a source
// ---------------------------------------------------------------------------
describe('KIND_REGISTRY — structural invariants', () => {
  it('given KIND_REGISTRY when iterated then every entry has source and schema', () => {
    for (const [kind, entry] of Object.entries(KIND_REGISTRY)) {
      expect(entry.source, `Kind "${kind}" is missing source`).toBeTruthy()
      expect(entry.schema, `Kind "${kind}" is missing schema`).toBeDefined()
    }
  })

  const expectedKinds = [
    // contact
    'contact_created', 'contact_updated', 'contact_tag_added', 'contact_tag_removed',
    'contact_blacklisted', 'contact_issue_opened', 'contact_issue_resolved',
    'contact_merged', 'contact_unmerged',
    // transaction
    'sale_approved',
    // inbox messages
    'message_inbound', 'message_outbound',
    // inbox conversation
    'conversation_opened', 'conversation_reopened', 'conversation_closed',
    'conversation_assigned', 'conversation_unassigned', 'conversation_status_changed',
    // ticket
    'ticket_opened', 'ticket_status_changed', 'ticket_resolved',
    'ticket_reopened', 'ticket_assigned', 'ticket_unassigned',
    // campaign
    'campaign_link_clicked',
    // funnel / opportunity
    'funnel_entered', 'funnel_stage_changed', 'opportunity_label_changed',
    'opportunity_won', 'opportunity_lost',
  ]

  it('given KIND_REGISTRY when checked then all expected kinds are present', () => {
    for (const kind of expectedKinds) {
      expect(KIND_REGISTRY[kind], `KIND_REGISTRY is missing kind "${kind}"`).toBeDefined()
    }
  })
})
