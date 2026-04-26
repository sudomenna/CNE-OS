/**
 * MOD-INBOX — Conversation / Inbox aggregate schema (T-3-01 → T-3-04)
 *
 * Tables in this file:
 *   T-3-01: channel, channel_account
 *   T-3-02: conversation
 *   T-3-03: message, message_attachment
 *   T-3-04: conversation_internal_note, conversation_assignment_history,
 *            conversation_status_history
 *
 * Specs:
 *   docs/20-domain/05-conversation-inbox.md §3
 *   docs/30-contracts/01-enums.md  (channel_kind, conversation_status)
 *   docs/30-contracts/02-db-schema-conventions.md
 */
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { brand, userAccount } from './organization'
import { contact } from './contact'

// ---------------------------------------------------------------------------
// Enums
// docs/30-contracts/01-enums.md — Inbox / Ticket
// ---------------------------------------------------------------------------

export const channelKindEnum = pgEnum('channel_kind', [
  'whatsapp',
  'instagram',
  'email',
])

// conversation_status will be used in T-3-02
export const conversationStatusEnum = pgEnum('conversation_status', [
  'open',
  'waiting_customer',
  'waiting_team',
  'closed',
])

// ---------------------------------------------------------------------------
// T-3-01: channel — tipos de canal de comunicação disponíveis
// docs/20-domain/05-conversation-inbox.md §3
// ---------------------------------------------------------------------------

export const channel = pgTable(
  'channel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: channelKindEnum('kind').notNull(),
    // nome legível: 'WhatsApp Business', 'Instagram Direct', 'E-mail'
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // cada kind é único — apenas um registro por tipo canônico
    uqChannelKind: uniqueIndex('uq_channel_kind').on(t.kind),
  }),
)

export type Channel = InferSelectModel<typeof channel>
export type NewChannel = InferInsertModel<typeof channel>

// ---------------------------------------------------------------------------
// T-3-01: channel_account — instância configurada de canal vinculada a uma marca
// docs/20-domain/05-conversation-inbox.md §3
// ---------------------------------------------------------------------------

export const channelAccount = pgTable(
  'channel_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channel.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // brand_id NOT NULL: cada channel_account pertence a exatamente uma marca
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // identificador no provedor: phone number id, instagram account id, endereço de e-mail
    externalId: text('external_id').notNull(),
    displayName: text('display_name'),
    isActive: boolean('is_active').notNull().default(true),
    /**
     * ADR-18: envelope encriptado via pgcrypto (pgp_sym_encrypt).
     * Formato: { v: 1, encryptedAt: ISO string, ciphertext: base64 string }
     * NULL = não configurado. Plaintext NUNCA persistido.
     * Queries de listagem retornam apenas `encryptedAt` extraído do envelope.
     */
    credentials: jsonb('credentials'),
    /**
     * ADR-18: timestamp da última atividade registrada pelo adapter do provedor.
     * NULL quando ainda não houve atividade após configuração.
     * Usado por listChannelsByBrand para exibir "último contato".
     */
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-INBOX: par (canal, marca, external_id) deve ser único
    uqChannelAccount: uniqueIndex('uq_channel_account').on(
      t.channelId,
      t.brandId,
      t.externalId,
    ),
    idxChannelAccountBrand: index('idx_channel_account_brand').on(t.brandId),
    idxChannelAccountChannel: index('idx_channel_account_channel').on(t.channelId),
  }),
)

export type ChannelAccount = InferSelectModel<typeof channelAccount>
export type NewChannelAccount = InferInsertModel<typeof channelAccount>

// ---------------------------------------------------------------------------
// T-3-02: conversation — fluxo de mensagens entre um contato e uma channel_account
// docs/20-domain/05-conversation-inbox.md §3
// INV-INBOX-01: no máximo 1 conversa ativa por (contact_id, channel_account_id)
// ---------------------------------------------------------------------------

