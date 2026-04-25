/**
 * MOD-TRANSACTION — composeSnapshot
 *
 * T-8-07
 * docs/20-domain/11-transaction-snapshot.md §3.2 (payload schema) + §10 (fluxo)
 * BR-SNAPSHOT-IMMUTABILITY: esta função SOMENTE COMPÕE o payload; quem chama
 *   é responsável pelo INSERT em transaction_snapshot.
 *
 * ADR-10: lança DomainError (NotFoundError, BusinessRuleViolation), nunca retorna Result<T,E>.
 * ADR-11: tx: DbTx como primeiro argumento (função lê do DB via transação ativa).
 */

import { eq } from 'drizzle-orm'
import type { DbTx } from '@/lib/db/client'
import {
  transaction,
  transactionStatusEnum,
} from '@/lib/db/schema/transaction'
import {
  offer,
  offerCondition,
  offerConditionItem,
  offerConditionRuleGroup,
  offerConditionRule,
  offerPaymentOption,
} from '@/lib/db/schema/offer'
import { brand, legalEntity } from '@/lib/db/schema/organization'
import { product, commercialBenefit } from '@/lib/db/schema/catalog'
import {
  TransactionNotFoundError,
  SnapshotNotAllowedError,
} from './errors'

// ---------------------------------------------------------------------------
// Tipos de domínio — TransactionSnapshotPayload v1
// docs/20-domain/11-transaction-snapshot.md §3.2
// ---------------------------------------------------------------------------

export type RuleNode =
  | {
      kind: 'group'
      id: string
      operator: 'and' | 'or'
      children: RuleNode[]
    }
  | {
      kind: 'rule'
      id: string
      ruleKind: string
      params: Record<string, unknown>
    }

export type TransactionSnapshotPayload = {
  version: 1
  captured_at: string // ISO8601 server-side
  brand: {
    id: string
    name: string
    slug: string
  }
  legal_entity: {
    id: string
    cnpj: string
    company_name: string
    tax_regime?: string
  }
  offer: {
    id: string
    name: string
    slug: string
    type: 'regular' | 'renewal'
    renews_offer_id?: string
  }
  condition: {
    id: string
    name: string
    priority: number
    advantage_score: number
    is_default: boolean
    is_public: boolean
  }
  rules: {
    group_id: string
    operator: 'and' | 'or'
    children: RuleNode[]
    evaluation: 'match' | 'fallback_default'
    context_snapshot: {
      campaign_id?: string
      creative_id?: string
      channel?: string
      is_internal?: boolean
    }
  }
  items: Array<{
    condition_item_id: string
    kind: 'main' | 'bonus' | 'upsell' | 'order_bump' | 'complement' | 'commercial_benefit'
    product?: { id: string; name: string; slug: string; kind: string }
    commercial_benefit?: { id: string; name: string; slug: string; auto_tag?: string }
    quantity: number
    access_rule: Record<string, unknown>
    vigency_months: number | null
    discount: number | null
    responsible_user_id: string | null
  }>
  payment_option: {
    id: string
    method: string
    price: number
    installments: number | null
    custom_config: Record<string, unknown>
  }
  source: {
    provider?: string
    external_id?: string
    raw_event_id?: string
  }
}

// Re-export errors so consumers of snapshot.ts get them from one place.
export { TransactionNotFoundError, SnapshotNotAllowedError } from './errors'

// ---------------------------------------------------------------------------
// Helpers: build RuleNode tree from groups + rules fetched from DB
// ---------------------------------------------------------------------------

type DbRuleGroup = {
  id: string
  parentGroupId: string | null
  operator: 'and' | 'or'
}

type DbRule = {
  id: string
  ruleGroupId: string
  kind: string
  params: unknown
}

