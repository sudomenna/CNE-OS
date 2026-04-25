/**
 * MOD-AUTOMATION — Action: open_ticket (T-11-08)
 *
 * docs/20-domain/15-automation.md §7 Actions
 * ADR-11: tx obrigatório como primeiro argumento
 *
 * Cria ticket para o contato subject com title e category opcionais.
 * Usa a interface pública MOD-TICKET.openTicket.
 */
import type { DbTx } from '@/lib/db/client'
import { openTicket } from '@/lib/domain/ticket/open'
import type { RunFlowContext } from '../run-flow'
import type { ActionEffect } from './types'

export type OpenTicketParams = {
  title: string
  category?: string
}

// Tipos válidos de category do ticket — alinhados com MOD-TICKET.OpenTicketInput
type TicketCategory =
  | 'commercial'
  | 'support'
  | 'financial'
  | 'cancellation'
  | 'refund'
  | 'access'
  | 'registration'
  | 'other'

const VALID_CATEGORIES: TicketCategory[] = [
  'commercial',
  'support',
  'financial',
  'cancellation',
  'refund',
  'access',
  'registration',
  'other',
]

function isValidCategory(value: string): value is TicketCategory {
  return VALID_CATEGORIES.includes(value as TicketCategory)
}

/**
 * open_ticket — abre ticket com contact_id = ctx.subjectId.
 *
 * brandId é derivado de ctx.subject.brandId se disponível, ou fallback para placeholder.
 * openedByUserId é o actor da execução (ctx.subject.actorUserId) ou sistema.
 * Pós: chama MOD-TICKET.openTicket (registra histórico + emite TE-TICKET-OPENED).
 */
export async function openTicketAction(
  params: OpenTicketParams,
  ctx: RunFlowContext,
  tx: DbTx,
): Promise<ActionEffect> {
  const contactId = ctx.subjectId

  // Resolver category — fallback para 'other' se inválida ou ausente
  const category: TicketCategory =
    params.category && isValidCategory(params.category) ? params.category : 'other'

  // brandId e openedByUserId vêm do contexto de execução se disponíveis
  const brandId = (ctx.subject.brandId as string | undefined) ?? null
  const openedByUserId = (ctx.subject.actorUserId as string | undefined) ?? null

  if (!brandId) {
    return { ok: false, error: 'open_ticket: brandId not available in run context' }
  }

  if (!openedByUserId) {
    return { ok: false, error: 'open_ticket: actorUserId not available in run context' }
  }

  // Delegar para MOD-TICKET.openTicket (emite TE-TICKET-OPENED)
  const createdTicket = await openTicket(tx, {
    contactId,
    brandId,
    category,
    priority: 'medium',        // Fase 1: prioridade padrão — Fase 2 pode parametrizar
    title: params.title,
    description: null,
    openedByUserId,
    originConversationId: null,
  })

  return { ok: true, output: { ticketId: createdTicket.id } }
}
