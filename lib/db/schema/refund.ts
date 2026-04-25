/**
 * MOD-REFUND — Refund schema (T-8-06)
 *
 * Tables:
 *   refund                — solicitação de reembolso por transaction
 *   refund_effect_log     — efeitos colaterais executados ao aprovar (append-only)
 *   refund_status_history — trilha de mudanças de status (append-only)
 *
 * Specs:
 *   docs/20-domain/14-refund.md §3, §3.4
 *   docs/30-contracts/01-enums.md (refund_status, integration_provider)
 *   docs/30-contracts/02-db-schema-conventions.md
 *   docs/50-business-rules/BR-REFUND.md
 *
 * Triggers (append-only):
 *   trg_refund_effect_log_append_only      — bloqueia UPDATE/DELETE em refund_effect_log
 *   trg_refund_status_history_append_only  — bloqueia UPDATE/DELETE em refund_status_history
 *   set_refund_updated_at                  — atualiza updated_at em UPDATE
 *
 * Triggers gerados em: supabase/migrations/0052_refund_triggers.sql
 */
import {
  check,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { transaction } from './transaction'
import { userAccount } from './organization'
import { integrationProviderEnum } from './webhook-log'

// ---------------------------------------------------------------------------
// Enum: refund_status
// docs/30-contracts/01-enums.md §Transação / Snapshot / Direito
//
// ---------------------------------------------------------------------------

export const refundStatusEnum = pgEnum('refund_status', [
  'requested',
  'approved',
  'rejected',
  'processed',
  'failed',
])

// ---------------------------------------------------------------------------
// refund
// docs/20-domain/14-refund.md §3.1
//
// Invariantes:
//   INV-REFUND-01: índice parcial uq_refund_active_per_transaction impede
//                  2ª solicitação ativa (requested|approved) por transaction.
//   INV-REFUND-03: amount > 0 (ck_refund_amount).
//   ck_refund_status: status IN valores canônicos do enum.
//   ck_refund_approved_coherence: status='approved' ⇒ approved_at + approved_by_user_id NOT NULL.
//
// FK:
//   transaction_id          → transaction(id) ON DELETE RESTRICT
//   opened_by_user_id       → user_account(id) ON DELETE RESTRICT
//   approved_by_user_id     → user_account(id) ON DELETE RESTRICT (nullable)
// ---------------------------------------------------------------------------

export const refund = pgTable(
  'refund',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK transaction — ON DELETE RESTRICT: transação não pode ser removida
    // enquanto houver refund. INV-REFUND-01: índice parcial abaixo.
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transaction.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // Usuário que abriu a solicitação (support/financial/admin — BR-RBAC).
    openedByUserId: uuid('opened_by_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // Usuário que aprovou/rejeitou (admin ou financial — INV-REFUND-02).
    // NULL enquanto pending ou rejected por solicitante.
    approvedByUserId: uuid('approved_by_user_id').references(
      () => userAccount.id,
      { onDelete: 'restrict', onUpdate: 'cascade' },
    ),

    // Valor do reembolso — docs/30-contracts/02-db-schema-conventions.md §12.
    // INV-REFUND-03: amount > 0 (ck_refund_amount).
    // OQ-REFUND-02: reembolso parcial pode não revogar direitos — decidir Fase 2.
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),

    // Motivo informado pelo solicitante.
    reason: text('reason').notNull(),

    // BR-REFUND: estado atual do reembolso.
    // docs/30-contracts/01-enums.md §refund_status
    status: refundStatusEnum('status').notNull().default('requested'),

    // ID do estorno no provedor externo (preenchido ao processar via webhook).
    externalRefundId: text('external_refund_id'),

    // Provedor externo que confirmou o estorno.
    externalProvider: integrationProviderEnum('external_provider'),

    // Timestamps de transição de estado.
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true }),
    processedAt: timestamp('processed_at', { withTimezone: true }),

    // docs/30-contracts/02-db-schema-conventions.md §3
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-REFUND-01: impede duas solicitações ativas (requested ou approved)
    // para a mesma transação.
    // docs/20-domain/14-refund.md §3.1 "Índice parcial único"
    uqRefundActivePerTransaction: uniqueIndex('uq_refund_active_per_transaction')
      .on(t.transactionId)
      .where(sql`status IN ('requested','approved')`),

    // Fast lookup by transaction — usado em detalhe de transação e cascata de refund.
    idxRefundTransaction: index('idx_refund_transaction_id').on(t.transactionId),

    // INV-REFUND-03: amount > 0.
    ckRefundAmount: check('ck_refund_amount', sql`${t.amount} > 0`),

    // Coerência de status 'approved': exige approved_at e approved_by_user_id.
    // docs/20-domain/14-refund.md §3.1 ck_refund_approved_coherence
    ckRefundApprovedCoherence: check(
      'ck_refund_approved_coherence',
      sql`(${t.status} = 'approved' AND ${t.approvedAt} IS NOT NULL AND ${t.approvedByUserId} IS NOT NULL)
          OR (${t.status} = 'processed' AND ${t.approvedAt} IS NOT NULL)
          OR (${t.status} NOT IN ('approved', 'processed'))`,
    ),
  }),
)

