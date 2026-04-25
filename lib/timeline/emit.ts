/**
 * MOD-TIMELINE — emitTimelineEvent
 *
 * docs/20-domain/04-timeline.md §3.3
 * docs/50-business-rules/BR-TIMELINE.md
 *
 * ADR-11: tx is optional first-class parameter (write function).
 * ADR-10: throws domain errors — never returns Result<T,E>.
 *
 * T-11-09: hook pós-emit → dispatcher de automação.
 * Após cada emissão bem-sucedida, mapeia o TE kind para automation_trigger_kind
 * e chama dispatchTrigger (dentro da tx) + inngest.send (fora, fire-and-forget).
 * BR-AUTOMATION-LOOP: kinds 'automation_executed' e 'user_notification' nunca
 * disparam trigger (evitar loop de auto-reativação).
 */
import { db } from '@/lib/db/client'
import type { DbTx } from '@/lib/db/client'
import { timelineEvent } from '@/lib/db/schema/timeline'
import type { TimelineEvent } from '@/lib/db/schema/timeline'
import { getKindEntry } from './schemas/index'
import {
  UnknownTimelineKindError,
  TimelinePayloadError,
  TimelineOccurredAtError,
} from './errors'
import { dispatchTrigger } from '@/lib/domain/automation/dispatch'
import { inngest } from '@/inngest/client'

// ---------------------------------------------------------------------------
// T-11-09: Mapeamento TE kind → automation_trigger_kind
//
// Apenas os TEs listados aqui disparam automação.
// Qualquer outro kind retorna undefined → não dispara.
// docs/80-roadmap/08-sprint-11-automations.md T-11-09
// ---------------------------------------------------------------------------

const TE_KIND_TO_TRIGGER_KIND: Record<string, string> = {
  // TE kind (KIND_REGISTRY key) → automation_trigger_kind
  // docs/80-roadmap/08-sprint-11-automations.md T-11-09
  funnel_stage_changed: 'funnel_stage_change',   // TE-FUNNEL-STAGE-CHANGED → funnel_stage_change
  funnel_entered: 'funnel_enter',                 // TE-FUNNEL-ENTERED → funnel_enter
  message_inbound: 'new_message',                 // TE-MESSAGE-INBOUND → new_message
  checkout_abandoned: 'checkout_abandoned',       // checkout expired → checkout_abandoned
  sale_approved: 'sale_approved',                 // TE-SALE-APPROVED → sale_approved
  ticket_opened: 'ticket_opened',                 // TE-TICKET-OPENED → ticket_opened
}

// BR-AUTOMATION-LOOP: prevents automation re-triggering itself
// Kinds emitidos pelo próprio motor de automação nunca devem redisparar.
const AUTOMATION_EXCLUDED_KINDS: ReadonlySet<string> = new Set([
  'automation_executed',
  'user_notification',
])

// BR-TIMELINE §2: module source identifiers
export type ModuleSource =
  | 'MOD-CONTACT'
  | 'MOD-MERGE'
  | 'MOD-INBOX'
  | 'MOD-TICKET'
  | 'MOD-FUNNEL'
  | 'MOD-CAMPAIGN'
  | 'MOD-TRANSACTION'
  | 'MOD-REFUND'
  | 'MOD-ENTITLEMENT'
  | 'MOD-BILLING'
  | 'MOD-INTEGRATION'
  | 'MOD-AUTOMATION'

export type TimelineEventInput = {
  contactId: string
  brandId?: string | null
  kind: string
  source: ModuleSource
  actorUserId?: string | null   // XOR com actorSystem — INV-TIMELINE-02
  actorSystem?: string | null
  subjectKind?: string | null
  subjectId?: string | null
  payload: Record<string, unknown>
  occurredAt?: Date
}

