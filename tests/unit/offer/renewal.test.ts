/**
 * Unit tests for assertRenewalEligibility (lib/domain/offer/renewal.ts)
 *
 * FLOW-10: Renewal via New Offer
 * BR-RENEWAL: docs/50-business-rules/BR-RENEWAL.md
 *
 * Tests use mocked tx — no real DB connection.
 *
 * Naming convention: Given/When/Then
 */

import { describe, it, expect } from 'vitest'
import { assertRenewalEligibility } from '../../../lib/domain/offer/renewal'
import {
  OfferNotRenewal,
  RenewalWithoutActiveEntitlement,
} from '../../../lib/domain/offer/errors'
import type { DbTx } from '../../../lib/db/client'

// ---------------------------------------------------------------------------
// Helpers — minimal tx mock factory
//
// assertRenewalEligibility makes two sequential .select() chains:
//   1. SELECT offer WHERE id=offerId  → returns the offer row (or empty)
//   2. SELECT customer_entitlement JOIN transaction ... → returns eligible rows
//
// We simulate the Drizzle fluent API by returning a chainable object whose
// terminal call (.limit(1)) resolves to the pre-configured result rows.
// ---------------------------------------------------------------------------

type SelectResult = Array<Record<string, unknown>>

/**
 * Builds a minimal DbTx mock that answers select() queries in order.
 * Each call to `tx.select()` consumes the next element of `results`.
 */
function buildTxMock(results: SelectResult[]): DbTx {
  let callIndex = 0

  const makeChain = (rows: SelectResult) => {
    const chain = {
      from: () => chain,
      innerJoin: () => chain,
      where: () => chain,
      limit: (_n: number) => Promise.resolve(rows),
    }
    return chain
  }

  return {
    select: (_fields?: unknown) => {
      const rows = results[callIndex++] ?? []
      return makeChain(rows) as unknown as ReturnType<DbTx['select']>
    },
  } as unknown as DbTx
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const OFFER_ID = 'offer-renewal-uuid'
const ORIGIN_OFFER_ID = 'offer-origin-uuid'
const CONTACT_ID = 'contact-uuid'

const renewalOfferRow = {
  id: OFFER_ID,
  type: 'renewal',
  renewsOfferId: ORIGIN_OFFER_ID,
}

const standardOfferRow = {
  id: OFFER_ID,
  type: 'regular',
  renewsOfferId: null,
}

const activeEntitlementRow = { id: 'ent-uuid' }

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('BR-RENEWAL assertRenewalEligibility', () => {
  // -------------------------------------------------------------------------
  // CT-RENEWAL (E-01): oferta não é renewal → OfferNotRenewal
  // -------------------------------------------------------------------------
  it('given offer type is standard (regular) when assertRenewalEligibility then throws OfferNotRenewal', async () => {
    const tx = buildTxMock([[standardOfferRow]])

    await expect(
      assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID),
    ).rejects.toThrow(OfferNotRenewal)
  })

  it('given offer does not exist when assertRenewalEligibility then throws OfferNotRenewal', async () => {
    // Empty result — offer not found
    const tx = buildTxMock([[]])

    await expect(
      assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID),
    ).rejects.toThrow(OfferNotRenewal)
  })

  it('given offer type is renewal but renews_offer_id is null when assertRenewalEligibility then throws OfferNotRenewal', async () => {
    const offerWithoutRef = { id: OFFER_ID, type: 'renewal', renewsOfferId: null }
    const tx = buildTxMock([[offerWithoutRef]])

    await expect(
      assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID),
    ).rejects.toThrow(OfferNotRenewal)
  })

  // -------------------------------------------------------------------------
  // CT-RENEWAL-02: contato sem entitlement → RenewalWithoutActiveEntitlement
  // -------------------------------------------------------------------------
  it('given contact has no entitlement from origin offer when assertRenewalEligibility then throws RenewalWithoutActiveEntitlement', async () => {
    // First call returns renewal offer; second returns empty entitlement list
    const tx = buildTxMock([[renewalOfferRow], []])

    await expect(
      assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID),
    ).rejects.toThrow(RenewalWithoutActiveEntitlement)
  })

  it('CT-RENEWAL-02: error carries contactId and originOfferId for observability', async () => {
    const tx = buildTxMock([[renewalOfferRow], []])

    try {
      await assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(RenewalWithoutActiveEntitlement)
      const typed = err as RenewalWithoutActiveEntitlement
      expect(typed.contactId).toBe(CONTACT_ID)
      expect(typed.originOfferId).toBe(ORIGIN_OFFER_ID)
    }
  })

  // -------------------------------------------------------------------------
  // CT-RENEWAL-03: entitlement revogado → RenewalWithoutActiveEntitlement
  //
  // The SQL filter in assertRenewalEligibility only accepts status='active' or
  // status='expired' (within grace). Revoked entries never satisfy the WHERE
  // clause, so the query returns empty → same error path as CT-RENEWAL-02.
  // We simulate this by returning an empty result for the entitlement query.
  // -------------------------------------------------------------------------
  it('CT-RENEWAL-03: given entitlement is revoked (revoked status excluded by filter) when assertRenewalEligibility then throws RenewalWithoutActiveEntitlement', async () => {
    // The DB filter excludes revoked rows; mock returns empty to represent that
    const tx = buildTxMock([[renewalOfferRow], []])

    await expect(
      assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID),
    ).rejects.toThrow(RenewalWithoutActiveEntitlement)
  })

  // -------------------------------------------------------------------------
  // CT-RENEWAL-06: dentro da grace period (expired, ends_at=now-15d, grace=30d) → passa
  //
  // The SQL filter selects expired entitlements with ends_at > now()-30d.
  // We simulate the DB returning a matching row (expired but in grace period).
  // -------------------------------------------------------------------------
  it('CT-RENEWAL-06: given entitlement expired 15 days ago (within 30d grace) when assertRenewalEligibility then resolves without error', async () => {
    // DB finds expired-within-grace entitlement — mock returns the row
    const tx = buildTxMock([[renewalOfferRow], [activeEntitlementRow]])

    await expect(
      assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID),
    ).resolves.toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Happy path: active entitlement found → resolves
  // -------------------------------------------------------------------------
  it('given contact has active entitlement from origin offer when assertRenewalEligibility then resolves without error', async () => {
    const tx = buildTxMock([[renewalOfferRow], [activeEntitlementRow]])

    await expect(
      assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID),
    ).resolves.toBeUndefined()
  })

  // -------------------------------------------------------------------------
  // Error identity: OfferNotRenewal has correct properties
  // -------------------------------------------------------------------------
  it('given offer type is standard when error thrown then OfferNotRenewal carries offerId', async () => {
    const tx = buildTxMock([[standardOfferRow]])

    try {
      await assertRenewalEligibility(tx, CONTACT_ID, OFFER_ID)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(OfferNotRenewal)
      const typed = err as OfferNotRenewal
      expect(typed.offerId).toBe(OFFER_ID)
      expect(typed.name).toBe('OfferNotRenewal')
    }
  })
})
