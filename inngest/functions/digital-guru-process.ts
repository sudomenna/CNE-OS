/**
 * MOD-INTEGRATION / T-8-15 — Inngest function: processador Digital Guru webhook
 *
 * Evento: 'digital-guru/webhook.received'
 * Payload: { webhookLogId: string, correlationId: string }
 *
 * Fluxo:
 *   1. Guard de idempotência: se webhook_log.status='processed', retorna noop.
 *   2. Chama handleDigitalGuruEvent(webhookLogId).
 *   3. Sucesso: webhook_log.status já marcado 'processed' pelo handler.
 *   4. Falha (exceção lançada): incrementa attempts + registra lastError.
 *      Inngest retentar com backoff exponencial até MAX_ATTEMPTS.
 *      Na última tentativa: atualiza webhook_log.status='dead_letter'.
 *
 * Retry: 5 tentativas com backoff exponencial [5s, 30s, 150s, 750s] + jitter ±20%.
 *   docs/40-integrations/01-digital-guru.md §Idempotência/retry/DLQ
 *   docs/30-contracts/04-webhook-contracts.md §4
 *
 * docs/60-flows/05-external-sale-ingest.md (FLOW-05)
 * docs/60-flows/12-webhook-reprocess.md (FLOW-12)
 * docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 */
import { eq, sql } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { webhookLog } from '@/lib/db/schema/webhook-log'
import { handleDigitalGuruEvent } from '@/lib/integrations/digital-guru/handler'

// ---------------------------------------------------------------------------
// Constantes de backoff exponencial
// docs/40-integrations/01-digital-guru.md §Idempotência: 5s/30s/150s/750s + jitter ±20%
// ---------------------------------------------------------------------------

export const BACKOFF_BASE_MS = [5_000, 30_000, 150_000, 750_000] as const
export const JITTER_FACTOR = 0.2 // ±20%
export const MAX_ATTEMPTS = 5

/**
 * Retorna o delay em ms para a tentativa `attemptIndex` (0-based) com jitter ±20%.
 * Índice 0 → ~5s, 1 → ~30s, 2 → ~150s, 3+ → ~750s (cap).
 */
export function getRetryDelayMs(attemptIndex: number): number {
  const base = BACKOFF_BASE_MS[Math.min(attemptIndex, BACKOFF_BASE_MS.length - 1)] ?? 750_000
  const jitter = base * JITTER_FACTOR * (Math.random() * 2 - 1)
  return Math.max(1_000, Math.round(base + jitter))
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const digitalGuruProcess = inngest.createFunction(
  {
    id: 'digital-guru-webhook-process',
    retries: MAX_ATTEMPTS,
    concurrency: {
      // Serializar processamento por webhookLogId para evitar race conditions
      limit: 1,
      key: 'event.data.webhookLogId',
    },
  },
  { event: 'digital-guru/webhook.received' as const },
  async ({ event, step, attempt }) => {
    const { webhookLogId, correlationId } = event.data as {
      webhookLogId: string
      correlationId: string
    }

    // ── Passo 1: Guard de idempotência ───────────────────────────────────
    // Se webhook_log já está 'processed', retorna noop sem processar.
    // Cobre: replay manual (FLOW-12) após já processado, ou race entre retries.
    // BR-INTEGRATION-IDEMPOTENCY
    const idempotencyResult = await step.run('check-idempotency', async () => {
      const rows = await db
        .select({ status: webhookLog.status })
        .from(webhookLog)
        .where(eq(webhookLog.id, webhookLogId))
        .limit(1)

      const entry = rows[0]
      if (!entry) {
        console.warn('[digital-guru-process] webhook_log not found', {
          webhookLogId,
          correlationId,
          attempt,
        })
        return 'not_found'
      }

      return entry.status
    })

    // Noop se já processado ou não encontrado (evita retry infinito)
    if (idempotencyResult === 'processed' || idempotencyResult === 'not_found') {
      return
    }

    // ── Passo 2: Processar webhook via handler ───────────────────────────
    // Erros propagados pelo step causam retry no Inngest.
    // Após MAX_ATTEMPTS tentativas, o Inngest não executa mais;
    // capturamos a falha no catch e marcamos dead_letter.
    try {
      await step.run('handle-digital-guru-event', async () => {
        await handleDigitalGuruEvent(webhookLogId)
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      // `attempt` (0-based) — na última tentativa: dead_letter; senão: failed
      // MAX_ATTEMPTS=5 → índices 0,1,2,3,4; última = 4
      const isLastAttempt = attempt >= MAX_ATTEMPTS - 1

      await step.run('update-webhook-log-on-failure', async () => {
        await db
          .update(webhookLog)
          .set({
            status: isLastAttempt ? 'dead_letter' : 'failed',
            lastError: errorMessage,
            attempts: sql`${webhookLog.attempts} + 1`,
            ...(isLastAttempt ? { deadLetteredAt: sql`now()` } : {}),
          })
          .where(eq(webhookLog.id, webhookLogId))

        if (isLastAttempt) {
          // DLQ: log estruturado para Sentry/Axiom
          // docs/40-integrations/01-digital-guru.md §Idempotência: alerta PagerDuty
          console.error('[digital-guru-process] dead_letter after max attempts', {
            webhookLogId,
            correlationId,
            maxAttempts: MAX_ATTEMPTS,
            lastError: errorMessage,
          })
        }
      })

      if (!isLastAttempt) {
        // Re-lançar para Inngest executar o retry com backoff
        throw err
      }
    }
  },
)
