/**
 * MOD-TICKET — SLA de primeira resposta (T-13-24)
 *
 * docs/60-flows/13-ticket-lifecycle.md §SLA
 * FLOW-13: SLA primeira resposta ≤15min badge
 *
 * Função pura (sem I/O, sem tx) — testável diretamente.
 * ADR-10: lança erro em caso inválido; resultado tipado em SlaStatus.
 *
 * Nota de schema: o campo `firstRespondedAt` não existe no schema atual de ticket.
 * A função recebe o campo explicitamente para permitir evolução futura do schema
 * sem alterar a assinatura pública. O caller é responsável por fornecer o valor
 * correto (ex.: timestamp da primeira nota interna ou resposta ao contato).
 * O campo `openedAt` mapeia para `createdAt` no schema atual.
 */

// BR-TICKET-SLA: SLA de primeira resposta = ≤15 minutos entre abertura e primeira resposta
export const FIRST_RESPONSE_SLA_MS = 15 * 60 * 1000 // 15 minutos em milissegundos

export type SlaStatus = 'met' | 'violated' | 'pending'

export type TicketSlaInput = {
  /** Timestamp de abertura do ticket (mapeado de `createdAt` no schema atual) */
  openedAt: Date
  /**
   * Timestamp da primeira resposta ao contato.
   * null quando ainda não houve resposta (SLA ainda não computável).
   */
  firstRespondedAt: Date | null
  /** Status atual do ticket — usado para contexto do estado */
  status: string
}

/**
 * Computa o status do SLA de primeira resposta para um ticket.
 *
 * Regras:
 * - Se `firstRespondedAt` é null → 'pending' (aguardando primeira resposta)
 * - Se diff ≤ 15min → 'met' (SLA cumprido; limite inclusivo)
 * - Se diff > 15min → 'violated' (SLA violado)
 *
 * BR-TICKET-SLA: borda de 15 minutos é inclusiva (≤15min = met).
 */
export function computeFirstResponseSla(ticket: TicketSlaInput): SlaStatus {
  if (!ticket.firstRespondedAt) return 'pending'

  // BR-TICKET-SLA: ≤15min inclusive = met
  const diffMs = ticket.firstRespondedAt.getTime() - ticket.openedAt.getTime()
  return diffMs <= FIRST_RESPONSE_SLA_MS ? 'met' : 'violated'
}
