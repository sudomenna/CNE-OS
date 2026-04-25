/**
 * MOD-AUTOMATION — Dispatcher de gatilhos de automação (T-11-06)
 *
 * docs/20-domain/15-automation.md §2 (dispatcher) e §7 (triggers)
 * docs/80-roadmap/08-sprint-11-automations.md (T-11-06)
 *
 * ADR-10: funções públicas retornam Promise<T> e lançam DomainError
 * ADR-11: tx: DbTx como primeiro argumento (função muta estado)
 *
 * Fluxo:
 *   1. Busca automation_flow(is_active=true) com automation_trigger(kind=kind)
 *   2. Para cada fluxo, verifica se o filter do trigger bate com subject.data
 *   3. Calcula idempotency_key = hash(flowId + kind + subjectId + minute bucket)
 *   4. Tenta inserir automation_execution(status=pending)
 *      — conflito em uq_automation_execution_idem → skip silencioso (INV-AUTOMATION-03)
 *   5. Retorna array de executionIds criados (excluindo os ignorados)
 */

import { and, eq } from 'drizzle-orm'
import { createHash } from 'crypto'
import type { DbTx } from '@/lib/db/client'
import {
  automationFlow,
  automationNode,
  automationTrigger,
  automationExecution,
  automationTriggerKindEnum,
} from '@/lib/db/schema/automation'

// ---------------------------------------------------------------------------
// Tipo inferido do enum de trigger kind — garante type safety sem `any`
// ---------------------------------------------------------------------------
type AutomationTriggerKind = (typeof automationTriggerKindEnum.enumValues)[number]

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type TriggerSubject = {
  /** Tipo do subject que originou o evento (ex: 'contact', 'transaction', 'funnel_entry') */
  subjectKind: string
  /** ID do subject */
  subjectId: string
  /** Campos disponíveis para filter matching e evalCondition */
  data: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Utilitários internos
// ---------------------------------------------------------------------------

/**
 * Calcula idempotency_key com granularidade de 1 minuto.
 *
 * Formato: SHA-256(flowId + ':' + kind + ':' + subjectId + ':' + minute)
 * onde minute = ISO "YYYY-MM-DDTHH:mm" (truncado ao minuto).
 *
 * Granularidade de 1 minuto: deduplicar reentregas rápidas sem bloquear
 * re-disparos legítimos após 1 minuto.
 *
 * docs/80-roadmap/08-sprint-11-automations.md T-11-06: "granularidade de 1 minuto"
 */
export function computeIdempotencyKey(
  flowId: string,
  kind: string,
  subjectId: string,
  triggeredAt: Date,
): string {
  const minute = triggeredAt.toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm"
  const raw = `${flowId}:${kind}:${subjectId}:${minute}`
  return createHash('sha256').update(raw).digest('hex')
}

/**
 * Verifica se um filter de trigger é compatível com subject.data.
 *
 * Regras:
 *   - filter vazio ({}) → captura todos os subjects do kind (sempre true)
 *   - cada chave presente no filter deve bater com o campo correspondente
 *     em subject.data (comparação por igualdade estrita)
 *
 * docs/80-roadmap/08-sprint-11-automations.md T-11-06: "Filter matching"
 */
export function matchesFilter(
  filter: Record<string, unknown>,
  subjectData: Record<string, unknown>,
): boolean {
  const filterKeys = Object.keys(filter)
  // Filter vazio: captura todos os subjects do kind
  if (filterKeys.length === 0) return true

  // Cada chave do filter deve bater com o valor correspondente em subjectData
  for (const key of filterKeys) {
    if (subjectData[key] !== filter[key]) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// dispatchTrigger — função pública principal
// ADR-11: tx como primeiro argumento
// ---------------------------------------------------------------------------

/**
 * Seleciona fluxos ativos com trigger compatível com `kind` e cria
 * automation_execution(status=pending) para cada um.
 *
 * Idempotência: conflito em uq_automation_execution_idem → skip silencioso.
 * Quem chama o Inngest é o caller (T-11-09) — este módulo apenas cria executions.
 *
 * @param kind   - automation_trigger_kind (ex: 'sale_approved', 'funnel_enter')
 * @param subject - dados do evento que originou o disparo
 * @param tx     - transação DB (ADR-11)
 * @returns array de executionIds criados (não os ignorados por duplicata)
 */
export async function dispatchTrigger(
  kind: string,
  subject: TriggerSubject,
  tx: DbTx,
): Promise<string[]> {
  const triggeredAt = new Date()

  // -------------------------------------------------------------------------
  // Passo 1: Buscar automation_flow(is_active=true) com trigger(kind=kind)
  //
  // Join: automation_flow → automation_node(kind='trigger') → automation_trigger(kind=kind)
  // -------------------------------------------------------------------------
  const flows = await tx
    .select({
      flowId: automationFlow.id,
      triggerFilter: automationTrigger.filter,
    })
    .from(automationFlow)
    .innerJoin(automationNode, eq(automationNode.flowId, automationFlow.id))
    .innerJoin(automationTrigger, eq(automationTrigger.nodeId, automationNode.id))
    .where(
      and(
        eq(automationFlow.isActive, true),
        // INV-AUTOMATION-01: fluxos soft-deleted são marcados is_active=false antes
        // de receber deleted_at, portanto filtrar is_active=true já exclui deletados.
        eq(automationTrigger.kind, kind as AutomationTriggerKind),
      ),
    )

  // Nenhum fluxo ativo para o kind → retorna vazio
  if (flows.length === 0) return []

  // -------------------------------------------------------------------------
  // Passo 2: Filtrar fluxos cujo filter do trigger bate com subject.data
  // -------------------------------------------------------------------------
  const createdExecutionIds: string[] = []

  for (const flow of flows) {
    const filter = (flow.triggerFilter ?? {}) as Record<string, unknown>

    // BR-AUTOMATION-FILTER: filter vazio captura todos; senão cada chave deve bater
    if (!matchesFilter(filter, subject.data)) continue

    // -----------------------------------------------------------------------
    // Passo 3: Calcular idempotency_key
    // Granularidade de 1 minuto para deduplicar reentregas rápidas
    // INV-AUTOMATION-03: (flow_id, idempotency_key) UNIQUE
    // -----------------------------------------------------------------------
    const idempotencyKey = computeIdempotencyKey(flow.flowId, kind, subject.subjectId, triggeredAt)

    // -----------------------------------------------------------------------
    // Passo 4: Tentar inserir automation_execution
    // Conflito em uq_automation_execution_idem → skip silencioso (sem erro)
    // INV-AUTOMATION-03: mesmo evento não dispara 2 execuções do mesmo fluxo
    // -----------------------------------------------------------------------
    try {
      const [inserted] = await tx
        .insert(automationExecution)
        .values({
          flowId: flow.flowId,
          subjectKind: subject.subjectKind,
          subjectId: subject.subjectId,
          idempotencyKey,
          status: 'pending',
          triggeredAt,
        })
        .returning({ id: automationExecution.id })
        .onConflictDoNothing()

      // onConflictDoNothing retorna undefined quando há conflito
      if (inserted) {
        createdExecutionIds.push(inserted.id)
      }
    } catch {
      // Fallback defensivo: conflito de unique constraint → skip silencioso
      // Em produção, onConflictDoNothing cobre isso; este catch é para segurança extra
      // INV-AUTOMATION-03: duplicata silenciosa, não lança erro
    }
  }

  // -------------------------------------------------------------------------
  // Passo 5: Retornar apenas os executionIds efetivamente criados
  // -------------------------------------------------------------------------
  return createdExecutionIds
}
