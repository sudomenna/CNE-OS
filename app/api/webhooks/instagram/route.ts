/**
 * MOD-INBOX — Instagram webhook Route Handler
 *
 * Canonical webhook flow (docs/10-architecture/04-integrations-canonical.md):
 *   GET  — Hub verification handshake (Meta requires this for webhook setup)
 *   POST — Receive event → verify signature → ingest → enqueue Inngest → 200
 *
 * Ownership: app/api/webhooks/instagram/route.ts
 * Delegates to: lib/integrations/instagram/webhook.ts (signature)
 * Enqueues:     inngest/functions/instagram-inbound.ts
 *
 * BR-INTEGRATION-IDEMPOTENCY: idempotency enforced via webhook_log UNIQUE
 * (provider, external_event_id). Replay of same event = 200 without re-queuing.
 *
 * ADR-16: externalEventId = 'instagram:{mid}'
 */
import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { inngest } from '@/inngest/client'
import { verifyInstagramSignature } from '@/lib/integrations/instagram/webhook'
import { mapInstagramInbound } from '@/lib/integrations/instagram/map'

// ---------------------------------------------------------------------------
// GET — Meta webhook hub verification
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url)

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const verifyToken = process.env['INSTAGRAM_VERIFY_TOKEN']

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — Receive Instagram webhook event
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Inject correlation ID for observability
  const correlationId = randomUUID()

  // Read raw body (needed for HMAC verification before any parsing)
  const rawBody = await request.text()

  // ── Step 1: Verify HMAC-SHA256 signature ─────────────────────────────────
  const headersList = await headers()
  const signature = headersList.get('x-hub-signature-256') ?? ''
  const appSecret = process.env['INSTAGRAM_APP_SECRET'] ?? ''

  if (!verifyInstagramSignature(rawBody, signature, appSecret)) {
    return NextResponse.json(
      { error: 'Unauthorized', correlationId },
      { status: 401 },
    )
  }

  // ── Step 2: Parse payload ──────────────────────────────────────────────────
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json(
      { error: 'Bad Request: invalid JSON', correlationId },
      { status: 400 },
    )
  }

  // ── Step 3: Extract externalEventId (ADR-16: 'instagram:{mid}') ───────────
  // For non-message events (read, delivery), we still need a stable key.
  // Use the message id when available, otherwise hash the entry timestamp.
  const mapped = mapInstagramInbound(payload)

  // Derive a stable external event id even for non-message events
  // so we can enforce idempotency on all webhook deliveries.
  let externalEventId: string
  let eventKind: string

  if (mapped) {
    // ADR-16: 'instagram:{mid}'
    externalEventId = mapped.externalMessageId
    eventKind = `instagram_dm_${mapped.kind}`
  } else {
    // Non-message event: use a hash of entry id + timestamp to avoid collision
    const raw = payload as Record<string, unknown>
    const entry = (raw['entry'] as Array<{ id: string; time: number }>)?.[0]
    if (!entry) {
      // Completely unrecognisable payload — acknowledge and discard
      return NextResponse.json({ ok: true, correlationId, skipped: true }, { status: 200 })
    }
    externalEventId = `instagram:entry:${entry.id}:${entry.time}`
    eventKind = 'instagram_non_message'
  }

  // ── Step 4: Ingest into webhook_log (idempotency) ─────────────────────────
  // INSERT ... ON CONFLICT DO NOTHING — BR-INTEGRATION-IDEMPOTENCY
  const inserted = await db
    .insert(webhookLog)
    .values({
      provider: 'instagram',
      externalEventId,
      eventKind,
      payload: payload as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: webhookLog.id })

  // If nothing was inserted, event already exists — check status
  if (!inserted[0]) {
    // Duplicate delivery — return 200 immediately without re-enqueuing
    return NextResponse.json(
      { ok: true, correlationId, duplicate: true },
      { status: 200 },
    )
  }

  const webhookLogId = inserted[0].id

  // ── Step 5: Enqueue Inngest event ──────────────────────────────────────────
  // Returns 200 immediately — processing happens asynchronously
  await inngest.send({
    name: 'instagram/webhook.received',
    data: { webhookLogId },
  })

  return NextResponse.json(
    { ok: true, correlationId, webhookLogId },
    { status: 200 },
  )
}