function buildRuleTree(
  groups: DbRuleGroup[],
  rules: DbRule[],
  parentId: string | null,
): RuleNode[] {
  const childGroups = groups.filter((g) => g.parentGroupId === parentId)
  const directRules = rules.filter((r) => {
    // root-level rules belong to the root group (parentId === null means we're at root)
    if (parentId === null) return false
    return r.ruleGroupId === parentId
  })

  const ruleNodes: RuleNode[] = directRules.map((r) => ({
    kind: 'rule' as const,
    id: r.id,
    ruleKind: r.kind,
    params: (r.params as Record<string, unknown>) ?? {},
  }))

  const groupNodes: RuleNode[] = childGroups.map((g) => ({
    kind: 'group' as const,
    id: g.id,
    operator: g.operator,
    children: buildRuleTree(groups, rules, g.id),
  }))

  return [...ruleNodes, ...groupNodes]
}

// ---------------------------------------------------------------------------
// composeSnapshot
// ---------------------------------------------------------------------------

/**
 * Compõe o payload imutável do snapshot de uma transação.
 *
 * Busca no banco (via tx ativa) todos os dados da transação, oferta, condição,
 * itens, grupos de regras, opção de pagamento e marca, e serializa tudo em um
 * objeto `TransactionSnapshotPayload` com schema_version v1.
 *
 * Esta função APENAS COMPÕE — não persiste. O INSERT em `transaction_snapshot`
 * é responsabilidade de quem chama (ex.: `approveTransaction`).
 *
 * BR-SNAPSHOT-IMMUTABILITY: o payload congela o estado ATUAL de offer.name,
 * condition.name etc. Alterações futuras nas entidades não afetam snapshots passados.
 *
 * @param tx             Transação DB ativa (ADR-11)
 * @param transactionId  UUID da transação a ser snapshot-ada
 * @returns              Payload pronto para INSERT em transaction_snapshot.payload
 * @throws TransactionNotFoundError   se transactionId não existir
 * @throws SnapshotNotAllowedError    se status não permite snapshot
 */
