/**
 * MOD-AUTOMATION — Automation Flow aggregate schema (T-11-01 → T-11-03)
 *
 * Tables in this file (added progressively across T-11-01 → T-11-03):
 *   T-11-01: automation_flow, automation_node
 *   T-11-02: automation_trigger, automation_condition, automation_action
 *   T-11-03: automation_execution, automation_execution_log
 *
 * Specs:
 *   docs/20-domain/15-automation.md §3
 *   docs/30-contracts/01-enums.md (automation_trigger_kind, automation_action_kind, automation_execution_status)
 *   docs/30-contracts/02-db-schema-conventions.md
 *
 * NOTE on circular FK (INV-AUTOMATION-01):
 *   automation_flow.start_node_id → automation_node.id
 *   automation_node.flow_id       → automation_flow.id
 *   Drizzle cannot express DEFERRABLE INITIALLY DEFERRED. start_node_id is declared
 *   as a plain uuid column here; the deferrable FK constraint is added manually in the
 *   migration SQL after drizzle-kit generate:
 *     ALTER TABLE automation_flow
 *       ADD CONSTRAINT automation_flow_start_node_id_automation_node_id_fk
 *       FOREIGN KEY (start_node_id) REFERENCES automation_node(id)
 *       ON DELETE SET NULL ON UPDATE CASCADE
 *       DEFERRABLE INITIALLY DEFERRED;
 */
import {
  boolean,
  check,
  index,
  integer,
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

import { brand, userAccount } from './organization'

// ---------------------------------------------------------------------------
// Enums
// docs/30-contracts/01-enums.md — Automação
// ---------------------------------------------------------------------------

export const automationTriggerKindEnum = pgEnum('automation_trigger_kind', [
  'funnel_enter',
  'funnel_stage_change',
  'new_message',
  'checkout_abandoned',
  'sale_approved',
  'ticket_opened',
  'brevo_event',
  'integration_event',
])

export const automationActionKindEnum = pgEnum('automation_action_kind', [
  'apply_tag',
  'move_stage',
  'open_ticket',
  'notify_user',
  'emit_timeline_event',
  'send_external',
])

export const automationExecutionStatusEnum = pgEnum('automation_execution_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
])

// ---------------------------------------------------------------------------
// T-11-01: automation_flow
// docs/20-domain/15-automation.md §3 — DDL sketch: automation_flow
// INV-AUTOMATION-01: flow sem nó inicial deve ter is_active=false.
// ---------------------------------------------------------------------------

export const automationFlow = pgTable(
  'automation_flow',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Multi-brand — docs/30-contracts/02-db-schema-conventions.md §5
    // NULL permitido: fluxo pode ser global (sem brand específica)
    brandId: uuid('brand_id').references(() => brand.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
    name: text('name').notNull(),
    description: text('description'),
    // INV-AUTOMATION-01: is_active=false quando start_node_id IS NULL
    isActive: boolean('is_active').notNull().default(false),
    // start_node_id: circular FK para automation_node — sem referência Drizzle aqui.
    // FK DEFERRABLE INITIALLY DEFERRED adicionada manualmente na migration SQL.
    // docs/20-domain/15-automation.md §3 DDL comment: "FK definida após criação dos nós"
    startNodeId: uuid('start_node_id'),
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    idxAutomationFlowBrand: index('idx_automation_flow_brand').on(t.brandId),
    idxAutomationFlowActive: index('idx_automation_flow_active').on(t.isActive),
    idxAutomationFlowStartNode: index('idx_automation_flow_start_node').on(t.startNodeId),
  }),
)

export type AutomationFlow = InferSelectModel<typeof automationFlow>
export type NewAutomationFlow = InferInsertModel<typeof automationFlow>

