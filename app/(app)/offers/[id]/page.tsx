/**
 * /offers/[id] — detalhe de uma oferta com tabs de edição.
 *
 * Server Component: carrega oferta + condições + itens + payment options + rule groups via Drizzle.
 * Header: nome, status badge, botões "Publicar" e "Arquivar".
 * Tabs (via ConditionTabs): Condições | Regras | Itens | Opções de Pagamento.
 *
 * T-6-18 — spec: docs/20-domain/10-offer-engine.md
 */

import { notFound } from 'next/navigation'
import { eq, asc, inArray, isNull } from 'drizzle-orm'
import Link from 'next/link'
import type { Route } from 'next'

import { db } from '@/lib/db/client'
import {
  offer,
  offerCondition,
  offerConditionItem,
  offerConditionRule,
  offerConditionRuleGroup,
  offerPaymentOption,
} from '@/lib/db/schema/offer'
import { brand } from '@/lib/db/schema/organization'
import { product, commercialBenefit } from '@/lib/db/schema/catalog'
import { Badge } from '@/components/ui/badge'
import { ConditionTabs } from '@/components/offer/condition-tabs'
import type { ConditionData } from '@/components/offer/condition-tabs'
import type { RuleGroupData } from '@/components/offer/rule-group-editor'
import { PublishOfferButton } from '@/app/(app)/offers/[id]/publish-button'
import { ArchiveOfferButton } from '@/app/(app)/offers/[id]/archive-button'

// ---------------------------------------------------------------------------
// Status badge helpers
// ---------------------------------------------------------------------------

type OfferStatus = 'draft' | 'active' | 'paused' | 'archived'

const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  draft: 'Rascunho',
  active: 'Ativa',
  paused: 'Pausada',
  archived: 'Arquivada',
}

const OFFER_STATUS_VARIANT: Record<
  OfferStatus,
  'default' | 'secondary' | 'outline' | 'destructive'
> = {
  draft: 'secondary',
  active: 'default',
  paused: 'outline',
  archived: 'destructive',
}

// ---------------------------------------------------------------------------
// Rule group tree builder
// ---------------------------------------------------------------------------

type FlatGroup = {
  id: string
  offerConditionId: string
  parentGroupId: string | null
  operator: 'and' | 'or'
}

type FlatRule = {
  id: string
  ruleGroupId: string
  kind: string
  params: Record<string, unknown>
  createdAt: Date
}

function buildGroupTree(
  groups: FlatGroup[],
  rules: FlatRule[],
  parentId: string | null,
): RuleGroupData[] {
  return groups
    .filter((g) => g.parentGroupId === parentId)
    .map((g) => ({
      id: g.id,
      offerConditionId: g.offerConditionId,
      parentGroupId: g.parentGroupId,
      operator: g.operator,
      rules: rules
        .filter((r) => r.ruleGroupId === g.id)
        .map((r) => ({
          id: r.id,
          kind: r.kind as RuleGroupData['rules'][number]['kind'],
          params: r.params as Record<string, unknown>,
          createdAt: r.createdAt.toISOString(),
        })),
      children: buildGroupTree(groups, rules, g.id),
    }))
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const row = await db
    .select({ name: offer.name })
    .from(offer)
    .where(eq(offer.id, id))
    .limit(1)

  if (!row[0]) return { title: 'Oferta não encontrada — CNE-OS' }
  return { title: `${row[0].name} — CNE-OS` }
}

