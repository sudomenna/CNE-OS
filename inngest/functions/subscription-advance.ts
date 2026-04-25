/**
 * MOD-BILLING / T-9-11 — Inngest cron: subscription-advance (rolar ciclo)
 *
 * Roda a cada hora. Detecta subscriptions elegíveis para avanço de ciclo
 * e chama advanceSubscription dentro de transação para cada uma.
 *
 * Fluxo:
 *   1. Busca subscriptions com status IN ('trial', 'active', 'past_due') onde
 *      alguma condição de avanço pode se aplicar:
 *        - trial:             trial_ends_at   <= now()
 *        - active | past_due: current_period_end <= now()
 *   2. Para cada subscription, abre transação e chama
 *      advanceSubscription(tx, subscription.id, now).
 *   3. Agrupa resultados por transição ocorrida (para log).
 *   4. Idempotente: subscriptions em 'cancelled'/'expired' não são selecionadas
 *      (filtradas pelo WHERE na query).
 *
 * Concurrency limit = 1 para evitar overlap de rodadas simultâneas.
 *
 * docs/20-domain/13-subscription-billing.md §6.1 (transições — avanço de ciclo)
 * docs/50-business-rules/BR-SUBSCRIPTION.md (tabela de decisão)
 * docs/90-meta/03-open-questions-log.md OQ-BILL-02 (renovação atualiza current_period_*)
 * docs/30-contracts/01-enums.md §Assinatura/Cobrança (subscription_status)
 */
import { and, inArray, lte, or } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { subscription } from '@/lib/db/schema/billing'
import { advanceSubscription } from '@/lib/domain/billing/advance'

// ---------------------------------------------------------------------------
// Tipo do step — interface mínima para testabilidade
// ---------------------------------------------------------------------------

export interface StepToolkit {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>
}

// ---------------------------------------------------------------------------
// runSubscriptionAdvance — lógica isolada, injetável em testes
// ---------------------------------------------------------------------------

/**
 * Lógica principal do cron de avanço de ciclo.
 * Separada da função Inngest para permitir injeção de `now` nos testes.
 *
 * @param step  Toolkit de steps do Inngest (ou stub em testes)
 * @param now   Timestamp de referência (padrão: new Date())
 */
export async function runSubscriptionAdvance(
  step: StepToolkit,
  now: Date = new Date(),
): Promise<{ processed: number; transitions: Record<string, number> }> {
  // ── Passo 1: Buscar subscriptions candidatas ─────────────────────────
  // Condições de elegibilidade (OR):
  //   trial:             trial_ends_at   <= now
  //   active | past_due: current_period_end <= now
  // Subscriptions cancelled/expired são excluídas pelo IN ('trial','active','past_due').
  // docs/20-domain/13-subscription-billing.md §6.1
  const candidates = await step.run('fetch-advance-candidates', async () => {
    return db
      .select({
        id: subscription.id,
        status: subscription.status,
      })
      .from(subscription)
      .where(
        and(
          inArray(subscription.status, ['trial', 'active', 'past_due']),
          or(
            // trial: trial_ends_at expirou
            lte(subscription.trialEndsAt, now),
            // active | past_due: período corrente expirou
            lte(subscription.currentPeriodEnd, now),
          ),
        ),
      )
  })

  if (candidates.length === 0) {
    return { processed: 0, transitions: {} }
  }

  // ── Passo 2: Avançar cada subscription em transação individual ────────
  // Cada subscription é processada em step isolado para que falhas
  // individuais não impeçam o processamento das demais.
  const transitions: Record<string, number> = {}

  for (const row of candidates) {
    const previousStatus = row.status

    await step.run(`advance-subscription-${row.id}`, async () => {
      await db.transaction(async (tx) => {
        // advanceSubscription é idempotente: terminais (cancelled/expired)
        // retornam noop; a query já filtra esses casos na busca anterior.
        // docs/20-domain/13-subscription-billing.md §6.1
        const newStatus = await advanceSubscription(tx, row.id, now)

        // Registrar transição para log agregado
        if (newStatus !== previousStatus) {
          const key = `${previousStatus}→${newStatus}`
          transitions[key] = (transitions[key] ?? 0) + 1
        }
      })
    })
  }

  console.info('[subscription-advance] advanced subscriptions', {
    total: candidates.length,
    transitions,
  })

  return { processed: candidates.length, transitions }
}

// ---------------------------------------------------------------------------
// Inngest cron function
// ---------------------------------------------------------------------------

export const subscriptionAdvance = inngest.createFunction(
  {
    id: 'subscription-advance',
    name: 'Subscription Advance — rolar ciclo (hourly)',
    retries: 3,
    concurrency: { limit: 1 }, // evita overlap de rodadas simultâneas
  },
  { cron: '0 * * * *' }, // a cada hora
  async ({ step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return runSubscriptionAdvance(step as unknown as StepToolkit)
  },
)