export const conversation = pgTable(
  'conversation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    channelAccountId: uuid('channel_account_id')
      .notNull()
      .references(() => channelAccount.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    status: conversationStatusEnum('status').notNull().default('open'),
    // assigned_user_id é da conversa, não do contato (INV-INBOX-04)
    assignedUserId: uuid('assigned_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // external_thread_id: ID do thread no provedor (ex: WhatsApp conversation id)
    externalThreadId: text('external_thread_id'),
    // last_message_at: atualizado pelo app ao receber/enviar mensagem
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    // brand_id pode ser NULL até classificação manual (INV-INBOX-05)
    brandId: uuid('brand_id').references(() => brand.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // INV-INBOX-01: índice único parcial — no máximo 1 conversa ativa por par
    // (contact_id, channel_account_id). O índice é parcial (WHERE status != 'closed'
    // AND deleted_at IS NULL) e só pode ser expresso como SQL puro; declarado aqui
    // apenas como índice normal para o Drizzle rastrear a coluna — o WHERE clause
    // é criado exclusivamente via migration SQL.
    idxConversationContactChannel: index('idx_conversation_contact_channel').on(
      t.contactId,
      t.channelAccountId,
    ),
    idxConversationStatus: index('idx_conversation_status').on(t.status),
    idxConversationAssigned: index('idx_conversation_assigned').on(t.assignedUserId),
    idxConversationBrand: index('idx_conversation_brand').on(t.brandId),
    idxConversationLastMessage: index('idx_conversation_last_message').on(t.lastMessageAt),
  }),
)

export type Conversation = InferSelectModel<typeof conversation>
export type NewConversation = InferInsertModel<typeof conversation>

// ---------------------------------------------------------------------------
// T-3-03: message — mensagem inbound/outbound dentro de uma conversa
// docs/20-domain/05-conversation-inbox.md §3
// INV-INBOX-02: external_message_id único por conversa quando informado
// ---------------------------------------------------------------------------

export const message = pgTable(
  'message',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // direction: 'inbound' | 'outbound'
    // Não é pgEnum porque o enum message_direction não está em 01-enums.md;
    // check constraint garante valores válidos no DB.
    direction: text('direction').notNull(),
    body: text('body').notNull(),
    // external_message_id: ID único no provedor (WhatsApp message id, Instagram message id, e-mail Message-Id)
    // INV-INBOX-02: UNIQUE parcial por (conversation_id, external_message_id) — ver migration SQL
    externalMessageId: text('external_message_id'),
    // actor_user_id: preenchido em outbound por humano
    actorUserId: uuid('actor_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // actor_system: preenchido em outbound/inbound por sistema ('whatsapp-webhook', etc.)
    actorSystem: text('actor_system'),
    // sent_at: quando o provedor confirmou entrega (nullable — pode não ter confirmação ainda)
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxMessageConversation: index('idx_message_conversation').on(t.conversationId),
    idxMessageCreatedAt: index('idx_message_created_at').on(t.createdAt),
    // INV-INBOX-02: o índice único PARCIAL (WHERE external_message_id IS NOT NULL)
    // é declarado exclusivamente na migration SQL (uq_message_external).
    // Registrado aqui como índice simples para o Drizzle rastrear a coluna.
    idxMessageExternalId: index('idx_message_external_id').on(
      t.conversationId,
      t.externalMessageId,
    ),
  }),
)

export type Message = InferSelectModel<typeof message>
export type NewMessage = InferInsertModel<typeof message>

// ---------------------------------------------------------------------------
// T-3-03: message_attachment — anexo (arquivo) vinculado a mensagem
// docs/20-domain/05-conversation-inbox.md §3
// ---------------------------------------------------------------------------

export const messageAttachment = pgTable(
  'message_attachment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => message.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    // kind: 'image' | 'video' | 'audio' | 'document' | 'sticker'
    // Não é pgEnum porque attachment_kind não está em 01-enums.md;
    // check constraint garante valores válidos no DB.
    kind: text('kind').notNull(),
    url: text('url').notNull(),
    mimeType: text('mime_type'),
    // size_bytes: bigint — tamanho do arquivo em bytes
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxMessageAttachmentMessage: index('idx_message_attachment_message').on(t.messageId),
  }),
)

