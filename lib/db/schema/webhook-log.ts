/**
 * MOD-INTEGRATION — Webhook log schema (T-0-12)
 *
 * Table: webhook_log
 *
 * NOT append-only: status is updated during processing.
 * No updated_at, no deleted_at — uses domain-specific timestamps
 * (received_at, processed_at, dead_lettered_at).
 *
 * Specs:
 *   docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 *   docs/30-contracts/01-enums.md (integration_provider, webhook_status)
 *   docs/30-contracts/02-db-schema-conventions.md §4, §16
 */
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Enum: integration_provider
// docs/30-contracts/01-enums.md
// ---------------------------------------------------------------------------

export const integrationProviderEnum = pgEnum('integration_provider', [
  'digital_guru',
  'brevo',
  'whatsapp_official',
  'notazz',
  'analytics',
])

// ---------------------------------------------------------------------------
// Enum: webhook_status
// docs/30-contracts/01-enums.md
// ---------------------------------------------------------------------------

export const webhookStatusEnum = pgEnum('webhook_status', [
  'received',
  'processed',
  'failed',
  'dead_letter',
])

// ---------------------------------------------------------------------------
// webhook_log
//
// NOT append-only — status transitions from received → processed|failed|dead_letter.
// No updated_at (spec defines domain-specific timestamps instead).
// No deleted_at (docs/30-contracts/02-db-schema-conventions.md §4).
//
// Central idempotency enforcement:
//   UNIQUE (provider, external_event_id) — BR-INTEGRATION-IDEMPOTENCY
// ---------------------------------------------------------------------------

export const webhookLog = pgTable(
  'webhook_log',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

    // Which integration sent this event
    provider: integrationProviderEnum('provider').notNull(),

    // Provider-assigned event identifier — used for idempotency enforcement
    // BR-INTEGRATION-IDEMPOTENCY: UNIQUE (provider, external_event_id) constraint below
    externalEventId: text('external_event_id').notNull(),

    // Optional: event category (e.g. 'sale_approved', 'contact_updated')
    eventKind: text('event_kind'),

    // Raw payload received from provider — immutable after insert
    payload: jsonb('payload').notNull(),

    // Processing state — transitions: received → processed | failed | dead_letter
    status: webhookStatusEnum('status').notNull().default('received'),

    // Cumulative processing attempt count
    attempts: integer('attempts').notNull().default(0),

    // Last error message when status is 'failed' or 'dead_letter'
    lastError: text('last_error'),

    // Domain-specific timestamps (no created_at / updated_at / deleted_at)
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
  },
  (t) => ({
    // BR-INTEGRATION-IDEMPOTENCY: prevent duplicate webhook processing
    uqWebhookEvent: uniqueIndex('uq_webhook_event').on(t.provider, t.externalEventId),

    // Fast lookup by processing state (e.g. pending retry jobs)
    idxWebhookStatus: index('idx_webhook_status').on(t.status),

    // Provider + time range queries (most recent first)
    idxWebhookProviderReceived: index('idx_webhook_provider_received').on(
      t.provider,
      t.receivedAt,
    ),
  }),
)

export type WebhookLog = InferSelectModel<typeof webhookLog>
export type NewWebhookLog = InferInsertModel<typeof webhookLog>