// ---------------------------------------------------------------------------
// T-11-01: automation_node
// docs/20-domain/15-automation.md §3 — DDL sketch: automation_node
// INV-AUTOMATION-02: kind='trigger' usa next_node_id; kind='condition' usa
//   next_on_true_id/next_on_false_id; kind='action' usa next_node_id.
// ---------------------------------------------------------------------------

export const automationNode = pgTable(
  'automation_node',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // ON DELETE CASCADE: nó é filho subordinado do fluxo
    // docs/30-contracts/02-db-schema-conventions.md §14
    flowId: uuid('flow_id')
      .notNull()
      .references(() => automationFlow.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // kind: 'trigger' | 'condition' | 'action'
    // Nenhum enum Postgres declarado para node kind — usar CHECK constraint.
    // docs/20-domain/15-automation.md §3 DDL: kind text NOT NULL CHECK (kind IN (...))
    kind: text('kind').notNull(),
    label: text('label'),
    // next_node_id: próximo nó linear (trigger → próximo; action → próximo)
    // Self-referencing FKs declaradas na migration SQL (não suportadas por Drizzle inline).
    nextNodeId: uuid('next_node_id'),
    // next_on_true_id / next_on_false_id: ramos do nó condition
    nextOnTrueId: uuid('next_on_true_id'),
    nextOnFalseId: uuid('next_on_false_id'),
    // config: configuração específica (shape varia por kind de trigger/action)
    config: jsonb('config').notNull().default({}),
    // position_x / position_y: coordenadas para editor visual react-flow
    // docs/80-roadmap/08-sprint-11-automations.md T-11-11
    positionX: numeric('position_x', { precision: 10, scale: 2 }).notNull().default('0'),
    positionY: numeric('position_y', { precision: 10, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // CHECK: kind deve ser um dos valores válidos do grafo
    // docs/20-domain/15-automation.md §3 DDL: kind text NOT NULL CHECK (...)
    ckAutomationNodeKind: check(
      'ck_automation_node_kind',
      sql`${t.kind} IN ('trigger', 'condition', 'action')`,
    ),
    idxAutomationNodeFlow: index('idx_automation_node_flow').on(t.flowId),
    idxAutomationNodeKind: index('idx_automation_node_kind').on(t.kind),
    idxAutomationNodeNext: index('idx_automation_node_next').on(t.nextNodeId),
  }),
)

export type AutomationNode = InferSelectModel<typeof automationNode>
export type NewAutomationNode = InferInsertModel<typeof automationNode>

// ---------------------------------------------------------------------------
// T-11-02: automation_trigger
// docs/20-domain/15-automation.md §3 — DDL sketch: automation_trigger
// 1-1 with automation_node via UNIQUE(node_id) — T-11-02 acceptance criterion.
// ON DELETE CASCADE: trigger config is subordinate to the node.
// ---------------------------------------------------------------------------

export const automationTrigger = pgTable(
  'automation_trigger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 1-1 relation enforced by unique constraint below
    // docs/30-contracts/02-db-schema-conventions.md §14: CASCADE for subordinate child
    nodeId: uuid('node_id')
      .notNull()
      .unique()
      .references(() => automationNode.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // kind: automation_trigger_kind enum — docs/30-contracts/01-enums.md §Automação
    kind: automationTriggerKindEnum('kind').notNull(),
    // filter: optional JSON criteria (ex: { funnel_id, brand_id, stage_id })
    // docs/20-domain/15-automation.md §3 DDL: filter jsonb NOT NULL DEFAULT '{}'
    filter: jsonb('filter').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxAutomationTriggerKind: index('idx_automation_trigger_kind').on(t.kind),
  }),
)

export type AutomationTrigger = InferSelectModel<typeof automationTrigger>
export type NewAutomationTrigger = InferInsertModel<typeof automationTrigger>

// ---------------------------------------------------------------------------
// T-11-02: automation_condition
// docs/20-domain/15-automation.md §3 — DDL sketch: automation_condition
// 1-1 with automation_node via UNIQUE(node_id) — T-11-02 acceptance criterion.
// ON DELETE CASCADE: condition config is subordinate to the node.
// ---------------------------------------------------------------------------

