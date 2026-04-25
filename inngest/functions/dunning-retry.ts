/**
 * MOD-BILLING / T-9-10 — Inngest cron: dunning-retry (D+3, D+7, D+15)
 *
 * Roda a cada hora. Para cada installment com status='overdue' ligada a uma
 * subscription, verifica se está numa janela de retry e:
 *   - Incrementa retry_count + last_retry_at.
 *   - Transiciona subscription para past_due + emite TE-SUBSCRIPTION-PAST-DUE
 *     (apenas na primeira entrada em past_due).
 *   - Após D+15 com retry_count >= 3, chama cancelSubscription com
 *     reason='dunning_exhausted' (emite TE-SUBSCRIPTION-CANCELLED).
 *
 * Janelas de retry (BR-SUBSCRIPTION §Política de dunning):
 *   D+3  : due_at+3 <= now < due_at+4  AND retry_count < 1
 *   D+7  : due_at+7 <= now < due_at+8  AND retry_count < 2
 *   D+15 : due_at+15 <= now            AND retry_count < 3
 *   Exausto: due_at+15 <= now          AND retry_count >= 3
 *
 * Idempotência:
 *   - Installments com status 'paid' ou 'cancelled' são ignoradas (query filtra).
 *   - retry_count não avança além de 3.
 *   - cancelSubscription é idempotente para terminais (cancelled/expired → noop).
 *
 * Testabilidade:
 *   - runDunningCycle exportado como função pura auxiliar que aceita `now: Date`
 *     e `step` stub — permite testes sem runtime Inngest real.
 *
 * docs/20-domain/13-subscription-billing.md §7 (política de dunning)
 * docs/50-business-rules/BR-SUBSCRIPTION.md §Política de dunning (Fase 1)
 */
import { and, eq, isNotNull, lt, sql } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { installment, subscription } from '@/lib/db/schema/billing'
import { cancelSubscription } from '@/lib/domain/billing/cancel'
import { emitTimelineEvent } from '@/lib/timeline/emit'

// ---------------------------------------------------------------------------
// Helpers — janelas de dunning (BR-SUBSCRIPTION §Política de dunning)
// ---------------------------------------------------------------------------

/** Adiciona dias a uma data (retorna novo Date sem mutar). */
function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

/**
 * Verifica em qual janela de dunning a installment se encontra dado `now`.
 *
 * Retorna:
 *   - 'd3'  → D+3: due_at+3 <= now < due_at+4  AND retry_count < 1
 *   - 'd7'  → D+7: due_at+7 <= now < due_at+8  AND retry_count < 2
 *   - 'd15' → D+15: due_at+15 <= now            AND retry_count < 3
 *             (D+15 incrementa retry_count para 3 E cancela a subscription na mesma rodada)
 *   - null  → fora de qualquer janela de ação (já retried na janela, ou fora de período)
 *
 * Nota: 'exhausted' (retry_count >= 3 após D+15) não existe como estado de retorno
 * porque D+15 sempre cancela na mesma rodada (retry_count 2→3 e cancel juntos).
 * Installments com retry_count=3 já foram canceladas — subscription em terminal.
 *
 * Exportada para testes unitários.
 */
export function getDunningWindow(
  dueAt: Date,
  retryCount: number,
  now: Date,
): 'd3' | 'd7' | 'd15' | null {
  const d3Start = addDays(dueAt, 3)
  const d3End = addDays(dueAt, 4)
  const d7Start = addDays(dueAt, 7)
  const d7End = addDays(dueAt, 8)
  const d15Start = addDays(dueAt, 15)

  if (now >= d15Start) {
    // BR-SUBSCRIPTION §D+15: retryCount < 3 → executar último retry + cancelar
    // retryCount >= 3 → subscription já foi cancelada (terminal), noop
    return retryCount < 3 ? 'd15' : null
  }

  if (now >= d7Start && now < d7End) {
    // BR-SUBSCRIPTION §D+7
    return retryCount < 2 ? 'd7' : null
  }

  if (now >= d3Start && now < d3End) {
    // BR-SUBSCRIPTION §D+3
    return retryCount < 1 ? 'd3' : null
  }

  return null
}

// ---------------------------------------------------------------------------
// Step interface — tipo mínimo compatível com Inngest step e stub de testes
// ---------------------------------------------------------------------------

interface StepLike {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>
}

// ---------------------------------------------------------------------------
// runDunningCycle — lógica principal, exportada para testes
// ---------------------------------------------------------------------------

/**
 * Núcleo do ciclo de dunning.
 *
 * Separado do wrapper Inngest para permitir injeção de `now` e `step` stub
 * em testes de integração sem depender do runtime Inngest.
 *
 * @param step  Objeto step (Inngest real ou stub de testes)
 * @param now   Data de referência (default: new Date())
 * @param dbClient  Instância do DB (default: db importado do módulo)
 */