export async function composeSnapshot(
  tx: DbTx,
  transactionId: string,
): Promise<TransactionSnapshotPayload> {
  // 1. Fetch transaction
  const txRows = await tx
    .select()
    .from(transaction)
    .where(eq(transaction.id, transactionId))
    .limit(1)

  const trx = txRows[0]

  if (!trx) {
    throw new TransactionNotFoundError(transactionId)
  }

  // BR-SNAPSHOT-IMMUTABILITY: apenas transações em status 'pending' ou 'approved'
  // podem ter snapshot composto. Outros status indicam que a transação já foi
  // finalizada (refused, refunded, chargeback, cancelled) e não devem gerar snapshot.
  const allowedStatuses: Array<typeof transactionStatusEnum.enumValues[number]> = [
    'pending',
    'approved',
  ]

  if (!allowedStatuses.includes(trx.status)) {
    throw new SnapshotNotAllowedError(transactionId, trx.status)
  }

  // 2. Fetch offer (congelando nome e demais campos no momento da chamada)
  const offerRows = await tx
    .select()
    .from(offer)
    .where(eq(offer.id, trx.offerId))
    .limit(1)

  const offerRow = offerRows[0]
  if (!offerRow) {
    throw new TransactionNotFoundError(`offer ${trx.offerId} not found for transaction ${transactionId}`)
  }

  // 3. Fetch brand
  const brandRows = await tx
    .select()
    .from(brand)
    .where(eq(brand.id, trx.brandId))
    .limit(1)

  const brandRow = brandRows[0]
  if (!brandRow) {
    throw new TransactionNotFoundError(`brand ${trx.brandId} not found for transaction ${transactionId}`)
  }

  // 4. Fetch legal_entity (issuing — from offer)
  const legalEntityRows = await tx
    .select()
    .from(legalEntity)
    .where(eq(legalEntity.id, offerRow.issuingLegalEntityId))
    .limit(1)

  const legalEntityRow = legalEntityRows[0]
  if (!legalEntityRow) {
    throw new TransactionNotFoundError(
      `legal_entity ${offerRow.issuingLegalEntityId} not found for transaction ${transactionId}`,
    )
  }

  // 5. Fetch offer_condition
  const conditionRows = await tx
    .select()
    .from(offerCondition)
    .where(eq(offerCondition.id, trx.offerConditionId))
    .limit(1)

  const conditionRow = conditionRows[0]
  if (!conditionRow) {
    throw new TransactionNotFoundError(
      `offer_condition ${trx.offerConditionId} not found for transaction ${transactionId}`,
    )
  }

  // 6. Fetch offer_condition_items
  const itemRows = await tx
    .select()
    .from(offerConditionItem)
    .where(eq(offerConditionItem.offerConditionId, trx.offerConditionId))

  // 7. Fetch products and commercial_benefits for items (batch lookup)
  const productIds = itemRows
    .filter((i) => i.productId !== null)
    .map((i) => i.productId as string)

  const benefitIds = itemRows
    .filter((i) => i.commercialBenefitId !== null)
    .map((i) => i.commercialBenefitId as string)

  const productMap = new Map<
    string,
    { id: string; name: string; slug: string; kind: string }
  >()

  if (productIds.length > 0) {
    // Fetch products one-by-one via eq (Drizzle does not have inArray in tx easily)
    // In practice with many items this would use inArray, but since we control the
    // implementation and ownership, we do a simple loop safe for typical offer sizes.
    for (const pid of productIds) {
      const pRows = await tx.select().from(product).where(eq(product.id, pid)).limit(1)
      const p = pRows[0]
      if (p) {
        productMap.set(p.id, {
          id: p.id,
          name: p.name,
          slug: p.slug,
          kind: p.kind,
        })
      }
    }
  }

  const benefitMap = new Map<
    string,
    { id: string; name: string; slug: string; auto_tag?: string }
  >()

  if (benefitIds.length > 0) {
    for (const bid of benefitIds) {
      const bRows = await tx
        .select()
        .from(commercialBenefit)
        .where(eq(commercialBenefit.id, bid))
        .limit(1)
      const b = bRows[0]
      if (b) {
        benefitMap.set(b.id, {
          id: b.id,
          name: b.name,
          slug: b.slug,
          ...(b.autoTag != null ? { auto_tag: b.autoTag } : {}),
        })
      }
    }
  }

  // 8. Fetch offer_condition_rule_groups for the condition
  const ruleGroupRows = await tx
    .select()
    .from(offerConditionRuleGroup)
    .where(eq(offerConditionRuleGroup.offerConditionId, trx.offerConditionId))

  // 9. Fetch all rules belonging to those groups
  const ruleRows: Array<{
    id: string
    ruleGroupId: string
    kind: string
    params: unknown
  }> = []

  for (const rg of ruleGroupRows) {
    const rgRules = await tx
      .select()
      .from(offerConditionRule)
      .where(eq(offerConditionRule.ruleGroupId, rg.id))
    ruleRows.push(
      ...rgRules.map((r) => ({
        id: r.id,
        ruleGroupId: r.ruleGroupId,
        kind: r.kind,
        params: r.params,
      })),
    )
  }

  // 10. Fetch offer_payment_option
  const paymentOptionRows = await tx
    .select()
    .from(offerPaymentOption)
    .where(eq(offerPaymentOption.id, trx.offerPaymentOptionId))
    .limit(1)

  const paymentOptionRow = paymentOptionRows[0]
  if (!paymentOptionRow) {
    throw new TransactionNotFoundError(
      `offer_payment_option ${trx.offerPaymentOptionId} not found for transaction ${transactionId}`,
    )
  }

  // ---------------------------------------------------------------------------
  // Build rule tree
  // ---------------------------------------------------------------------------

  const rootGroup = ruleGroupRows.find((g) => g.parentGroupId === null)

  let rulesSection: TransactionSnapshotPayload['rules']

  if (rootGroup) {
    const children = buildRuleTree(
      ruleGroupRows.map((g) => ({
        id: g.id,
        parentGroupId: g.parentGroupId ?? null,
        operator: g.operator,
      })),
      ruleRows,
      rootGroup.id,
    )

    // Also include direct rules of the root group
    const rootRules = ruleRows
      .filter((r) => r.ruleGroupId === rootGroup.id)
      .map((r): RuleNode => ({
        kind: 'rule',
        id: r.id,
        ruleKind: r.kind,
        params: (r.params as Record<string, unknown>) ?? {},
      }))

    rulesSection = {
      group_id: rootGroup.id,
      operator: rootGroup.operator,
      children: [...rootRules, ...children],
      // BR-SNAPSHOT-IMMUTABILITY: evaluation context is opaque at compose time;
      // the caller may enrich this — for now we record empty context.
      evaluation: conditionRow.isDefault ? 'fallback_default' : 'match',
      context_snapshot: {},
    }
  } else {
    // No rule groups — use a synthetic empty root
    rulesSection = {
      group_id: '',
      operator: 'and',
      children: [],
      evaluation: conditionRow.isDefault ? 'fallback_default' : 'match',
      context_snapshot: {},
    }
  }

  // ---------------------------------------------------------------------------
  // Serialize items
  // ---------------------------------------------------------------------------

  const serializedItems: TransactionSnapshotPayload['items'] = itemRows.map((item) => {
    const base = {
      condition_item_id: item.id,
      kind: item.kind,
      quantity: item.quantity,
      access_rule: (item.accessRule as Record<string, unknown>) ?? {},
      vigency_months: item.vigencyMonths ?? null,
      discount: item.discount !== null ? Number(item.discount) : null,
      responsible_user_id: item.responsibleUserId ?? null,
    } satisfies {
      condition_item_id: string
      kind: TransactionSnapshotPayload['items'][number]['kind']
      quantity: number
      access_rule: Record<string, unknown>
      vigency_months: number | null
      discount: number | null
      responsible_user_id: string | null
    }

    if (item.productId !== null) {
      const prod = productMap.get(item.productId)
      if (prod) {
        return { ...base, product: prod }
      }
      return base
    }

    if (item.commercialBenefitId !== null) {
      const ben = benefitMap.get(item.commercialBenefitId)
      if (ben) {
        return { ...base, commercial_benefit: ben }
      }
      return base
    }

    return base
  })

  // ---------------------------------------------------------------------------
  // Compose final payload
  // BR-SNAPSHOT-IMMUTABILITY: captured_at is set here, server-side.
  // ---------------------------------------------------------------------------

  const payload: TransactionSnapshotPayload = {
    version: 1,
    captured_at: new Date().toISOString(),

    brand: {
      id: brandRow.id,
      name: brandRow.name,
      slug: brandRow.slug,
    },

    legal_entity: {
      id: legalEntityRow.id,
      cnpj: legalEntityRow.cnpj,
      company_name: legalEntityRow.companyName,
      ...(legalEntityRow.taxRegime != null
        ? { tax_regime: legalEntityRow.taxRegime }
        : {}),
    },

    offer: {
      id: offerRow.id,
      name: offerRow.name,
      slug: offerRow.slug,
      type: offerRow.type as 'regular' | 'renewal',
      ...(offerRow.renewsOfferId != null
        ? { renews_offer_id: offerRow.renewsOfferId }
        : {}),
    },

    condition: {
      id: conditionRow.id,
      name: conditionRow.name,
      priority: conditionRow.priority,
      advantage_score: Number(conditionRow.advantageScore),
      is_default: conditionRow.isDefault,
      is_public: conditionRow.isPublic,
    },

    rules: rulesSection,

    items: serializedItems,

    payment_option: {
      id: paymentOptionRow.id,
      method: paymentOptionRow.method,
      price: Number(paymentOptionRow.price),
      installments: paymentOptionRow.installments ?? null,
      custom_config: (paymentOptionRow.customConfig as Record<string, unknown>) ?? {},
    },

    source: {
      ...(trx.externalProvider != null ? { provider: trx.externalProvider } : {}),
      ...(trx.externalId != null ? { external_id: trx.externalId } : {}),
    },
  }

  return payload
}