export async function emitTimelineEvent(
  input: TimelineEventInput,
  tx?: DbTx,
): Promise<TimelineEvent> {
  // BR-TIMELINE INV-TIMELINE-02: actorUserId XOR actorSystem — at least one required
  if (!input.actorUserId && !input.actorSystem) {
    throw new Error('emitTimelineEvent: actorUserId or actorSystem is required')
  }

  // BR-TIMELINE: kind must be registered in the catalog
  const entry = getKindEntry(input.kind)
  if (!entry) {
    throw new UnknownTimelineKindError(input.kind)
  }

  // BR-TIMELINE: payload must conform to the kind's Zod schema
  const parsed = entry.schema.safeParse(input.payload)
  if (!parsed.success) {
    throw new TimelinePayloadError(input.kind, parsed.error.message)
  }

  // BR-TIMELINE INV-TIMELINE-06: occurredAt must not be in the future
  const occurredAt = input.occurredAt ?? new Date()
  if (occurredAt > new Date()) {
    throw new TimelineOccurredAtError()
  }

  // INSERT — use provided tx or fall back to the global db instance
  const executor = tx ?? db
  const rows = await executor
    .insert(timelineEvent)
    .values({
      contactId: input.contactId,
      brandId: input.brandId ?? null,
      kind: input.kind,
      source: input.source,
      actorUserId: input.actorUserId ?? null,
      actorSystem: input.actorSystem ?? null,
      subjectKind: input.subjectKind ?? null,
      subjectId: input.subjectId ?? null,
      payload: parsed.data as Record<string, unknown>,
      occurredAt,
    })
    .returning()

  const row = rows[0]
  if (!row) {
    throw new Error('emitTimelineEvent: INSERT returned no row')
  }

  // ---------------------------------------------------------------------------
  // T-11-09: Hook pós-emit — dispatcher de automação
  //
  // Fluxo:
  //   1. Guard anti-loop (BR-AUTOMATION-LOOP)
  //   2. Mapeia TE kind → automation_trigger_kind
  //   3. dispatchTrigger(kind, subject, tx) — cria automation_execution(pending)
  //      dentro da mesma transação (atomicidade com o TE)
  //   4. Para cada executionId: inngest.send fire-and-forget (fora da tx)
  //      — falha no envio não afeta o TE emitido
  //
  // Não bloqueia o emissor: inngest.send nunca é awaited de forma síncrona.
  // Se o caller não passou tx, usa db (global) — o dispatchTrigger recebe um
  // objeto compatível com DbTx (db também satisfaz a interface).
  // ---------------------------------------------------------------------------

  // BR-AUTOMATION-LOOP: prevents automation re-triggering itself
  if (AUTOMATION_EXCLUDED_KINDS.has(input.kind)) {
    return row
  }

  const triggerKind = TE_KIND_TO_TRIGGER_KIND[input.kind]
  if (!triggerKind) {
    // TE kind sem mapeamento → não dispara automação
    return row
  }

  // dispatchTrigger roda dentro da transação existente
  const txForDispatch = (tx ?? db) as DbTx
  const subject = {
    subjectKind: input.subjectKind ?? input.kind,
    subjectId: input.subjectId ?? input.contactId,
    data: {
      ...input.payload,
      contactId: input.contactId,
      brandId: input.brandId ?? null,
      subjectKind: input.subjectKind ?? null,
      subjectId: input.subjectId ?? null,
    } as Record<string, unknown>,
  }

  // Executar dispatch e enfileirar no Inngest de forma fire-and-forget.
  // O .then/.catch é executado após a resolução da Promise, não bloqueando o return.
  void dispatchTrigger(triggerKind, subject, txForDispatch)
    .then((executionIds) => {
      if (executionIds.length === 0) return
      // inngest.send para cada execution criada — fire-and-forget
      void inngest
        .send(
          executionIds.map((executionId) => ({
            name: 'automation/run' as const,
            data: { executionId },
          })),
        )
        .catch((err: unknown) =>
          console.error('[automation dispatch] inngest.send failed', err),
        )
    })
    .catch((err: unknown) =>
      console.error('[automation dispatch] dispatchTrigger failed', err),
    )

  return row
}