export const automationCondition = pgTable(
  'automation_condition',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 1-1 relation enforced by unique constraint below
    // docs/30-contracts/02-db-schema-conventions.md §14: CASCADE for subordinate child
    nodeId: uuid('node_id')
      .notNull()
      .unique()
      .references(() => automationNode.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // expr: DSL JSON (AND/OR/NOT/eq/neq/gte/lte/gt/lt/in/contains/has_tag)
    // docs/20-domain/15-automation.md §8: condition DSL
    expr: jsonb('expr').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  () => ({}),
)

export type AutomationCondition = InferSelectModel<typeof automationCondition>
export type NewAutomationCondition = InferInsertModel<typeof automationCondition>

// ---------------------------------------------------------------------------
// T-11-02: automation_action
// docs/20-domain/15-automation.md §3 — DDL sketch: automation_action
// 1-1 with automation_node via UNIQUE(node_id) — T-11-02 acceptance criterion.
// ON DELETE CASCADE: action config is subordinate to the node.
// ---------------------------------------------------------------------------

export const automationAction = pgTable(
  'automation_action',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // 1-1 relation enforced by unique constraint below
    // docs/30-contracts/02-db-schema-conventions.md §14: CASCADE for subordinate child
    nodeId: uuid('node_id')
      .notNull()
      .unique()
      .references(() => automationNode.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // kind: automation_action_kind enum — docs/30-contracts/01-enums.md §Automação
    kind: automationActionKindEnum('kind').notNull(),
    // params: action-specific parameters (shape varies per kind)
    // docs/20-domain/15-automation.md §3 DDL: params jsonb NOT NULL DEFAULT '{}'
    params: jsonb('params').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxAutomationActionKind: index('idx_automation_action_kind').on(t.kind),
  }),
)

export type AutomationAction = InferSelectModel<typeof automationAction>
export type NewAutomationAction = InferInsertModel<typeof automationAction>

// ---------------------------------------------------------------------------
// T-11-03: automation_execution
// docs/20-domain/15-automation.md §3 — DDL sketch: automation_execution
// INV-AUTOMATION-03: (flow_id, idempotency_key) UNIQUE — barra duplicação do
//   mesmo evento disparar 2 execuções do mesmo fluxo.
// ON DELETE RESTRICT: não apagar fluxo enquanto houver execuções (use soft-delete).
// docs/30-contracts/02-db-schema-conventions.md §14
// ---------------------------------------------------------------------------

export const automationExecution = pgTable(
  'automation_execution',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // INV-AUTOMATION-03: FK RESTRICT — executar soft-delete em automation_flow
    // docs/30-contracts/02-db-schema-conventions.md §14: RESTRICT para histórico
    flowId: uuid('flow_id')
      .notNull()
      .references(() => automationFlow.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // subject_kind: identifica o tipo do subject do disparo (ex: 'contact', 'transaction')
    subjectKind: text('subject_kind'),
    // subject_id: ID do subject que originou o disparo
    subjectId: uuid('subject_id'),
    // idempotency_key: chave calculada pelo dispatcher para evitar duplicatas
    // INV-AUTOMATION-03: UNIQUE (flow_id, idempotency_key) — ver uq_automation_execution_idem abaixo
    idempotencyKey: text('idempotency_key').notNull(),
    // status: ciclo de vida da execução — docs/30-contracts/01-enums.md §Automação
    // docs/20-domain/15-automation.md §6: pending → running → succeeded | failed | cancelled
    status: automationExecutionStatusEnum('status').notNull().default('pending'),
    // triggered_at: momento em que o evento de disparo chegou
    triggeredAt: timestamp('triggered_at', { withTimezone: true }).notNull().defaultNow(),
    // started_at: momento em que o runner iniciou a execução (Inngest job picked up)
    startedAt: timestamp('started_at', { withTimezone: true }),
    // finished_at: momento de conclusão (succeeded, failed ou cancelled)
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    // error: mensagem de erro em caso de falha (last error after retries exhausted)
    error: text('error'),
    // retry_count: número de tentativas realizadas pelo Inngest
    // docs/20-domain/15-automation.md §9: até 5 retries com backoff exponencial
    retryCount: integer('retry_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-AUTOMATION-03: mesma combinação (flow_id + idempotency_key) não pode gerar 2 execuções
    // docs/20-domain/15-automation.md §5: "mesmo evento não dispara 2 execuções do mesmo fluxo"
    uqAutomationExecutionIdem: uniqueIndex('uq_automation_execution_idem').on(
      t.flowId,
      t.idempotencyKey,
    ),
    idxAutomationExecutionFlow: index('idx_automation_execution_flow').on(t.flowId),
    idxAutomationExecutionStatus: index('idx_automation_execution_status').on(t.status),
    idxAutomationExecutionSubject: index('idx_automation_execution_subject').on(
      t.subjectKind,
      t.subjectId,
    ),
  }),
)

