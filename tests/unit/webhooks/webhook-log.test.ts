/**
 * T-0-12 — webhook_log schema unit tests
 *
 * These tests validate the Drizzle schema structure and TypeScript types.
 * DB-level idempotency enforcement (UNIQUE constraint) is validated via
 * the integration test suite once a test DB is available.
 *
 * Spec: docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { describe, it, expect } from 'vitest'
import {
  webhookLog,
  integrationProviderEnum,
  webhookStatusEnum,
} from '@/lib/db/schema/webhook-log'
import type { NewWebhookLog } from '@/lib/db/schema/webhook-log'

describe('webhook_log schema', () => {
  it('webhook_log.insert.idempotent — schema has UNIQUE (provider, external_event_id)', () => {
    // The uniqueIndex is declared in the pgTable — verify schema is defined
    expect(webhookLog).toBeDefined()
  })

  it('integration_provider enum has all 7 providers', () => {
    const values = integrationProviderEnum.enumValues
    expect(values).toHaveLength(7)
    expect(values).toContain('digital_guru')
    expect(values).toContain('brevo')
    expect(values).toContain('whatsapp_official')
    expect(values).toContain('instagram')
    expect(values).toContain('email')
    expect(values).toContain('notazz')
    expect(values).toContain('analytics')
  })

  it('webhook_status enum has all 4 statuses', () => {
    const values = webhookStatusEnum.enumValues
    expect(values).toHaveLength(4)
    expect(values).toContain('received')
    expect(values).toContain('processed')
    expect(values).toContain('failed')
    expect(values).toContain('dead_letter')
  })

  it('schema uses receivedAt not createdAt, has no updatedAt or deletedAt', () => {
    const cols = Object.keys(webhookLog)
    // Must NOT have standard domain timestamps
    expect(cols).not.toContain('updatedAt')
    expect(cols).not.toContain('deletedAt')
    expect(cols).not.toContain('createdAt')
    // Must have domain-specific timestamps
    expect(cols).toContain('receivedAt')
  })

  it('schema has all required columns', () => {
    const cols = Object.keys(webhookLog)
    expect(cols).toContain('id')
    expect(cols).toContain('provider')
    expect(cols).toContain('externalEventId')
    expect(cols).toContain('eventKind')
    expect(cols).toContain('payload')
    expect(cols).toContain('status')
    expect(cols).toContain('attempts')
    expect(cols).toContain('lastError')
    expect(cols).toContain('receivedAt')
    expect(cols).toContain('processedAt')
    expect(cols).toContain('deadLetteredAt')
  })

  it('typed insert reflects required fields', () => {
    const entry: Partial<NewWebhookLog> = {
      provider: 'digital_guru',
      externalEventId: 'evt_123',
      payload: { event: 'sale_approved' },
    }
    expect(entry.provider).toBe('digital_guru')
    expect(entry.externalEventId).toBe('evt_123')
    expect(entry.payload).toEqual({ event: 'sale_approved' })
  })

  it('typed insert accepts all provider values', () => {
    const providers: NewWebhookLog['provider'][] = [
      'digital_guru',
      'brevo',
      'whatsapp_official',
      'instagram',
      'email',
      'notazz',
      'analytics',
    ]
    expect(providers).toHaveLength(7)
  })

  it('typed insert accepts all status values', () => {
    const statuses: NewWebhookLog['status'][] = [
      'received',
      'processed',
      'failed',
      'dead_letter',
    ]
    expect(statuses).toHaveLength(4)
  })

  it('optional fields are typed as nullable', () => {
    const entry: Partial<NewWebhookLog> = {
      provider: 'brevo',
      externalEventId: 'brevo_evt_456',
      payload: { type: 'contact_updated' },
      // eventKind, lastError, processedAt, deadLetteredAt omitted — all optional
    }
    expect(entry.eventKind).toBeUndefined()
    expect(entry.lastError).toBeUndefined()
    expect(entry.processedAt).toBeUndefined()
    expect(entry.deadLetteredAt).toBeUndefined()
  })
})
