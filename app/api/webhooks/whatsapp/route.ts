/**
 * MOD-INBOX / T-3-07 — Route Handler: WhatsApp Business Official webhook
 *
 * GET  /api/webhooks/whatsapp — verificação do hub Meta (hub.challenge)
 * POST /api/webhooks/whatsapp — recepção de eventos (mensagens, status)
 *
 * Fluxo POST (canônico, docs/30-contracts/04-webhook-contracts.md §2):
 *   1. Lê body como texto para preservar rawBody para verificação HMAC
 *   2. verifyWhatsAppSignature — 401 se inválida
 *   3. Parse JSON + extrai event IDs
 *   4. INSERT idempotente em webhook_log (um por message/status id)
 *   5. Enfileira whatsapp/message.inbound no Inngest para cada novo registro
 *   6. Retorna 200 imediatamente
 *
 * docs/30-contracts/04-webhook-contracts.md §5.3
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { inngest } from '@/inngest/client'
import { verifyWhatsAppSignature } from '@/lib/integrations/whatsapp/webhook'
import { extractWhatsAppEventIds } from '@/lib/integrations/whatsapp/map'

// ---------------------------------------------------------------------------
// GET — verificação do hub Meta
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')

  const verifyToken = process.env['WHATSAPP_VERIFY_TOKEN']

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    return new Response(challenge, { status: 200 })
  }

  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

// ---------------------------------------------------------------------------
// POST — recepção de eventos
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<Response> {
  const correlationId =
    req.headers.get('x-correlation-id') ?? crypto.randomUUID()

  // ── 1. Ler body como texto (necessário para verificar HMAC antes de parsear) ──
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('x-hub-signature-256') ?? ''
  const appSecret = process.env['WHATSAPP_APP_SECRET'] ?? ''

  // ── 2. Verificar assinatura HMAC-SHA256 ──────────────────────────────────
  // docs/30-contracts/04-webhook-contracts.md §2 regra 1: validar assinatura é o primeiro passo
  if (!verifyWhatsAppSignature(rawBody, signatureHeader, appSecret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // ── 3. Parse JSON ─────────────────────────────────────────────────────────
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // ── 4. Extrair IDs de eventos (WhatsApp pode agrupar vários em um request) ─
  // docs/30-contracts/04-webhook-contracts.md §5.3: um external_event_id por evento
  const eventIds = extractWhatsAppEventIds(payload)

  if (eventIds.length === 0) {
    // Payload válido mas sem IDs reconhecíveis (ex: estrutura nova da API)
    // Gravar com ID derivado do correlationId para não perder o payload
    const fallbackId = `noid:${correlationId}`
    try {
      const inserted = await db
        .insert(webhookLog)
        .values({
          provider: 'whatsapp_official',
          externalEventId: fallbackId,
          eventKind: 'unknown',
          payload: payload as Record<string, unknown>,
          status: 'received',
        })
        .onConflictDoNothing()
        .returning({ id: webhookLog.id })

      if (inserted.length > 0 && inserted[0]) {
        await inngest.send({
          name: 'whatsapp/message.inbound',
          data: { webhookLogId: inserted[0].id, correlationId },
        })
      }
    } catch {
      // Ignorar erros de log — nunca retornar 5xx para a Meta
    }

    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // ── 5. INSERT idempotente por event ID + enfileirar no Inngest ────────────
  const newIds: string[] = []

  for (const eventId of eventIds) {
    try {
      const inserted = await db
        .insert(webhookLog)
        .values({
          provider: 'whatsapp_official',
          externalEventId: eventId,
          eventKind: 'messages',
          payload: payload as Record<string, unknown>,
          status: 'received',
          // correlation_id não está no schema atual — registrado via Inngest event data
        })
        .onConflictDoNothing()
        .returning({ id: webhookLog.id })

      if (inserted.length > 0 && inserted[0]) {
        newIds.push(inserted[0].id)
      }
    } catch (err) {
      // Erro inesperado de BD — logar mas não parar o loop
      console.error('[whatsapp-webhook] failed to insert webhook_log', {
        eventId,
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── 6. Enfileirar processamento assíncrono para registros novos ───────────
  if (newIds.length > 0) {
    try {
      await inngest.send(
        newIds.map((webhookLogId) => ({
          name: 'whatsapp/message.inbound' as const,
          data: { webhookLogId, correlationId },
        })),
      )
    } catch (err) {
      // Falha no Inngest não deve retornar 5xx — a Meta voltaria a entregar
      console.error('[whatsapp-webhook] failed to enqueue inngest events', {
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // ── 7. Resposta imediata — provider não espera processamento ─────────────
  const duplicate = newIds.length === 0 && eventIds.length > 0
  return NextResponse.json({ ok: true, duplicate }, { status: 200 })
}