export default async function OfferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Load offer + brand
  const [offerRow] = await db
    .select({
      id: offer.id,
      name: offer.name,
      slug: offer.slug,
      status: offer.status,
      type: offer.type,
      description: offer.description,
      brandId: offer.brandId,
      brandName: brand.name,
    })
    .from(offer)
    .innerJoin(brand, eq(brand.id, offer.brandId))
    .where(eq(offer.id, id))
    .limit(1)

  if (!offerRow) notFound()

  // Load conditions (excluding soft-deleted)
  const conditions = await db
    .select()
    .from(offerCondition)
    .where(
      eq(offerCondition.offerId, id),
    )
    .orderBy(asc(offerCondition.priority))

  // Collect condition IDs — skip loading if no conditions
  const conditionIds = conditions.map((c) => c.id)

  if (conditionIds.length === 0) {
    // Nothing to load — render page with empty conditions
    const [allProducts, allBenefits] = await Promise.all([
      db.select({ id: product.id, name: product.name }).from(product).where(isNull(product.deletedAt)),
      db.select({ id: commercialBenefit.id, name: commercialBenefit.name }).from(commercialBenefit),
    ])

    return renderPage(offerRow, [], allProducts, allBenefits)
  }

  // Load all related data in parallel
  const [allItems, allPaymentOptions, allGroups, allRules, allProducts, allBenefits] =
    await Promise.all([
      // Items with product/benefit names
      db
        .select({
          id: offerConditionItem.id,
          offerConditionId: offerConditionItem.offerConditionId,
          kind: offerConditionItem.kind,
          quantity: offerConditionItem.quantity,
          vigencyMonths: offerConditionItem.vigencyMonths,
          discount: offerConditionItem.discount,
          orderIndex: offerConditionItem.orderIndex,
          productName: product.name,
          benefitName: commercialBenefit.name,
        })
        .from(offerConditionItem)
        .leftJoin(product, eq(product.id, offerConditionItem.productId))
        .leftJoin(
          commercialBenefit,
          eq(commercialBenefit.id, offerConditionItem.commercialBenefitId),
        )
        .where(inArray(offerConditionItem.offerConditionId, conditionIds)),

      // Payment options
      db
        .select({
          id: offerPaymentOption.id,
          offerConditionId: offerPaymentOption.offerConditionId,
          method: offerPaymentOption.method,
          price: offerPaymentOption.price,
          installments: offerPaymentOption.installments,
          isActive: offerPaymentOption.isActive,
        })
        .from(offerPaymentOption)
        .where(inArray(offerPaymentOption.offerConditionId, conditionIds)),

      // Rule groups
      db
        .select({
          id: offerConditionRuleGroup.id,
          offerConditionId: offerConditionRuleGroup.offerConditionId,
          parentGroupId: offerConditionRuleGroup.parentGroupId,
          operator: offerConditionRuleGroup.operator,
        })
        .from(offerConditionRuleGroup)
        .where(inArray(offerConditionRuleGroup.offerConditionId, conditionIds)),

      // Rules (fetched after groups so we have group IDs)
      db
        .select({
          id: offerConditionRule.id,
          ruleGroupId: offerConditionRule.ruleGroupId,
          kind: offerConditionRule.kind,
          params: offerConditionRule.params,
          createdAt: offerConditionRule.createdAt,
        })
        .from(offerConditionRule)
        .innerJoin(
          offerConditionRuleGroup,
          eq(offerConditionRuleGroup.id, offerConditionRule.ruleGroupId),
        )
        .where(inArray(offerConditionRuleGroup.offerConditionId, conditionIds)),

      // Catalog for item editor
      db.select({ id: product.id, name: product.name }).from(product).where(isNull(product.deletedAt)),
      db.select({ id: commercialBenefit.id, name: commercialBenefit.name }).from(commercialBenefit),
    ])

  // Build per-condition data maps
  const conditionData: ConditionData[] = conditions.map((c) => {
    const condGroups = allGroups.filter((g) => g.offerConditionId === c.id) as FlatGroup[]
    const condRules = allRules.filter((r) => {
      const g = allGroups.find((grp) => grp.id === r.ruleGroupId)
      return g?.offerConditionId === c.id
    }) as FlatRule[]

    return {
      id: c.id,
      name: c.name,
      description: c.description,
      priority: c.priority,
      advantageScore: c.advantageScore,
      status: c.status as ConditionData['status'],
      isDefault: c.isDefault,
      isPublic: c.isPublic,
      ruleGroups: buildGroupTree(condGroups, condRules, null),
      items: allItems
        .filter((i) => i.offerConditionId === c.id)
        .map((item) => ({
          id: item.id,
          kind: item.kind as ConditionData['items'][number]['kind'],
          productName: item.productName ?? null,
          benefitName: item.benefitName ?? null,
          quantity: item.quantity,
          vigencyMonths: item.vigencyMonths,
          discount: item.discount,
          orderIndex: item.orderIndex,
        })),
      paymentOptions: allPaymentOptions
        .filter((p) => p.offerConditionId === c.id)
        .map((opt) => ({
          id: opt.id,
          method: opt.method as ConditionData['paymentOptions'][number]['method'],
          price: opt.price,
          installments: opt.installments,
          isActive: opt.isActive,
        })),
    }
  })

  return renderPage(offerRow, conditionData, allProducts, allBenefits)
}

// ---------------------------------------------------------------------------
// Render helper (avoids duplication in early-return branch)
// ---------------------------------------------------------------------------

type OfferRow = {
  id: string
  name: string
  slug: string
  status: string
  type: string
  description: string | null
  brandId: string
  brandName: string
}

function renderPage(
  offerRow: OfferRow,
  conditionData: ConditionData[],
  allProducts: { id: string; name: string }[],
  allBenefits: { id: string; name: string }[],
) {
  const isArchived = offerRow.status === 'archived'
  const canPublish = offerRow.status === 'draft' || offerRow.status === 'paused'
  const canArchive = offerRow.status !== 'archived'

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação" className="text-sm text-slate-500">
        <Link
          href={'/offers' as Route}
          className="hover:text-slate-800 underline-offset-2 hover:underline"
        >
          Ofertas
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-slate-900 font-medium">{offerRow.name}</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900">{offerRow.name}</h1>
            <Badge
              variant={OFFER_STATUS_VARIANT[offerRow.status as OfferStatus]}
              aria-label={`Status da oferta: ${OFFER_STATUS_LABEL[offerRow.status as OfferStatus]}`}
            >
              {OFFER_STATUS_LABEL[offerRow.status as OfferStatus]}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            <span className="font-medium">{offerRow.brandName}</span>
            {' · '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-mono text-slate-600">
              {offerRow.slug}
            </code>
            {offerRow.type === 'renewal' && (
              <span className="ml-2 text-xs font-medium text-purple-600">[Renovação]</span>
            )}
          </p>
          {offerRow.description && (
            <p className="text-sm text-slate-600 max-w-xl">{offerRow.description}</p>
          )}
        </div>

        {/* Action buttons */}
        {!isArchived && (
          <div className="flex shrink-0 gap-2">
            {canPublish && <PublishOfferButton offerId={offerRow.id} />}
            {canArchive && <ArchiveOfferButton offerId={offerRow.id} />}
          </div>
        )}
      </div>

      {/* Condition tabs */}
      <ConditionTabs
        offerId={offerRow.id}
        conditions={conditionData}
        products={allProducts}
        benefits={allBenefits}
      />
    </div>
  )
}
