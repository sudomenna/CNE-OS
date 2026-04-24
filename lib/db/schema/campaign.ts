/**
 * MOD-CAMPAIGN — Campaign / Creative aggregate schema (T-5-01, T-5-02)
 *
 * Tables in this file:
 *   campaign, creative, creative_asset, trackable_link, content_library_item
 *
 * Specs:
 *   docs/20-domain/07-campaign-creative.md §3
 *   docs/30-contracts/01-enums.md
 *   docs/30-contracts/02-db-schema-conventions.md
 */
import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { brand } from './organization'
import { funnel } from './funnel'

// ---------------------------------------------------------------------------
// campaign
// INV-CAMPAIGN-01: toda campaign pertence a exatamente 1 brand e aponta para
//                  exatamente 1 funnel.
// docs/20-domain/07-campaign-creative.md §5
// ---------------------------------------------------------------------------

export const campaign = pgTable(
  'campaign',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // INV-CAMPAIGN-01: brand owner — ON DELETE RESTRICT (histórico de campanhas preservado)
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // INV-CAMPAIGN-01: funnel apontado pela campanha — ON DELETE RESTRICT
    funnelId: uuid('funnel_id')
      .notNull()
      .references(() => funnel.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    name: text('name').notNull(),

    // uq_campaign_slug_brand — slug único por marca
    slug: text('slug').notNull(),

    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),

    // INV-CAMPAIGN-05: campanha desativada permanece no histórico
    isActive: boolean('is_active').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // INV-CAMPAIGN-01 / critério de aceite T-5-01: slug único por marca
    uqCampaignSlugBrand: uniqueIndex('uq_campaign_slug_brand').on(t.brandId, t.slug),
    idxCampaignBrand: index('idx_campaign_brand').on(t.brandId),
    idxCampaignFunnel: index('idx_campaign_funnel').on(t.funnelId),
    idxCampaignIsActive: index('idx_campaign_is_active').on(t.isActive),
  }),
)

export type Campaign = InferSelectModel<typeof campaign>
export type NewCampaign = InferInsertModel<typeof campaign>

// ---------------------------------------------------------------------------
// creative
// INV-CAMPAIGN-02: creative pertence a exatamente 1 campaign.
// docs/20-domain/07-campaign-creative.md §3
// ---------------------------------------------------------------------------

export const creative = pgTable(
  'creative',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // ON DELETE RESTRICT: spec §3 — REFERENCES campaign(id) ON DELETE RESTRICT
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaign.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    name: text('name').notNull(),

    // uq_creative_slug_campaign — slug único por campanha
    slug: text('slug').notNull(),

    // Canal do criativo: meta_ads, google_ads, organic_ig, email, etc.
    // Livre (text) — sem enum: valores variam por estratégia e canal não tem enum canônico
    // docs/30-contracts/01-enums.md não define canal de criativo como enum
    channel: text('channel'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft-delete — docs/30-contracts/02-db-schema-conventions.md §4
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    // Slug único por campanha
    uqCreativeSlugCampaign: uniqueIndex('uq_creative_slug_campaign').on(t.campaignId, t.slug),
    idxCreativeCampaign: index('idx_creative_campaign').on(t.campaignId),
  }),
)

export type Creative = InferSelectModel<typeof creative>
export type NewCreative = InferInsertModel<typeof creative>

// ---------------------------------------------------------------------------
// creative_asset
// Arquivo/metadado anexo ao criativo.
// docs/20-domain/07-campaign-creative.md §3
// No soft-delete (append-only semântica: ativos são imutáveis por design Fase 1).
// No updated_at (append-only).
// ---------------------------------------------------------------------------

export const creativeAsset = pgTable(
  'creative_asset',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // ON DELETE CASCADE: ativo some junto com o criativo
    creativeId: uuid('creative_id')
      .notNull()
      .references(() => creative.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    // kind: image, video, copy, landing — text livre (sem enum canônico definido)
    kind: text('kind').notNull(),

    url: text('url').notNull(),

    // metadata: dimensões, duração, copy text, etc.
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxCreativeAssetCreative: index('idx_creative_asset_creative').on(t.creativeId),
    idxCreativeAssetKind: index('idx_creative_asset_kind').on(t.kind),
  }),
)

export type CreativeAsset = InferSelectModel<typeof creativeAsset>
export type NewCreativeAsset = InferInsertModel<typeof creativeAsset>

// ---------------------------------------------------------------------------
// trackable_link
// INV-CAMPAIGN-03: trackable_link.slug é globalmente único (URL curta).
// Critério de aceite T-5-02: uq_trackable_link_slug globalmente único (sem partição).
// docs/20-domain/07-campaign-creative.md §3
// ---------------------------------------------------------------------------

export const trackableLink = pgTable(
  'trackable_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // brand owner — ON DELETE RESTRICT
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    // acessórios — SET NULL quando referência é removida (links permanecem histórico)
    funnelId: uuid('funnel_id').references(() => funnel.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    campaignId: uuid('campaign_id').references(() => campaign.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
    creativeId: uuid('creative_id').references(() => creative.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    destinationUrl: text('destination_url').notNull(),

    // INV-CAMPAIGN-03: slug globalmente único — usado no short URL (/go/[slug])
    slug: text('slug').notNull(),

    // Snapshot imutável das UTMs geradas pelo sistema (generateUtm)
    // docs/30-contracts/02-db-schema-conventions.md §7
    utm: jsonb('utm').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // INV-CAMPAIGN-03 / critério de aceite T-5-02: slug globalmente único (sem partição)
    uqTrackableLinkSlug: uniqueIndex('uq_trackable_link_slug').on(t.slug),
    idxTrackableLinkBrand: index('idx_trackable_link_brand').on(t.brandId),
    idxTrackableLinkCampaign: index('idx_trackable_link_campaign').on(t.campaignId),
    idxTrackableLinkCreative: index('idx_trackable_link_creative').on(t.creativeId),
    idxTrackableLinkFunnel: index('idx_trackable_link_funnel').on(t.funnelId),
  }),
)

export type TrackableLink = InferSelectModel<typeof trackableLink>
export type NewTrackableLink = InferInsertModel<typeof trackableLink>

// ---------------------------------------------------------------------------
// content_library_item  (stub — Fase 2)
// Biblioteca de conteúdo por marca. Apenas colunas básicas; relacionamentos
// complexos serão adicionados quando o módulo for desenvolvido na Fase 2.
// docs/20-domain/07-campaign-creative.md §3 ("Fase 2 — stub")
// No updated_at / soft-delete: stub sem operações de mutação definidas ainda.
// ---------------------------------------------------------------------------

export const contentLibraryItem = pgTable(
  'content_library_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    brandId: uuid('brand_id')
      .notNull()
      .references(() => brand.id, { onDelete: 'restrict', onUpdate: 'cascade' }),

    name: text('name').notNull(),

    // type/kind: text livre — sem enum canônico definido na Fase 1
    type: text('type').notNull(),

    url: text('url').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idxContentLibraryItemBrand: index('idx_content_library_item_brand').on(t.brandId),
    idxContentLibraryItemType: index('idx_content_library_item_type').on(t.type),
  }),
)

export type ContentLibraryItem = InferSelectModel<typeof contentLibraryItem>
export type NewContentLibraryItem = InferInsertModel<typeof contentLibraryItem>
