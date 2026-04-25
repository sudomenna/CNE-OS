/**
 * MOD-AUTOMATION — Action: send_external (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions, INV-AUTOMATION-04
 * ADR-11: tx obrigatório como primeiro argumento (recebido mas não usado diretamente — futuro log)
 *
 * Realiza chamada HTTP para URL externa com método e payload configuráveis.
 * Timeout de 10 segundos. Erros HTTP 4xx/5xx retornam ok=false sem lançar exceção.
 * Erros de rede (fetch falha) relançam para Inngest retry.
 */
import type { DbTx } from '@/lib/db/client'
import type { RunFlowContext } from '../run-flow'
import type { ActionEffect } from './types'

export type SendExternalParams = {
  url: string
  method?: 'POST' | 'PUT'
  payload?: Record<string, unknown>
}

const FETCH_TIMEOUT_MS = 10_000

/**
 * send_external — dispara envio HTTP externo com idempotência via timeout e retry Inngest.
 *
 * INV-AUTOMATION-04: `external_event_id` determinístico a partir de (execution_id, node_id)
 * é de responsabilidade do Inngest handler (T-11-07), não desta função pura.
 *
 * Comportamento:
 * - Timeout: 10s via AbortController
 * - 4xx/5xx: retorna { ok: false, error: 'HTTP <status>' } — não lança
 * - Erro de rede / timeout: lança para Inngest retry
 */
export async function sendExternal(
  params: SendExternalParams,
  _ctx: RunFlowContext,
  _tx: DbTx,
): Promise<ActionEffect> {
  const method = params.method ?? 'POST'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  const body: string | null =
    params.payload !== undefined ? JSON.stringify(params.payload) : null

  let response: Response
  try {
    response = await fetch(params.url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ?? null,
      signal: controller.signal,
    })
  } catch (err: unknown) {
    clearTimeout(timeoutId)
    // Erro de rede ou timeout — relançar para Inngest retry
    // docs/20-domain/15-automation.md §9: backoff exponencial, 5 tentativas
    throw err
  } finally {
    clearTimeout(timeoutId)
  }

  const status = response.status

  if (!response.ok) {
    // 4xx/5xx — erro controlado, não faz retry (ex: webhook destino retornou 422)
    return { ok: false, error: `HTTP ${status}` }
  }

  return { ok: true, output: { status } }
}
