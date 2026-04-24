/**
 * MOD-FUNNEL — Funnel & Opportunity aggregate schema
 *
 * Tables in this file (added progressively across T-5-07 → T-5-09):
 *   T-5-07: funnel, funnel_stage
 *   T-5-08: funnel_entry                         (+ uq_funnel_entry_active)
 *   T-5-09: funnel_entry_stage_history, funnel_entry_score_history,
 *            funnel_score_rule, sales_target, opportunity_tag
 *
 * Specs:
 *   docs/20-domain/08-funnel-opportunity.md §3
 *   docs/30-contracts/01-enums.md (funnel_opportunity_label)
 *   docs/30-contracts/02-db-schema-conventions.md
 *   docs/50-business-rules/BR-FUNNEL-OPPORTUNITY.md
 */
import {
  boolean,
  date,
  index,
  integer,
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

import { brand, userAccount } from './organization'
import { campaign, creative } from './campaign'
import { contact } from './contact'

// ---------------------------------------------------------------------------
// Enums
// docs/30-contracts/01-enums.md — Marketing / Funil
// ---------------------------------------------------------------------------

export const funnelOpportunityLabelEnum = pgEnum('funnel_opportunity_label', [
  'open',
  'negotiating',
  'concluded',
  'won',
  'lost',
  'reopened',
])

// ---------------------------------------------------------------------------
// T-5-07: funnel
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: funnel
// ---------------------------------------------------------------------------

export const funnel = pgTable(
  'funnel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Multi-brand — docs/30-contracts/02-db-schema-conventions.md §5
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // INV-FUNNEL-02: offer_id é a oferta principal do funil; variações via offer_condition
    // offer table pertence a MOD-OFFER (T-5-x); FK adicionada quando schema existir
    offerId: uuid('offer_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // docs/20-domain/08-funnel-opportunity.md DDL — uq_funnel_slug_brand
    uqFunnelSlugBrand: uniqueIndex('uq_funnel_slug_brand').on(t.brandId, t.slug),
    idxFunnelBrand: index('idx_funnel_brand').on(t.brandId),
    idxFunnelOffer: index('idx_funnel_offer').on(t.offerId),
  }),
)

export type Funnel = InferSelectModel<typeof funnel>
export type NewFunnel = InferInsertModel<typeof funnel>

// ---------------------------------------------------------------------------
// T-5-07: funnel_stage
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: funnel_stage
// ---------------------------------------------------------------------------

export const funnelStage = pgTable(
  'funnel_stage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    funnelId: uuid('funnel_id')
      .notNull()
      .references(() => funnel.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    // position define a ordem de exibição no kanban (não impõe transições)
    position: integer('position').notNull(),
    // is_terminal: true = estágio de "ganho/perdido" estrutural (OQ-FUNNEL-01)
    isTerminal: boolean('is_terminal').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-FUNNEL-stage-position: duas etapas no mesmo funil não podem ter a mesma posição
    // BR-FUNNEL-OPPORTUNITY: uq_funnel_stage_position garante ordinalidade sem gaps implícitos
    uqFunnelStagePosition: uniqueIndex('uq_funnel_stage_position').on(t.funnelId, t.position),
    idxFunnelStageFunnel: index('idx_funnel_stage_funnel').on(t.funnelId),
  }),
)

export type FunnelStage = InferSelectModel<typeof funnelStage>
export type NewFunnelStage = InferInsertModel<typeof funnelStage>

// ---------------------------------------------------------------------------
// T-5-08: funnel_entry
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: funnel_entry
// INV-FUNNEL-01: 1 oportunidade ativa por (contact_id, funnel_id)
// ---------------------------------------------------------------------------

