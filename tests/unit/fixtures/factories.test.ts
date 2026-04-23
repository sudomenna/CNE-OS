/**
 * Unit tests for test factories.
 *
 * Each factory must:
 * 1. Return a valid shape with all required fields.
 * 2. Accept and apply overrides without affecting default fields.
 * 3. Satisfy the invariants documented in the schema or BR.
 *
 * Spec: docs/10-architecture/10-testing-strategy.md §5
 */

import { describe, it, expect } from 'vitest'
import {
  makeBrand,
  makeUser,
  makeContact,
  makeAuditEntry,
  makeTimelineEvent,
  makeWebhookLog,
  FIXTURE_IDS,
} from '@/tests/fixtures/factories'

// ---------------------------------------------------------------------------
// makeBrand
// ---------------------------------------------------------------------------

describe('makeBrand', () => {
  it('given no overrides, when called, then returns valid NewBrand shape', () => {
    const brand = makeBrand()
    expect(brand.name).toBe('CNE Carreiras')
    expect(brand.slug).toBe('cne-carreiras')
    expect(brand.logoUrl).toBeNull()
    expect(brand.primaryColor).toBeNull()
  })

  it('given no overrides, when slug checked, then satisfies INV-ORG-05 kebab-case pattern', () => {
    const brand = makeBrand()
    // INV-ORG-05: slug must match ^[a-z0-9][a-z0-9-]*$
    expect(brand.slug).toMatch(/^[a-z0-9][a-z0-9-]*$/)
  })

  it('given name and slug overrides, when called, then returns brand with overridden fields', () => {
    const brand = makeBrand({ name: 'CNE Prime', slug: 'cne-prime' })
    expect(brand.name).toBe('CNE Prime')
    expect(brand.slug).toBe('cne-prime')
  })

  it('given partial override, when called, then preserves unoverridden defaults', () => {
    const brand = makeBrand({ name: 'CNE Outra' })
    expect(brand.slug).toBe('cne-carreiras')
    expect(brand.logoUrl).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// makeUser
// ---------------------------------------------------------------------------

describe('makeUser', () => {
  it('given no overrides, when called, then returns valid NewUserAccount shape', () => {
    const user = makeUser()
    expect(user.id).toBe(FIXTURE_IDS.user)
    expect(user.email).toBe('fixture-admin@example.com')
    expect(user.fullName).toBe('Fulano de Tal')
    expect(user.isActive).toBe(true)
    expect(user.totpEnabled).toBe(false)
    expect(user.lastLoginAt).toBeNull()
    expect(user.deletedAt).toBeNull()
  })

  it('given no overrides, when email checked, then uses anonymised example.com address', () => {
    const user = makeUser()
    // docs/10-architecture/10-testing-strategy.md §5.2 — never real email
    expect(user.email).toMatch(/@example\.com$/)
  })

  it('given email and isActive overrides, when called, then returns user with overridden fields', () => {
    const user = makeUser({ email: 'custom@example.com', isActive: false })
    expect(user.email).toBe('custom@example.com')
    expect(user.isActive).toBe(false)
  })

  it('given deletedAt override, when called, then soft-delete field is set', () => {
    const deletedAt = new Date('2026-01-01T00:00:00Z')
    const user = makeUser({ deletedAt })
    expect(user.deletedAt).toEqual(deletedAt)
  })
})

// ---------------------------------------------------------------------------
// makeContact
// ---------------------------------------------------------------------------

describe('makeContact', () => {
  it('given no overrides, when called, then returns ContactFixture shape with all fields', () => {
    const contact = makeContact()
    expect(contact.id).toBe(FIXTURE_IDS.contact)
    expect(contact.email).toBe('fixture-contato@example.com')
    expect(contact.fullName).toBe('Fulana Silva')
    expect(contact.brandId).toBe(FIXTURE_IDS.brand)
  })

  it('given no overrides, when email checked, then uses anonymised example.com address', () => {
    const contact = makeContact()
    expect(contact.email).toMatch(/@example\.com$/)
  })

  it('given email override, when called, then returns contact with overridden email', () => {
    const contact = makeContact({ email: 'outro@example.com' })
    expect(contact.email).toBe('outro@example.com')
    expect(contact.id).toBe(FIXTURE_IDS.contact)
  })

  it('given brandId override, when called, then returns contact linked to different brand', () => {
    const customBrandId = '99000000-0000-0000-0000-000000000001'
    const contact = makeContact({ brandId: customBrandId })
    expect(contact.brandId).toBe(customBrandId)
  })
})

// ---------------------------------------------------------------------------
// makeAuditEntry
// ---------------------------------------------------------------------------

describe('makeAuditEntry', () => {
  it('given no overrides, when called, then returns valid NewAuditLog shape', () => {
    const entry = makeAuditEntry()
    expect(entry.actionKind).toBe('create')
    expect(entry.resourceKind).toBe('brand')
    expect(entry.resourceId).toBe(FIXTURE_IDS.brand)
    expect(entry.before).toEqual({})
    expect(entry.after).toEqual({})
    expect(entry.context).toEqual({})
  })

  it('given no overrides, when actor constraint checked, then satisfies BR-AUDIT ck_audit_actor', () => {
    const entry = makeAuditEntry()
    // BR-AUDIT: ck_audit_actor — at least one of actorUserId or actorSystem must be non-null
    const hasActor = entry.actorUserId != null || entry.actorSystem != null
    expect(hasActor).toBe(true)
  })

  it('given actorSystem override with null actorUserId, when actor constraint checked, then still satisfies BR-AUDIT', () => {
    const entry = makeAuditEntry({ actorUserId: null, actorSystem: 'digital_guru' })
    const hasActor = entry.actorUserId != null || entry.actorSystem != null
    expect(hasActor).toBe(true)
  })

  it('given actionKind override, when called, then returns entry with overridden action', () => {
    const entry = makeAuditEntry({ actionKind: 'delete', resourceKind: 'contact' })
    expect(entry.actionKind).toBe('delete')
    expect(entry.resourceKind).toBe('contact')
  })
})

// ---------------------------------------------------------------------------
// makeTimelineEvent
// ---------------------------------------------------------------------------

describe('makeTimelineEvent', () => {
  it('given no overrides, when called, then returns valid NewTimelineEvent shape', () => {
    const event = makeTimelineEvent()
    expect(event.contactId).toBe(FIXTURE_IDS.contact)
    expect(event.brandId).toBe(FIXTURE_IDS.brand)
    expect(event.kind).toBe('contact_created')
    expect(event.source).toBe('MOD-CONTACT')
    expect(event.payload).toEqual({ origin: 'manual' })
    expect(event.occurredAt).toEqual(new Date('2026-04-23T00:00:00Z'))
  })

  it('given no overrides, when actor constraint checked, then satisfies INV-TIMELINE-02', () => {
    const event = makeTimelineEvent()
    // INV-TIMELINE-02: at least one actor must be present
    const hasActor = event.actorUserId != null || event.actorSystem != null
    expect(hasActor).toBe(true)
  })

  it('given no overrides, when kind checked, then satisfies INV-TIMELINE-03 snake_case pattern', () => {
    const event = makeTimelineEvent()
    // INV-TIMELINE-03: kind must match ^[a-z][a-z0-9_]*$
    expect(event.kind).toMatch(/^[a-z][a-z0-9_]*$/)
  })

  it('given actorSystem override with null actorUserId, when actor constraint checked, then still satisfies INV-TIMELINE-02', () => {
    const event = makeTimelineEvent({ actorUserId: null, actorSystem: 'inngest-worker' })
    const hasActor = event.actorUserId != null || event.actorSystem != null
    expect(hasActor).toBe(true)
  })

  it('given kind override, when called, then returns event with overridden kind', () => {
    const event = makeTimelineEvent({ kind: 'sale_approved', source: 'MOD-TRANSACTION' })
    expect(event.kind).toBe('sale_approved')
    expect(event.source).toBe('MOD-TRANSACTION')
  })
})

// ---------------------------------------------------------------------------
// makeWebhookLog
// ---------------------------------------------------------------------------

describe('makeWebhookLog', () => {
  it('given no overrides, when called, then returns valid NewWebhookLog shape', () => {
    const log = makeWebhookLog()
    expect(log.provider).toBe('digital_guru')
    expect(log.externalEventId).toBe('guru_fixture_001')
    expect(log.eventKind).toBe('transaction_approved')
    expect(log.payload).toEqual({ id: 'guru_fixture_001', status: 'approved' })
  })

  it('given no overrides, when idempotency fields checked, then externalEventId is non-empty', () => {
    const log = makeWebhookLog()
    // BR-INTEGRATION-IDEMPOTENCY: (provider, externalEventId) uniqueness anchor
    expect(log.provider).toBeTruthy()
    expect(log.externalEventId).toBeTruthy()
  })

  it('given provider and externalEventId overrides, when called, then returns log with overridden idempotency key', () => {
    const log = makeWebhookLog({ provider: 'brevo', externalEventId: 'brevo_evt_002' })
    expect(log.provider).toBe('brevo')
    expect(log.externalEventId).toBe('brevo_evt_002')
  })
})

// ---------------------------------------------------------------------------
// FIXTURE_IDS — determinism check
// ---------------------------------------------------------------------------

describe('FIXTURE_IDS', () => {
  it('given exported FIXTURE_IDS, when accessed, then all IDs are valid UUIDs', () => {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    for (const [_key, value] of Object.entries(FIXTURE_IDS)) {
      expect(value).toMatch(uuidPattern)
    }
  })

  it('given exported FIXTURE_IDS, when accessed, then all IDs are unique', () => {
    const values = Object.values(FIXTURE_IDS)
    const unique = new Set(values)
    expect(unique.size).toBe(values.length)
  })
})

// ---------------------------------------------------------------------------
// db-clean — export smoke test (no DB call in unit context)
// ---------------------------------------------------------------------------

describe('db-clean exports', () => {
  it('given resetDb import, when checked, then it is a function', async () => {
    const { resetDb } = await import('@/tests/fixtures/db-clean')
    expect(typeof resetDb).toBe('function')
  })

  it('given withRollback import, when checked, then it is a function', async () => {
    const { withRollback } = await import('@/tests/fixtures/db-clean')
    expect(typeof withRollback).toBe('function')
  })
})
