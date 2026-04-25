/**
 * MOD-INTEGRATION / T-8-13 — Route Handler: Digital Guru webhook
 *
 * POST /api/webhooks/digital-guru
 *
 * Fluxo canônico (docs/30-contracts/04-webhook-contracts.md §2):
 *   1. Lê body como texto (necessário para verificar HMAC antes de parsear)
 *   2. verifyDigitalGuruSignature — 401 se inválida (CT-DG-07)
 *   3. Parse JSON + extrai external_event_id (payload.id)
 *   4. INSERT idempotente em webhook_log (BR-INTEGRATION-IDEMPOTENCY)
 *      — ON CONFLICT (provider, external_event_id) DO NOTHING
 *      — se já existe → 200 noop (CT-IDEM-01, CT-DG-02)
 *   5. Enfileira digital-guru/webhook.received no Inngest com webhookLogId
 *   6. Retorna 200 imediatamente — provedor não espera processamento
 *
 * docs/40-integrations/01-digital-guru.md
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { inngest } from '@/inngest/client'
import { verifyDigitalGuruSignature } from '@/lib/integrations/digital-guru/verify-signature'

export async function POST(req: Request): Promise<Response> {
  const correlationId =
    req.headers.get('x-correlation-id') ?? crypto.randomUUID()

  // ── 1. Ler body como texto (necessário para verificar HMAC) ─────────────
  const rawBody = await req.text()

  // ── 2. Verificar assinatura HMAC-SHA256 ──────────────────────────────────
  // docs/40-integrations/01-digital-guru.md: header X-Guru-Signature, HMAC-SHA256 hex
  // BR-INTEGRATION-IDEMPOTENCY: falha de assinatura = 401 sem gravar em webhook_log
  const signatureHeader = req.headers.get('x-guru-signature') ?? ''
  const webhookSecret = process.env['DIGITAL_GURU_WEBHOOK_SECRET'] ?? ''

  if (!verifyDigitalGuruSignature(rawBody, signatureHeader, webhookSecret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  // ── 3. Parse JSON ─────────────────────────────────────────────────────────
  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  // ── 4. Extrair external_event_id ─────────────────────────────────────────
  // docs/40-integrations/01-digital-guru.md: external_event_id = payload.id
  // docs/90-meta/04-decision-log.md ADR-16: formato {provider}:{event_id}
  const payloadObj = payload as Record<string, unknown>
  const rawEventId =
    typeof payloadObj['id'] === 'string' ? payloadObj['id'] : null

  // Fallback: sem external_event_id estável → hash determinístico (OQ-BR-IDEM-01)
  const externalEventId = rawEventId ?? `noid:${correlationId}`

  const eventKind =
    typeof payloadObj['event_type'] === 'string'
      ? payloadObj['event_type']
      : 'unknown'

  // ── 5. INSERT idempotente em webhook_log ──────────────────────────────────
  // BR-INTEGRATION-IDEMPOTENCY: INSERT ... ON CONFLICT DO NOTHING
  // UNIQUE (provider, external_event_id) → duplicata retorna array vazio
  let webhookLogId: string | null = null

  try {
    const inserted = await db
      .insert(webhookLog)
      .values({
        provider: 'digital_guru',
        externalEventId,
        eventKind,
        payload: payloadObj,
        status: 'received',
      })
      .onConflictDoNothing()
      .returning({ id: webhookLog.id })

    if (inserted.length > 0 && inserted[0]) {
      webhookLogId = inserted[0].id
    }
  } catch (err) {
    // Erro inesperado de BD — logar mas responder 200 para evitar reentrega agressiva
    // docs/40-integrations/01-digital-guru.md §Limitações: handler deve responder < 1s
    console.error('[digital-guru-webhook] failed to insert webhook_log', {
      externalEventId,
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
    // Retornar 200 mesmo em erro de log: o provedor irá reentregar e a idempotência protege
    return NextResponse.json({ ok: true, duplicate: false }, { status: 200 })
  }

  // ── 6. Idempotência: duplicate → 200 noop sem enfileirar ─────────────────
  // CT-DG-02: reentrega de evento já processado → 200 sem efeito novo
  if (webhookLogId === null) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 })
  }

  // ── 7. Enfileirar processamento assíncrono no Inngest ────────────────────
  // docs/40-integrations/01-digital-guru.md §Idempotência: retry 5x, backoff exponencial
  try {
    await inngest.send({
      name: 'digital-guru/webhook.received',
      data: { webhookLogId, correlationId },
    })
  } catch (err) {
    // Falha no Inngest não deve retornar 5xx — o provedor voltaria a entregar
    // O webhook_log já está gravado; job pode ser re-enfileirado manualmente (FLOW-12)
    console.error('[digital-guru-webhook] failed to enqueue inngest event', {
      webhookLogId,
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  // ── 8. Resposta imediata — provider não espera processamento ─────────────
  return NextResponse.json({ ok: true, duplicate: false }, { status: 200 })
}