export const funnelEntry = pgTable(
  'funnel_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    funnelId: uuid('funnel_id')
      .notNull()
      .references(() => funnel.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    currentStageId: uuid('current_stage_id')
      .notNull()
      .references(() => funnelStage.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    ownerUserId: uuid('owner_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // INV-FUNNEL-01: label macro — "ativo" = NOT IN ('won','lost')
    // docs/30-contracts/01-enums.md — funnel_opportunity_label
    label: funnelOpportunityLabelEnum('label').notNull().default('open'),
    // INV-FUNNEL-04: toda mudança de score registra em funnel_entry_score_history
    score: numeric('score', { precision: 10, scale: 2 }).notNull().default('0'),
    entryDate: timestamp('entry_date', { withTimezone: true }).notNull().defaultNow(),
    // Atribuição de entrada (FLOW-FUNNEL-ENTRY)
    entryOrigin: text('entry_origin'),
    entryCampaignId: uuid('entry_campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    entryCreativeId: uuid('entry_creative_id').references(() => creative.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // INV-FUNNEL-06: conversion_* só preenchido quando label transita para 'won'
    conversionOrigin: text('conversion_origin'),
    conversionCampaignId: uuid('conversion_campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    conversionCreativeId: uuid('conversion_creative_id').references(() => creative.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // INV-FUNNEL-05: label='won' exige transaction_id IS NOT NULL
    // FK omitida — tabela transaction ainda não existe (T-5-x); adicionada em migration futura
    transactionId: uuid('transaction_id'),
    // INV-FUNNEL-05: label='lost' exige lost_reason IS NOT NULL
    lostReason: text('lost_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-FUNNEL-01: no máximo 1 oportunidade ativa por (contact_id, funnel_id)
    // "ativa" = label NOT IN ('won','lost')
    // BR-FUNNEL-OPPORTUNITY enforcement: índice único parcial
    uqFunnelEntryActive: uniqueIndex('uq_funnel_entry_active')
      .on(t.contactId, t.funnelId)
      .where(sql`label NOT IN ('won','lost')`),
    idxFunnelEntryFunnel: index('idx_funnel_entry_funnel').on(t.funnelId),
    idxFunnelEntryContact: index('idx_funnel_entry_contact').on(t.contactId),
    idxFunnelEntryLabel: index('idx_funnel_entry_label').on(t.label),
    idxFunnelEntryOwner: index('idx_funnel_entry_owner').on(t.ownerUserId),
  }),
)

export type FunnelEntry = InferSelectModel<typeof funnelEntry>
export type NewFunnelEntry = InferInsertModel<typeof funnelEntry>

// ---------------------------------------------------------------------------
// T-5-09: funnel_entry_stage_history
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: funnel_entry_stage_history
// INV-FUNNEL-03: toda mudança de current_stage_id gera linha aqui.
// Append-only: trigger em supabase/migrations/20260425000009_funnel_triggers.sql bloqueia UPDATE/DELETE.
// docs/30-contracts/02-db-schema-conventions.md §6, §8
// ---------------------------------------------------------------------------

export const funnelEntryStageHistory = pgTable(
  'funnel_entry_stage_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // BR-FUNNEL-OPPORTUNITY §5: cada transição persiste em histórico append-only
    funnelEntryId: uuid('funnel_entry_id')
      .notNull()
      .references(() => funnelEntry.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // from_stage_id: NULL no primeiro registro (entrada direta sem estágio anterior)
    fromStageId: uuid('from_stage_id').references(() => funnelStage.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    toStageId: uuid('to_stage_id')
      .notNull()
      .references(() => funnelStage.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // changed_by: NULL = automação/sistema
    changedBy: uuid('changed_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    reason: text('reason'),
    // Append-only: sem updated_at, sem deleted_at
    // docs/30-contracts/02-db-schema-conventions.md §8
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxFunnelEntryStageHistoryEntry: index('idx_funnel_entry_stage_history_entry').on(
      t.funnelEntryId,
      t.createdAt,
    ),
  }),
)

export type FunnelEntryStageHistory = InferSelectModel<typeof funnelEntryStageHistory>
export type NewFunnelEntryStageHistory = InferInsertModel<typeof funnelEntryStageHistory>

// ---------------------------------------------------------------------------
// T-5-09: funnel_entry_score_history
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: funnel_entry_score_history
// INV-FUNNEL-04: toda mudança de score gera linha aqui.
// Append-only: trigger em supabase/migrations/20260425000009_funnel_triggers.sql bloqueia UPDATE/DELETE.
// docs/30-contracts/02-db-schema-conventions.md §6
// ---------------------------------------------------------------------------

export const funnelEntryScoreHistory = pgTable(
  'funnel_entry_score_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // BR-FUNNEL-OPPORTUNITY §4: toda mudança de score gera linha
    funnelEntryId: uuid('funnel_entry_id')
      .notNull()
      .references(() => funnelEntry.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // from_score: NULL na primeira entrada de score
    fromScore: numeric('from_score', { precision: 10, scale: 2 }),
    toScore: numeric('to_score', { precision: 10, scale: 2 }).notNull(),
    // reason: ex: 'message_inbound delta=+5', 'manual_adjustment'
    reason: text('reason'),
    // Append-only: sem updated_at, sem deleted_at
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxFunnelEntryScoreHistoryEntry: index('idx_funnel_entry_score_history_entry').on(
      t.funnelEntryId,
      t.createdAt,
    ),
  }),
)

export type FunnelEntryScoreHistory = InferSelectModel<typeof funnelEntryScoreHistory>
export type NewFunnelEntryScoreHistory = InferInsertModel<typeof funnelEntryScoreHistory>

// ---------------------------------------------------------------------------
// T-5-09: funnel_score_rule
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: funnel_score_rule
// BR-FUNNEL-OPPORTUNITY §4: regras configuráveis de score por funil.
// ---------------------------------------------------------------------------

export const funnelScoreRule = pgTable(
  'funnel_score_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    funnelId: uuid('funnel_id')
      .notNull()
      .references(() => funnel.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    name: text('name').notNull(),
    // event_kind: ex: 'message_inbound', 'click', 'stage_entered:<stage_id>'
    // OQ-FUNNEL-03: DSL interna; wildcards aceitos
    eventKind: text('event_kind').notNull(),
    // delta: +10, -5, etc. — docs/30-contracts/02-db-schema-conventions.md §12
    delta: numeric('delta', { precision: 10, scale: 2 }).notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxFunnelScoreRuleFunnel: index('idx_funnel_score_rule_funnel').on(t.funnelId),
    idxFunnelScoreRuleEventKind: index('idx_funnel_score_rule_event_kind').on(t.eventKind),
  }),
)

export type FunnelScoreRule = InferSelectModel<typeof funnelScoreRule>
export type NewFunnelScoreRule = InferInsertModel<typeof funnelScoreRule>

// ---------------------------------------------------------------------------
// T-5-09: sales_target
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: sales_target
// Meta comercial por funil e período (OQ-SPRINT5-02: % calculado em query, Sprint 10).
// ---------------------------------------------------------------------------

export const salesTarget = pgTable(
  'sales_target',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    funnelId: uuid('funnel_id')
      .notNull()
      .references(() => funnel.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // date (not timestamptz): period is a calendar date, not a point-in-time
    // docs/20-domain/08-funnel-opportunity.md §3 DDL: period_start date, period_end date
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    // target_count: meta em número de vendas (NULL = sem meta de volume)
    targetCount: integer('target_count'),
    // target_revenue: meta em receita — docs/30-contracts/02-db-schema-conventions.md §12
    targetRevenue: numeric('target_revenue', { precision: 12, scale: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxSalesTargetFunnel: index('idx_sales_target_funnel').on(t.funnelId),
    idxSalesTargetPeriod: index('idx_sales_target_period').on(t.periodStart, t.periodEnd),
  }),
)

export type SalesTarget = InferSelectModel<typeof salesTarget>
export type NewSalesTarget = InferInsertModel<typeof salesTarget>

// ---------------------------------------------------------------------------
// T-5-09: opportunity_tag
// docs/20-domain/08-funnel-opportunity.md §3 — DDL sketch: opportunity_tag
// Tag livre aplicada à oportunidade; unicidade por (funnel_entry_id, tag).
// ---------------------------------------------------------------------------

export const opportunityTag = pgTable(
  'opportunity_tag',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    funnelEntryId: uuid('funnel_entry_id')
      .notNull()
      .references(() => funnelEntry.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    tag: text('tag').notNull(),
    // applied_by: NULL = sistema/automação
    appliedBy: uuid('applied_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // docs/20-domain/08-funnel-opportunity.md DDL — uq_opportunity_tag
    uqOpportunityTag: uniqueIndex('uq_opportunity_tag').on(t.funnelEntryId, t.tag),
    idxOpportunityTagEntry: index('idx_opportunity_tag_entry').on(t.funnelEntryId),
  }),
)

export type OpportunityTag = InferSelectModel<typeof opportunityTag>
export type NewOpportunityTag = InferInsertModel<typeof opportunityTag>
