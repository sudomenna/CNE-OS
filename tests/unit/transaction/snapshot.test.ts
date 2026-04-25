/**
 * Unit tests — composeSnapshot
 *
 * T-8-07
 * docs/20-domain/11-transaction-snapshot.md §3.2 + §10
 * BR-SNAPSHOT-IMMUTABILITY
 *
 * Estratégia: injetar um tx fake cujas queries retornam fixtures controladas
 * via makeTx helper. Nenhuma conexão real ao banco.
 *
 * Naming: Given/When/Then (CLAUDE.md §Teste).
 */

import { describe, it, expect, vi } from 'vitest'
import type { DbTx } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRX_ID = '00000000-0000-0000-0000-000000000001'
const OFFER_ID = '00000000-0000-0000-0000-000000000002'
const BRAND_ID = '00000000-0000-0000-0000-000000000003'
const LE_ID = '00000000-0000-0000-0000-000000000004'
const CONDITION_ID = '00000000-0000-0000-0000-000000000005'
const PAYMENT_OPT_ID = '00000000-0000-0000-0000-000000000006'
const PRODUCT_ID = '00000000-0000-0000-0000-000000000007'
const RULE_GROUP_ID = '00000000-0000-0000-0000-000000000008'
const RULE_ID = '00000000-0000-0000-0000-000000000009'
const ITEM_ID = '00000000-0000-0000-0000-000000000010'

const fixtureTrx = {
  id: TRX_ID,
  brandId: BRAND_ID,
  contactId: '00000000-0000-0000-0000-000000000099',
  offerId: OFFER_ID,
  offerConditionId: CONDITION_ID,
  offerPaymentOptionId: PAYMENT_OPT_ID,
  status: 'pending' as const,
  amount: '297.00',
  currency: 'BRL',
  externalProvider: null,
  externalId: null,
  externalFee: null,
  snapshotId: null,
  approvedAt: null,
  refusedAt: null,
  createdAt: new Date('2026-04-25T10:00:00Z'),
  updatedAt: new Date('2026-04-25T10:00:00Z'),
}

const fixtureOffer = {
  id: OFFER_ID,
  brandId: BRAND_ID,
  issuingLegalEntityId: LE_ID,
  name: 'Mentoria Avançada 2026',
  slug: 'mentoria-avancada-2026',
  description: null,
  type: 'regular',
  renewsOfferId: null,
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
}