export type Refund = InferSelectModel<typeof refund>
export type NewRefund = InferInsertModel<typeof refund>

// ---------------------------------------------------------------------------
// refund_effect_log
// docs/20-domain/14-refund.md §3.2
//
// Registra cada efeito colateral executado ao aprovar o refund. Append-only.
// INV-REFUND-05: trigger bloqueia UPDATE/DELETE.
//
// FK:
//   refund_id → refund(id) ON DELETE RESTRICT
// ---------------------------------------------------------------------------

export const refundEffectLog = pgTable(
  'refund_effect_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK refund — ON DELETE RESTRICT: logs não podem ser removidos com o refund.
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refund.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // Tipo do efeito executado.
    // docs/20-domain/14-refund.md §3.2 ck_refund_effect_kind
    effectKind: text('effect_kind').notNull(),

    // ID do objeto afetado (entitlement, subscription, funnel_entry...).
    // NULL para efeitos sem referência direta (ex: timeline_emitted).
    refId: uuid('ref_id'),

    // Contexto do efeito (dados antes/depois, IDs relacionados, etc.).
    // docs/30-contracts/02-db-schema-conventions.md §7
    detail: jsonb('detail').notNull().default(sql`'{}'::jsonb`),

    // Timestamp de execução — append-only, nunca atualizado.
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),

    // Trigger de imutabilidade: trg_refund_effect_log_append_only
    // docs/20-domain/14-refund.md §3.2 INV-REFUND-05
  },
  (t) => ({
    // Fast lookup de efeitos por refund — usado em preview de aprovação e auditoria.
    idxRefundEffectLogRefundId: index('idx_refund_effect_log_refund_id').on(t.refundId),

    // ck_refund_effect_kind: só valores canônicos definidos na spec.
    // docs/20-domain/14-refund.md §3.2
    ckRefundEffectKind: check(
      'ck_refund_effect_kind',
      sql`${t.effectKind} IN (
        'snapshot_flagged',
        'entitlement_revoked',
        'contact_reclassified',
        'opportunity_reverted',
        'subscription_cancelled',
        'timeline_emitted'
      )`,
    ),
  }),
)

export type RefundEffectLog = InferSelectModel<typeof refundEffectLog>
export type NewRefundEffectLog = InferInsertModel<typeof refundEffectLog>

// ---------------------------------------------------------------------------
// refund_status_history
// docs/20-domain/14-refund.md §3.3
// docs/30-contracts/02-db-schema-conventions.md §8 (padrão de history)
//
// Trilha de mudanças de status do refund. Append-only.
// Trigger bloqueia UPDATE/DELETE.
//
// FK:
//   refund_id      → refund(id) ON DELETE RESTRICT
//   changed_by     → user_account(id) ON DELETE SET NULL
// ---------------------------------------------------------------------------

export const refundStatusHistory = pgTable(
  'refund_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // FK refund — ON DELETE RESTRICT: histórico não pode ser removido com o refund.
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refund.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // NULL na primeira linha (criação sem estado anterior).
    fromStatus: refundStatusEnum('from_status'),

    toStatus: refundStatusEnum('to_status').notNull(),

    // Usuário que causou a transição (NULL para transições de sistema, ex: webhook).
    changedBy: uuid('changed_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    // Motivo da transição (obrigatório em rejeições; opcional demais).
    reason: text('reason'),

    // Append-only — createdAt imutável, sem updatedAt.
    // docs/30-contracts/02-db-schema-conventions.md §8
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // Fast lookup de histórico por refund.
    idxRefundStatusHistoryRefundId: index('idx_refund_status_history_refund_id').on(
      t.refundId,
    ),
  }),
)

export type RefundStatusHistory = InferSelectModel<typeof refundStatusHistory>
export type NewRefundStatusHistory = InferInsertModel<typeof refundStatusHistory>
