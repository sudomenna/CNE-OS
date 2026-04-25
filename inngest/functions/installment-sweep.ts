/**
 * MOD-BILLING / T-9-09 — Inngest cron: installment-sweep (scheduled → overdue)
 *
 * Roda a cada hora. Detecta parcelas com status='scheduled' e due_at no passado
 * e as marca como overdue chamando handleInstallmentOverdue dentro de transação.
 *
 * Fluxo:
 *   1. Busca todas installments com status='scheduled' AND due_at < now()
 *      usando idx_installment_status_due (docs/20-domain/13-subscription-billing.md §3.2)
 *   2. Para cada installment encontrada, abre transação e chama
 *      handleInstallmentOverdue(tx, installment.id)
 *   3. Idempotência garantida: a query filtra apenas 'scheduled' — parcelas já
 *      'overdue' não são retornadas, portanto handleInstallmentOverdue nunca é
 *      invocado para elas (§6.2: se já overdue, retorna sem UPDATE).
 *   4. Loga quantidade de parcelas marcadas como overdue.
 *
 * docs/20-domain/13-subscription-billing.md §7 (dunning — sweep de parcelas)
 * docs/30-contracts/01-enums.md §Assinatura/Cobrança (installment_status)
 */
import { and, eq, lt, sql } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { installment } from '@/lib/db/schema/billing'
import { handleInstallmentOverdue } from '@/lib/domain/billing/handle-installment'

// ---------------------------------------------------------------------------
// Inngest cron function
// ---------------------------------------------------------------------------

export const installmentSweep = inngest.createFunction(
  {
    id: 'installment-sweep',
    name: 'Installment Sweep — scheduled → overdue (hourly)',
    retries: 3,
    concurrency: { limit: 1 }, // evita overlap de rodadas simultâneas
  },
  { cron: '0 * * * *' }, // a cada hora
  async ({ step }) => {
    // ── Passo 1: Buscar parcelas scheduled vencidas ──────────────────────
    // Usa idx_installment_status_due ON installment(status, due_at)
    // docs/20-domain/13-subscription-billing.md §3.2
    const overdueInstallments = await step.run('fetch-overdue-candidates', async () => {
      return db
        .select({ id: installment.id })
        .from(installment)
        .where(
          and(
            eq(installment.status, 'scheduled'),
            lt(installment.due_at, sql`now()`),
          ),
        )
    })

    if (overdueInstallments.length === 0) {
      return { marked: 0 }
    }

    // ── Passo 2: Marcar cada parcela como overdue em transação individual ─
    // Cada parcela é processada em step isolado para que falhas individuais
    // não impeçam o processamento das demais.
    let markedCount = 0

    for (const row of overdueInstallments) {
      await step.run(`mark-overdue-${row.id}`, async () => {
        await db.transaction(async (tx) => {
          // handleInstallmentOverdue é idempotente:
          // se já estiver overdue, retorna sem UPDATE (INV-BILL-06)
          // §6.2: scheduled → overdue (única transição válida aqui)
          await handleInstallmentOverdue(tx, row.id)
        })
        markedCount++
      })
    }

    console.info('[installment-sweep] marked installments as overdue', {
      total: overdueInstallments.length,
      marked: markedCount,
    })

    return { marked: markedCount }
  },
)