const fixtureBrand = {
  id: BRAND_ID,
  name: 'CNE Educação',
  slug: 'cne-educacao',
  logoUrl: null,
  primaryColor: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const fixtureLegalEntity = {
  id: LE_ID,
  cnpj: '12345678000199',
  companyName: 'CNE Educação LTDA',
  tradeName: null,
  taxRegime: 'lucro_presumido',
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fixtureCondition = {
  id: CONDITION_ID,
  offerId: OFFER_ID,
  name: 'Condição VIP',
  description: null,
  priority: 10,
  advantageScore: '50',
  status: 'active',
  isPublic: true,
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: null,
  deletedAt: null,
}

const fixtureItem = {
  id: ITEM_ID,
  offerConditionId: CONDITION_ID,
  kind: 'main',
  productId: PRODUCT_ID,
  commercialBenefitId: null,
  quantity: 1,
  accessRule: {},
  vigencyMonths: 12,
  discount: null,
  responsibleUserId: null,
  orderIndex: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fixtureProduct = {
  id: PRODUCT_ID,
  brandId: BRAND_ID,
  categoryId: null,
  name: 'Curso Mentoria Pro',
  slug: 'curso-mentoria-pro',
  kind: 'course',
  description: null,
  metadata: {},
  status: 'active',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const fixtureRuleGroup = {
  id: RULE_GROUP_ID,
  offerConditionId: CONDITION_ID,
  parentGroupId: null,
  operator: 'and',
  createdAt: new Date(),
}

const fixtureRule = {
  id: RULE_ID,
  ruleGroupId: RULE_GROUP_ID,
  kind: 'date_range',
  params: { start: '2026-01-01', end: '2026-12-31' },
  createdAt: new Date(),
}

const fixturePaymentOption = {
  id: PAYMENT_OPT_ID,
  offerConditionId: CONDITION_ID,
  method: 'pix',
  price: '297.00',
  installments: null,
  customConfig: {},
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

// ---------------------------------------------------------------------------
// makeTx: builds a mock DbTx where each tx.select() call consumes the next
// item in the responses queue in call order.
//
// composeSnapshot calls tx.select().from().where().limit() in this order:
//   1.  transaction         (limit 1)
//   2.  offer               (limit 1)
//   3.  brand               (limit 1)
//   4.  legalEntity         (limit 1)
//   5.  offerCondition      (limit 1)
//   6.  offerConditionItem  (no limit — returns all rows)
//   7.  product[0]          (limit 1)  — one per productId
//   8.  offerConditionRuleGroup (no limit)
//   9.  offerConditionRule for root group (no limit)
//  10.  offerPaymentOption  (limit 1)
// ---------------------------------------------------------------------------

function makeTx(responses: unknown[][]): DbTx {
  let callIdx = 0

  const selectMock = vi.fn((_fields?: unknown) => {
    const capturedIdx = callIdx
    callIdx++

    const result = responses[capturedIdx] ?? []

    const limitMock = vi.fn((_n?: number) => Promise.resolve(result))

    const whereMock = vi.fn((_cond?: unknown) => {
      // Return a thenable-and-has-limit object so both .where().limit() and
      // direct await of .where() work.
      const p = Promise.resolve(result) as Promise<unknown[]> & {
        limit: typeof limitMock
      }
      p.limit = limitMock
      return p
    })

    const fromMock = vi.fn((_table?: unknown) => ({
      where: whereMock,
      limit: limitMock,
    }))

    return { from: fromMock }
  })

  return { select: selectMock } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Default full tx for happy path
// ---------------------------------------------------------------------------

function buildFullTx(overrides?: { offerName?: string; txStatus?: string }): DbTx {
  const offerName = overrides?.offerName ?? fixtureOffer.name
  const txStatus = overrides?.txStatus ?? 'pending'

  return makeTx([
    [{ ...fixtureTrx, status: txStatus }],     // 1. transaction
    [{ ...fixtureOffer, name: offerName }],     // 2. offer
    [fixtureBrand],                             // 3. brand
    [fixtureLegalEntity],                       // 4. legalEntity
    [fixtureCondition],                         // 5. offerCondition
    [fixtureItem],                              // 6. offerConditionItem (all)
    [fixtureProduct],                           // 7. product
    [fixtureRuleGroup],                         // 8. offerConditionRuleGroup (all)
    [fixtureRule],                              // 9. offerConditionRule for rootGroup
    [fixturePaymentOption],                     // 10. offerPaymentOption
  ])
}

// ---------------------------------------------------------------------------
// Import after helpers are set up
// ---------------------------------------------------------------------------

import {
  composeSnapshot,
  TransactionNotFoundError,
  SnapshotNotAllowedError,
} from '../../../lib/domain/transaction/snapshot'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('T-8-07 composeSnapshot', () => {
  // Test 1 — Happy path: payload contains version 1
  it('given valid pending transaction when composeSnapshot then payload has version 1', async () => {
    const tx = buildFullTx()

    const payload = await composeSnapshot(tx, TRX_ID)

    expect(payload.version).toBe(1)
  })

  // Test 2 — captured_at is ISO 8601 string
  it('given valid transaction when composeSnapshot then captured_at is an ISO 8601 string', async () => {
    const tx = buildFullTx()

    const payload = await composeSnapshot(tx, TRX_ID)

    expect(typeof payload.captured_at).toBe('string')
    const parsed = new Date(payload.captured_at)
    expect(isNaN(parsed.getTime())).toBe(false)
    expect(payload.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  // Test 3 — offer.name is frozen at composition time (imutabilidade semântica)
  // BR-SNAPSHOT-IMMUTABILITY: a later rename of offer does NOT affect this payload.
  it('given offer.name="Oferta Verão" at composition time when composeSnapshot then payload.offer.name equals "Oferta Verão"', async () => {
    const offerNameAtCompositionTime = 'Oferta Verão'
    const tx = buildFullTx({ offerName: offerNameAtCompositionTime })

    const payload = await composeSnapshot(tx, TRX_ID)

    // BR-SNAPSHOT-IMMUTABILITY: payload freezes the offer.name at composition time.
    expect(payload.offer.name).toBe(offerNameAtCompositionTime)
  })

  // Test 4 — NotFoundError when transactionId does not exist
  it('given non-existent transactionId when composeSnapshot then throws TransactionNotFoundError', async () => {
    const tx = makeTx([
      [], // transaction not found
    ])

    await expect(composeSnapshot(tx, 'non-existent-id')).rejects.toThrow(
      TransactionNotFoundError,
    )
  })

  // Test 5 — SnapshotNotAllowedError when status is 'refused'
  it('given transaction with status=refused when composeSnapshot then throws SnapshotNotAllowedError', async () => {
    const tx = makeTx([[{ ...fixtureTrx, status: 'refused' }]])

    await expect(composeSnapshot(tx, TRX_ID)).rejects.toThrow(SnapshotNotAllowedError)
  })

  // Test 6 — SnapshotNotAllowedError when status is 'refunded'
  it('given transaction with status=refunded when composeSnapshot then throws SnapshotNotAllowedError', async () => {
    const tx = makeTx([[{ ...fixtureTrx, status: 'refunded' }]])

    await expect(composeSnapshot(tx, TRX_ID)).rejects.toThrow(SnapshotNotAllowedError)
  })

  // Test 7 — SnapshotNotAllowedError with correct status field when status is 'cancelled'
  it('given transaction with status=cancelled when composeSnapshot then throws SnapshotNotAllowedError with status=cancelled', async () => {
    const tx = makeTx([[{ ...fixtureTrx, status: 'cancelled' }]])

    const err = await composeSnapshot(tx, TRX_ID).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(SnapshotNotAllowedError)
    expect((err as SnapshotNotAllowedError).status).toBe('cancelled')
  })

  // Test 8 — Full payload shape validation
  it('given valid transaction when composeSnapshot then payload contains correct brand, legal_entity, condition and payment_option', async () => {
    const tx = buildFullTx()

    const payload = await composeSnapshot(tx, TRX_ID)

    expect(payload.brand).toEqual({
      id: fixtureBrand.id,
      name: fixtureBrand.name,
      slug: fixtureBrand.slug,
    })

    expect(payload.legal_entity).toMatchObject({
      id: fixtureLegalEntity.id,
      cnpj: fixtureLegalEntity.cnpj,
      company_name: fixtureLegalEntity.companyName,
    })

    expect(payload.condition).toEqual({
      id: fixtureCondition.id,
      name: fixtureCondition.name,
      priority: fixtureCondition.priority,
      advantage_score: Number(fixtureCondition.advantageScore),
      is_default: fixtureCondition.isDefault,
      is_public: fixtureCondition.isPublic,
    })

    expect(payload.payment_option).toEqual({
      id: fixturePaymentOption.id,
      method: fixturePaymentOption.method,
      price: Number(fixturePaymentOption.price),
      installments: null,
      custom_config: {},
    })
  })

  // Test 9 — Items are serialized with product reference
  it('given condition with one main product item when composeSnapshot then items array has correct product reference', async () => {
    const tx = buildFullTx()

    const payload = await composeSnapshot(tx, TRX_ID)

    expect(payload.items).toHaveLength(1)

    const item = payload.items[0]
    if (!item) throw new Error('Expected item at index 0')

    expect(item.condition_item_id).toBe(ITEM_ID)
    expect(item.kind).toBe('main')
    expect(item.quantity).toBe(1)
    expect(item.product).toMatchObject({
      id: PRODUCT_ID,
      name: fixtureProduct.name,
      slug: fixtureProduct.slug,
      kind: fixtureProduct.kind,
    })
  })

  // Test 10 — snapshot for approved transaction also succeeds
  it('given transaction with status=approved when composeSnapshot then returns payload successfully', async () => {
    const tx = buildFullTx({ txStatus: 'approved' })

    const payload = await composeSnapshot(tx, TRX_ID)

    expect(payload.version).toBe(1)
    expect(payload.offer.id).toBe(OFFER_ID)
  })
})