export type AutomationExecution = InferSelectModel<typeof automationExecution>
export type NewAutomationExecution = InferInsertModel<typeof automationExecution>

// ---------------------------------------------------------------------------
// T-11-03: automation_execution_log
// docs/20-domain/15-automation.md §3 — DDL sketch: automation_execution_log
// INV-AUTOMATION-05: cada nó executado produz 1 linha nesta tabela.
// Append-only: trigger bloqueia UPDATE (gerado na migration SQL).
// ON DELETE CASCADE: log é filho subordinado da execução.
// ---------------------------------------------------------------------------

export const automationExecutionLog = pgTable(
  'automation_execution_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // ON DELETE CASCADE: log é dado subordinado da execução
    // docs/30-contracts/02-db-schema-conventions.md §14: CASCADE para filhos subordinados
    executionId: uuid('execution_id')
      .notNull()
      .references(() => automationExecution.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // node_id: referência informativa — sem FK obrigatória pois nó pode ser editado
    // docs/20-domain/15-automation.md §3 DDL: "referência informativa ao nó"
    nodeId: uuid('node_id').notNull(),
    // node_kind: tipo do nó executado ('trigger' | 'condition' | 'action')
    nodeKind: text('node_kind').notNull(),
    // status do nó: 'ok' | 'skipped' | 'error'
    status: text('status').notNull(),
    // input: contexto de entrada do nó (snapshot do contexto de execução)
    input: jsonb('input'),
    // output: resultado produzido pelo nó
    output: jsonb('output'),
    // error: mensagem de erro se o nó falhou
    error: text('error'),
    // executed_at: momento em que o nó foi executado
    // Append-only: sem updated_at, sem deleted_at
    // docs/30-contracts/02-db-schema-conventions.md §4: "Não aplicar a tabelas append-only"
    executedAt: timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // CHECK: node_kind deve ser um dos valores válidos do grafo
    ckAutomationExecLogNodeKind: check(
      'ck_automation_exec_log_node_kind',
      sql`${t.nodeKind} IN ('trigger', 'condition', 'action')`,
    ),
    // CHECK: status deve ser um dos valores válidos do log
    ckAutomationExecLogStatus: check(
      'ck_automation_exec_log_status',
      sql`${t.status} IN ('ok', 'skipped', 'error')`,
    ),
    idxAutomationExecLogExecution: index('idx_automation_exec_log_execution').on(t.executionId),
    idxAutomationExecLogNode: index('idx_automation_exec_log_node').on(t.nodeId),
  }),
)

export type AutomationExecutionLog = InferSelectModel<typeof automationExecutionLog>
export type NewAutomationExecutionLog = InferInsertModel<typeof automationExecutionLog>
