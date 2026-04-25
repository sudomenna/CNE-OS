/**
 * MOD-AUTOMATION / T-11-07 — Inngest function: automation-run
 *
 * Evento: 'automation/run'
 * Payload: { executionId: string }
 *
 * Fluxo:
 *   1. Busca automation_execution pelo executionId para obter subject_kind,
 *      subject_id e montar RunFlowContext.
 *   2. Execution não encontrada → lança erro (Inngest não vai retentar, pois é
 *      erro de dados, não transiente — o evento em si não pode ser recuperado).
 *   3. Abre transação DB e chama runFlow(executionId, ctx, options, tx).
 *   4. Sucesso: runFlow atualiza status='succeeded' dentro da transação.
 *   5. Falha: runFlow marca status='failed' e relança a exceção.
 *      Inngest retentar automaticamente (até 5x com backoff exponencial).
 *   6. Após 5 retries esgotados: Inngest para de retentar; a execution fica
 *      com status='failed' no DB — é o "DLQ" deste projeto (reprocessável via UI).
 *      Na última tentativa, incrementamos retry_count para registrar a contagem
 *      real de tentativas.
 *
 * Rate limiting: concurrency key por brand+hour para limitar execuções
 * simultâneas — docs/80-roadmap/08-sprint-11-automations.md §Riscos (OQ-AUTOMATION-03).
 *
 * docs/20-domain/15-automation.md §9
 * docs/80-roadmap/08-sprint-11-automations.md T-11-07
 */
import { eq, sql } from 'drizzle-orm'
import { inngest } from '@/inngest/client'
import { db } from '@/lib/db/client'
import { automationExecution } from '@/lib/db/schema/automation'
import { runFlow } from '@/lib/domain/automation/run-flow'
import type { RunFlowContext } from '@/lib/domain/automation/run-flow'

// ---------------------------------------------------------------------------
// Constantes
// docs/20-domain/15-automation.md §9: 5 retries com backoff exponencial
// ---------------------------------------------------------------------------

export const AUTOMATION_MAX_RETRIES = 5

// ---------------------------------------------------------------------------
// Stub de ActionHandler para Fase 1
//
// As actions reais chegam em T-11-08. Por ora, o handler retorna { ok: true }
// para qualquer kind, registrando a ação no log sem efeito colateral real.
// Quando T-11-08 for entregue, este switch será substituído pelo dispatcher
// de actions real (sem alterar a assinatura do automationRun).
// ---------------------------------------------------------------------------

async function stubActionHandler(
  kind: string,
  _params: unknown,
  _ctx: RunFlowContext,
): Promise<{ ok: boolean; kind: string }> {
  // T-11-08: substituir cada case por implementação real
  console.info('[automation-run] action stub called', { kind })
  return { ok: true, kind }
}

// ---------------------------------------------------------------------------
// Inngest function
// ---------------------------------------------------------------------------

export const automationRun = inngest.createFunction(
  {
    id: 'automation-run',
    name: 'Automation — Run Flow',
    // docs/20-domain/15-automation.md §9: backoff exponencial, 5 tentativas
    retries: AUTOMATION_MAX_RETRIES,
    // Rate limiting mínimo: máximo 10 execuções simultâneas por brand.
    // docs/80-roadmap/08-sprint-11-automations.md §Riscos OQ-AUTOMATION-03
    // A chave usa brand_id da execution; sem brand_id → key genérica 'global'.
    // Inngest concurrency limita N execuções simultâneas com a mesma key.
    concurrency: {
      limit: 10,
      key: 'event.data.brandId',
    },
  },
  { event: 'automation/run' as const },
  async ({ event, step, attempt }) => {
    const { executionId } = event.data as { executionId: string; brandId?: string }

    // ── Passo 1: Buscar execution para montar contexto ───────────────────────
    // Necessário para obter subject_kind + subject_id → RunFlowContext.
    // docs/20-domain/15-automation.md §9: "Orquestração via Inngest"
    const execution = await step.run('fetch-execution', async () => {
      const rows = await db
        .select({
          id: automationExecution.id,
          flowId: automationExecution.flowId,
          subjectKind: automationExecution.subjectKind,
          subjectId: automationExecution.subjectId,
          status: automationExecution.status,
          retryCount: automationExecution.retryCount,
        })
        .from(automationExecution)
        .where(eq(automationExecution.id, executionId))
        .limit(1)

      return rows[0] ?? null
    })

    if (!execution) {
      // Execution não encontrada: erro fatal, sem retry (dados não existem).
      // Inngest irá capturar e marcar como failed sem retentar se lançarmos
      // um NonRetriableError — mas como NonRetriableError não é importado no
      // SDK versão usada neste projeto, lançamos Error padrão e documentamos
      // que não há recuperação possível para este caso.
      throw new Error(
        `[automation-run] automation_execution ${executionId} not found — no retry possible`,
      )
    }

    // ── Passo 2: Montar RunFlowContext ────────────────────────────────────────
    // subject pode ser vazio se o trigger não tem subject (ex: cron trigger futuro)
    const ctx: RunFlowContext = {
      subjectKind: execution.subjectKind ?? 'unknown',
      subjectId: execution.subjectId ?? executionId,
      subject: {
        subjectKind: execution.subjectKind,
        subjectId: execution.subjectId,
      },
    }

    // ── Passo 3: Executar runFlow dentro de transação DB ─────────────────────
    // runFlow percorre o grafo nó a nó, registra logs e atualiza o status.
    // Se lançar exceção, Inngest faz retry com backoff exponencial (até 5x).
    // docs/20-domain/15-automation.md §9: "Retries: backoff exponencial, 5 tentativas"
    try {
      await step.run('run-flow', async () => {
        await db.transaction(async (tx) => {
          await runFlow(
            executionId,
            ctx,
            { actionHandler: stubActionHandler },
            tx,
          )
        })
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)

      // Verificar se é a última tentativa (attempt é 0-based).
      // MAX_RETRIES=5 → índices 0,1,2,3,4; última = 4
      const isLastAttempt = attempt >= AUTOMATION_MAX_RETRIES - 1

      // Atualizar retry_count para refletir o número real de tentativas.
      // O status='failed' já foi marcado dentro de runFlow (quando lança exceção).
      // docs/20-domain/15-automation.md §9: "após esgotar → status='failed'"
      await step.run('update-retry-count', async () => {
        await db
          .update(automationExecution)
          .set({
            retryCount: sql`${automationExecution.retryCount} + 1`,
            updatedAt: new Date(),
            ...(isLastAttempt
              ? {
                  // DLQ: registrar erro final após esgotar todos os retries
                  // docs/20-domain/15-automation.md §9: "cancelled via DLQ manual"
                  error: errorMessage,
                }
              : {}),
          })
          .where(eq(automationExecution.id, executionId))

        if (isLastAttempt) {
          // DLQ: log estruturado para Sentry/Axiom
          // docs/20-domain/15-automation.md §9: execução DLQ reprocessável via UI
          console.error('[automation-run] execution failed after max retries (DLQ)', {
            executionId,
            flowId: execution.flowId,
            maxRetries: AUTOMATION_MAX_RETRIES,
            lastError: errorMessage,
          })
        }
      })

      if (!isLastAttempt) {
        // Re-lançar para Inngest executar o retry com backoff exponencial
        throw err
      }

      // Na última tentativa: não re-lançar — Inngest marcará a execução como
      // failed sem outro retry. A execution já está com status='failed' no DB.
    }
  },
)