export type MessageAttachment = InferSelectModel<typeof messageAttachment>
export type NewMessageAttachment = InferInsertModel<typeof messageAttachment>

// ---------------------------------------------------------------------------
// T-3-04: conversation_internal_note — nota interna (não visível ao contato)
// docs/20-domain/05-conversation-inbox.md §3
// Append-only: trigger bloqueia UPDATE e DELETE — ver migration SQL.
// docs/30-contracts/02-db-schema-conventions.md §6
// ---------------------------------------------------------------------------

export const conversationInternalNote = pgTable(
  'conversation_internal_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      // ON DELETE RESTRICT: preservar notas mesmo se conversa for soft-deletada
      .references(() => conversation.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // author_user_id: quem criou a nota — RESTRICT: auditoria preservada
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxNoteConversation: index('idx_conversation_internal_note_conversation').on(
      t.conversationId,
      t.createdAt,
    ),
  }),
)

export type ConversationInternalNote = InferSelectModel<typeof conversationInternalNote>
export type NewConversationInternalNote = InferInsertModel<typeof conversationInternalNote>

// ---------------------------------------------------------------------------
// T-3-04: conversation_assignment_history — histórico append-only de atribuições
// docs/20-domain/05-conversation-inbox.md §3
// INV-INBOX-06: cada mudança de assigned_user_id gera linha aqui.
// Append-only: trigger bloqueia UPDATE e DELETE — ver migration SQL.
// docs/30-contracts/02-db-schema-conventions.md §6
// ---------------------------------------------------------------------------

export const conversationAssignmentHistory = pgTable(
  'conversation_assignment_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      // ON DELETE RESTRICT: preservar histórico mesmo após soft-delete da conversa
      .references(() => conversation.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // from_user_id: responsável anterior (NULL = primeira atribuição)
    fromUserId: uuid('from_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // to_user_id: novo responsável (NULL = conversa foi desatribuída)
    toUserId: uuid('to_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // assigned_by_user_id: quem efetuou a atribuição — RESTRICT: auditoria preservada
    assignedByUserId: uuid('assigned_by_user_id')
      .notNull()
      .references(() => userAccount.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxAssignmentConversation: index('idx_conversation_assignment_history_conversation').on(
      t.conversationId,
      t.createdAt,
    ),
  }),
)

export type ConversationAssignmentHistory = InferSelectModel<typeof conversationAssignmentHistory>
export type NewConversationAssignmentHistory = InferInsertModel<typeof conversationAssignmentHistory>

// ---------------------------------------------------------------------------
// T-3-04: conversation_status_history — histórico append-only de transições de status
// docs/20-domain/05-conversation-inbox.md §3
// INV-INBOX-06: cada transição de status gera linha aqui.
// Append-only: trigger bloqueia UPDATE e DELETE — ver migration SQL.
// docs/30-contracts/02-db-schema-conventions.md §8
// ---------------------------------------------------------------------------

export const conversationStatusHistory = pgTable(
  'conversation_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      // ON DELETE RESTRICT: preservar histórico mesmo após soft-delete da conversa
      .references(() => conversation.id, { onDelete: 'restrict', onUpdate: 'cascade' }),
    // from_status: status anterior (NULL = criação com status inicial)
    fromStatus: conversationStatusEnum('from_status'),
    // to_status: novo status da conversa
    toStatus: conversationStatusEnum('to_status').notNull(),
    // changed_by_user_id: quem efetuou a mudança (NULL quando iniciado por sistema, e.g. webhook)
    changedByUserId: uuid('changed_by_user_id').references(() => userAccount.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    // reason: motivo opcional da mudança (ex: 'Resolvido pelo atendente')
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxStatusHistoryConversation: index('idx_conversation_status_history_conversation').on(
      t.conversationId,
      t.createdAt,
    ),
  }),
)

export type ConversationStatusHistory = InferSelectModel<typeof conversationStatusHistory>
export type NewConversationStatusHistory = InferInsertModel<typeof conversationStatusHistory>
