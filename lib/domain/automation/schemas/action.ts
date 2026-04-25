/**
 * MOD-AUTOMATION — Schemas de params por action kind (T-11-13)
 *
 * Schema Zod discriminado por `kind` para `automation_action.params`.
 * INV-AUTOMATION-04: Server Action valida params antes de persistir via .parse().
 * Kinds definidos em docs/30-contracts/01-enums.md §Automação: automation_action_kind.
 * Shapes detalhados em docs/20-domain/15-automation.md §7 Actions.
 */
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Schemas de params por kind
// docs/20-domain/15-automation.md §7 — Actions (Fase 1)
// ---------------------------------------------------------------------------

// apply_tag: adiciona tag em contato ou oportunidade
// tag é obrigatória — INV-AUTOMATION-04 exige rejeição sem params obrigatório
const applyTagParamsSchema = z.object({
  kind: z.literal('apply_tag'),
  tag: z.string().min(1),
})

// move_stage: move funnel_entry.current_stage_id
// funnel_id e stage_id obrigatórios
const moveStageParamsSchema = z.object({
  kind: z.literal('move_stage'),
  funnel_id: z.string().uuid(),
  stage_id: z.string().uuid(),
})

// open_ticket: chama MOD-TICKET.openTicket
// title obrigatório; category opcional
const openTicketParamsSchema = z.object({
  kind: z.literal('open_ticket'),
  title: z.string().min(1),
  category: z.string().optional(),
})

// notify_user: notifica usuário interno (realtime + e-mail)
// user_id e message obrigatórios
const notifyUserParamsSchema = z.object({
  kind: z.literal('notify_user'),
  user_id: z.string().uuid(),
  message: z.string().min(1),
})

// emit_timeline_event: emite TE-AUTOMATION-EXECUTED ou custom
// kind obrigatório; body opcional
const emitTimelineEventParamsSchema = z.object({
  kind: z.literal('emit_timeline_event'),
  // "kind" do evento de timeline a emitir (ex.: 'te_automation_executed')
  event_kind: z.string().min(1),
  body: z.record(z.string(), z.unknown()).optional(),
})

// send_external: dispara envio externo (Brevo, WhatsApp) com idempotência
// INV-AUTOMATION-04: url obrigatória; INV-AUTOMATION-04 refs BR-INTEGRATION-IDEMPOTENCY
const sendExternalParamsSchema = z.object({
  kind: z.literal('send_external'),
  url: z.string().url(),
  method: z.enum(['POST', 'PUT']).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

// ---------------------------------------------------------------------------
// Union discriminada por kind
// INV-AUTOMATION-04: actionParamsSchema.parse(params) deve rejeitar params inválidos
// ---------------------------------------------------------------------------

export const actionParamsSchema = z.discriminatedUnion('kind', [
  applyTagParamsSchema,
  moveStageParamsSchema,
  openTicketParamsSchema,
  notifyUserParamsSchema,
  emitTimelineEventParamsSchema,
  sendExternalParamsSchema,
])

export type ActionParamsInput = z.infer<typeof actionParamsSchema>