export async function runDunningCycle(
  step: StepLike,
  now?: Date,
  dbClient = db,
): Promise<{ processed: number; retried: number; cancelled: number }> {
  const effectiveNow = now ?? new Date()

  // ── Passo 1: Buscar installments overdue com subscription associada ──────
  // Filtra status='overdue' + subscriptionId NOT NULL + D+3 já passou.
  // idx_installment_status_due ON installment(status, due_at) cobre esta query.
  const overdueRows = await step.run('fetch-overdue-installments', async () => {
    return dbClient
      .select({
        id: installment.id,
        due_at: installment.due_at,
        retryCount: installment.retryCount,
        subscriptionId: installment.subscriptionId,
      })
      .from(installment)
      .where(
        and(
          eq(installment.status, 'overdue'),
          isNotNull(installment.subscriptionId),
          // Apenas installments que já passaram de D+3 (limite mínimo de dunning)
          lt(
            sql`${installment.due_at} + interval '3 days'`,
            sql`${effectiveNow.toISOString()}::timestamptz`,
          ),
        ),
      )
  })

  if (overdueRows.length === 0) {
    return { processed: 0, retried: 0, cancelled: 0 }
  }

  let retried = 0
  let cancelled = 0

  // ── Passo 2: Processar cada installment em step isolado ──────────────────
  for (const row of overdueRows) {
    const window = getDunningWindow(row.due_at, row.retryCount, effectiveNow)

    if (window === null) {
      // Fora de qualquer janela de retry — noop
      continue
    }

    if (window === 'd15') {
      // D+15: incrementar retry_count para 3 E cancelar subscription na mesma rodada.
      // BR-SUBSCRIPTION §D+15 sem pagamento → subscription → cancelled com 'dunning_exhausted'.
      // O incremento do retry_count documenta que a tentativa foi feita; o cancelamento
      // encerra o ciclo de dunning.
      await step.run(`dunning-d15-cancel-${row.subscriptionId}`, async () => {
        const now = new Date()

        // 1. Incrementar retry_count para 3 (última tentativa registrada)
        await dbClient
          .update(installment)
          .set({
            retryCount: row.retryCount + 1,
            lastRetryAt: now,
            updatedAt: now,
          })
          .where(eq(installment.id, row.id))

        // 2. Cancelar subscription com reason='dunning_exhausted'
        // cancelSubscription é idempotente para terminais (cancelled/expired → noop)
        await dbClient.transaction(async (tx) => {
          await cancelSubscription(tx, row.subscriptionId!, 'dunning_exhausted')
        })
      })
      cancelled++
      continue
    }

    // Janelas D+3 e D+7 — retry intermediário (NÃO cancela)
    await step.run(`retry-installment-${row.id}-window-${window}`, async () => {
      const now = new Date()

      // Incrementar retry_count e last_retry_at
      // BR-SUBSCRIPTION §Política de dunning: cada retry incrementa retry_count
      await dbClient
        .update(installment)
        .set({
          retryCount: row.retryCount + 1,
          lastRetryAt: now,
          updatedAt: now,
        })
        .where(eq(installment.id, row.id))

      // Transicionar subscription para past_due + emitir TE-SUBSCRIPTION-PAST-DUE
      // apenas se ainda não estiver em past_due/terminal.
      // docs/20-domain/13-subscription-billing.md §7 passo 3
      const subRows = await dbClient
        .select({
          id: subscription.id,
          status: subscription.status,
          contactId: subscription.contactId,
          brandId: subscription.brandId,
          currentPeriodEnd: subscription.currentPeriodEnd,
        })
        .from(subscription)
        .where(eq(subscription.id, row.subscriptionId!))
        .limit(1)

      const sub = subRows[0]
      if (
        sub &&
        sub.status !== 'past_due' &&
        sub.status !== 'cancelled' &&
        sub.status !== 'expired'
      ) {
        await dbClient
          .update(subscription)
          .set({ status: 'past_due', updatedAt: now })
          .where(eq(subscription.id, sub.id))

        // Emitir TE-SUBSCRIPTION-PAST-DUE
        // Usa te_subscription_stub enquanto subscription_past_due não é promovido ao KIND_REGISTRY (T-9-17)
        // [SYNC-PENDING]: migrar para kind 'subscription_past_due' quando T-9-17 registrá-lo
        await emitTimelineEvent({
          contactId: sub.contactId,
          brandId: sub.brandId,
          kind: 'te_subscription_stub',
          source: 'MOD-BILLING',
          actorSystem: 'dunningRetry',
          subjectKind: 'subscription',
          subjectId: sub.id,
          payload: {
            subscription_id: sub.id,
            event_type: 'TE-SUBSCRIPTION-PAST-DUE',
            contact_id: sub.contactId,
            installment_id: row.id,
            dunning_window: window,
            retry_count: row.retryCount + 1,
          },
        })
      }
    })
    retried++
  }

  console.info('[dunning-retry] dunning cycle complete', {
    total: overdueRows.length,
    retried,
    cancelled,
  })

  return { processed: overdueRows.length, retried, cancelled }
}

// ---------------------------------------------------------------------------
// Inngest cron function — wrapper sobre runDunningCycle
// ---------------------------------------------------------------------------

export const dunningRetry = inngest.createFunction(
  {
    id: 'dunning-retry',
    name: 'Dunning Retry — D+3, D+7, D+15 (hourly)',
    retries: 3,
    concurrency: { limit: 1 }, // evita overlap de rodadas simultâneas
  },
  { cron: '0 * * * *' }, // a cada hora
  async ({ step }) => {
    return runDunningCycle(step as unknown as StepLike)
  },
)
