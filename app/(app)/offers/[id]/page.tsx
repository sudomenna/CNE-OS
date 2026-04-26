/**
 * /offers/[id] — Editor de oferta (wizard 3 passos).
 *
 * Server Component: carrega oferta + condições + itens + payment options + rule groups via Drizzle.
 * Renderiza <OfferWizard> passando todos os dados.
 *
 * T-12 — spec: docs/70-ux/06-screen-offer-builder.md
 * T-6-18 — spec original: docs/20-domain/10-offer-engine.md
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
import { OfferWizard } from '@/components/offer/offer-wizard'
import type { ConditionData } from '@/components/offer/condition-tabs'
import type { RuleGroupData } from '@/components/offer/rule-group-editor'

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
// Metadata
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
    .where(eq(offerCondition.offerId, id))
    .orderBy(asc(offerCondition.priority))

  const conditionIds = conditions.map((c) => c.id)

  if (conditionIds.length === 0) {
    const [allProducts, allBenefits] = await Promise.all([
      db.select({ id: product.id, name: product.name }).from(product).where(isNull(product.deletedAt)),
      db.select({ id: commercialBenefit.id, name: commercialBenefit.name }).from(commercialBenefit),
    ])

    return renderPage(
      { ...offerRow, type: offerRow.type as 'regular' | 'renewal' },
      [],
      allProducts,
      allBenefits,
    )
  }

  // Load all related data in parallel
  const [allItems, allPaymentOptions, allGroups, allRules, allProducts, allBenefits] =
    await Promise.all([
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
        .leftJoin(commercialBenefit, eq(commercialBenefit.id, offerConditionItem.commercialBenefitId))
        .where(inArray(offerConditionItem.offerConditionId, conditionIds)),

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

      db
        .select({
          id: offerConditionRuleGroup.id,
          offerConditionId: offerConditionRuleGroup.offerConditionId,
          parentGroupId: offerConditionRuleGroup.parentGroupId,
          operator: offerConditionRuleGroup.operator,
        })
        .from(offerConditionRuleGroup)
        .where(inArray(offerConditionRuleGroup.offerConditionId, conditionIds)),

      db
        .select({
          id: offerConditionRule.id,
          ruleGroupId: offerConditionRule.ruleGroupId,
          kind: offerConditionRule.kind,
          params: offerConditionRule.params,
          createdAt: offerConditionRule.createdAt,
        })
        .from(offerConditionRule)
        .innerJoin(offerConditionRuleGroup, eq(offerConditionRuleGroup.id, offerConditionRule.ruleGroupId))
        .where(inArray(offerConditionRuleGroup.offerConditionId, conditionIds)),

      db.select({ id: product.id, name: product.name }).from(product).where(isNull(product.deletedAt)),
      db.select({ id: commercialBenefit.id, name: commercialBenefit.name }).from(commercialBenefit),
    ])

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

  return renderPage(
    { ...offerRow, type: offerRow.type as 'regular' | 'renewal' },
    conditionData,
    allProducts,
    allBenefits,
  )
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

type OfferRow = {
  id: string
  name: string
  slug: string
  status: string
  type: 'regular' | 'renewal'
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
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Navegação" className="text-sm text-muted-foreground">
        <Link
          href={'/offers' as Route}
          className="hover:text-foreground underline-offset-2 hover:underline"
        >
          Ofertas
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span className="text-foreground font-medium">{offerRow.name}</span>
      </nav>

      <OfferWizard
        offerRow={offerRow}
        conditionData={conditionData}
        products={allProducts}
        benefits={allBenefits}
      />
    </div>
  )
}
