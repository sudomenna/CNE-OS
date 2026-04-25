import { describe, expect, it } from 'vitest';
import {
  type CustomerEntitlement,
  type IncomingEntitlement,
  consolidate,
} from '../../../lib/domain/entitlement/consolidate';

// ---------------------------------------------------------------------------
// Fixtures helpers
// ---------------------------------------------------------------------------

function makeExisting(overrides: Partial<CustomerEntitlement> = {}): CustomerEntitlement {
  return {
    id: 'ent-001',
    contactId: 'contact-001',
    brandId: 'brand-001',
    kind: 'product_access',
    refKind: 'product',
    refId: 'product-001',
    quantity: 1,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-12-31T00:00:00Z'),
    status: 'active',
    accessRule: { drip: true },
    ...overrides,
  };
}

function makeIncoming(overrides: Partial<IncomingEntitlement> = {}): IncomingEntitlement {
  return {
    contactId: 'contact-001',
    brandId: 'brand-001',
    kind: 'product_access',
    refKind: 'product',
    refId: 'product-001',
    quantity: 1,
    startedAt: new Date('2026-06-01T00:00:00Z'),
    endsAt: new Date('2027-06-01T00:00:00Z'),
    accessRule: { drip: false },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BR-ENTITLEMENT-CONSOLIDATION — CT-ENT-CON-01
// ---------------------------------------------------------------------------

describe('BR-ENTITLEMENT-CONSOLIDATION', () => {
  describe('CT-ENT-CON-01 — existing=null', () => {
    it('given no existing entitlement when consolidate then action is create with reason initial_grant', () => {
      const incoming = makeIncoming({ endsAt: null });

      const result = consolidate(null, incoming);

      expect(result.action).toBe('create');
      expect(result.reason).toBe('initial_grant');
      if (result.action === 'create') {
        expect(result.next).toEqual(incoming);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CT-ENT-CON-02 — Both perpetuous → noop (unless quantity differs)
  // ---------------------------------------------------------------------------

  describe('CT-ENT-CON-02 — both perpetuous, same quantity', () => {
    it('given active perpetuous existing and perpetuous incoming with same quantity when consolidate then action is merge_quantity (quantity sums)', () => {
      // BR-ENTITLEMENT-CONSOLIDATION §CT-ENT-CON-08: quantity sempre soma
      // When both are perpetuous and incoming.quantity > 0, we get merge_quantity
      const existing = makeExisting({ endsAt: null, quantity: 1 });
      const incoming = makeIncoming({ endsAt: null, quantity: 2 });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('merge_quantity');
      if (result.action === 'merge_quantity') {
        expect(result.next.quantity).toBe(3);
        expect(result.next.endsAt).toBeNull();
        // BR-ENTITLEMENT-CONSOLIDATION: incoming.access_rule sobrescreve
        expect(result.next.accessRule).toEqual({ drip: false });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CT-ENT-CON-07 — Existing perpetuous absorbs incoming finite → noop
  // ---------------------------------------------------------------------------

  describe('CT-ENT-CON-07 — existing perpetuous, incoming finite', () => {
    it('given active perpetuous existing and finite incoming when consolidate then action is noop existing_already_perpetuous_stronger', () => {
      const existing = makeExisting({ endsAt: null });
      const incoming = makeIncoming({ endsAt: new Date('2026-12-31T00:00:00Z') });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('noop');
      expect(result.reason).toBe('existing_already_perpetuous_stronger');
    });
  });

  // ---------------------------------------------------------------------------
  // CT-ENT-CON-03 — Existing finite, incoming perpetuous → promote_perpetuous
  // ---------------------------------------------------------------------------

  describe('CT-ENT-CON-03 — incoming perpetuous promotes existing finite', () => {
    it('given active finite existing and perpetuous incoming when consolidate then action is promote_perpetuous with ends_at null', () => {
      const existing = makeExisting({ endsAt: new Date('2026-12-31T00:00:00Z'), quantity: 1 });
      const incoming = makeIncoming({ endsAt: null, quantity: 1 });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('promote_perpetuous');
      if (result.action === 'promote_perpetuous') {
        expect(result.next.endsAt).toBeNull();
        expect(result.next.quantity).toBe(2); // BR: somar quantity
        expect(result.next.accessRule).toEqual({ drip: false });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CT-ENT-CON-04 — Both finite with overlap → max(ends_at)
  // ---------------------------------------------------------------------------

  describe('CT-ENT-CON-04 — both finite with overlap, max wins', () => {
    it('given existing ends 2026-06-01 and incoming ends 2026-12-01 with overlap when consolidate then new ends_at is max (2026-12-01)', () => {
      const existing = makeExisting({
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-06-01T00:00:00Z'),
      });
      const incoming = makeIncoming({
        startedAt: new Date('2026-03-01T00:00:00Z'), // overlaps: before existing.endsAt
        endsAt: new Date('2026-12-01T00:00:00Z'),
      });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('extend_expiration');
      if (result.action === 'extend_expiration') {
        expect(result.next.endsAt).toEqual(new Date('2026-12-01T00:00:00Z'));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CT-ENT-CON-05 — Both finite with overlap, incoming wins on max
  // ---------------------------------------------------------------------------

  describe('CT-ENT-CON-05 — both finite extending +12 months with overlap', () => {
    it('given existing ends 2026-06-01 and incoming starts 2026-05-01 ends 2027-05-01 when consolidate then new ends_at is 2027-05-01 (max)', () => {
      const existing = makeExisting({
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: new Date('2026-06-01T00:00:00Z'),
      });
      const incoming = makeIncoming({
        startedAt: new Date('2026-05-01T00:00:00Z'), // overlaps
        endsAt: new Date('2027-05-01T00:00:00Z'),
      });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('extend_expiration');
      if (result.action === 'extend_expiration') {
        // max(2026-06-01, 2027-05-01) = 2027-05-01
        expect(result.next.endsAt).toEqual(new Date('2027-05-01T00:00:00Z'));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Both finite with gap → sum duration
  // ---------------------------------------------------------------------------

  describe('Both finite with gap between periods → sum duration', () => {
    it('given existing ends 2026-06-01 and incoming starts 2026-08-01 (gap) when consolidate then new ends_at extends by incoming duration', () => {
      const existingEndsAt = new Date('2026-06-01T00:00:00Z');
      const incomingStart = new Date('2026-08-01T00:00:00Z'); // gap: after existing.endsAt
      const incomingEnd = new Date('2027-08-01T00:00:00Z'); // 12 months

      const existing = makeExisting({
        startedAt: new Date('2026-01-01T00:00:00Z'),
        endsAt: existingEndsAt,
      });
      const incoming = makeIncoming({
        startedAt: incomingStart,
        endsAt: incomingEnd,
      });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('extend_expiration');
      if (result.action === 'extend_expiration') {
        // gap: new_ends_at = existing.endsAt + (incomingEnd - incomingStart) = 2026-06-01 + 12 months = 2027-06-01
        const expectedMs =
          existingEndsAt.getTime() + (incomingEnd.getTime() - incomingStart.getTime());
        expect(result.next.endsAt).toEqual(new Date(expectedMs));
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CT-ENT-CON-06 — Revoked → reactivate
  // ---------------------------------------------------------------------------

  describe('CT-ENT-CON-06 — existing revoked', () => {
    it('given revoked existing and incoming with finite ends_at when consolidate then action is reactivate with new params', () => {
      const existing = makeExisting({ status: 'revoked', endsAt: new Date('2025-01-01T00:00:00Z') });
      const incoming = makeIncoming({ endsAt: new Date('2027-01-01T00:00:00Z') });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('reactivate');
      expect(result.reason).toBe('reactivate_after_revoke');
      if (result.action === 'reactivate') {
        expect(result.next.status).toBe('active');
        expect(result.next.endsAt).toEqual(new Date('2027-01-01T00:00:00Z'));
        expect(result.next.startedAt).toEqual(incoming.startedAt);
        expect(result.next.quantity).toBe(incoming.quantity);
        expect(result.next.accessRule).toEqual(incoming.accessRule);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Expired → reactivate
  // ---------------------------------------------------------------------------

  describe('Expired → reactivate', () => {
    it('given expired existing and incoming with perpetuous when consolidate then action is reactivate with reason reactivate_after_expiry', () => {
      const existing = makeExisting({ status: 'expired', endsAt: new Date('2025-06-01T00:00:00Z') });
      const incoming = makeIncoming({ endsAt: null });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('reactivate');
      expect(result.reason).toBe('reactivate_after_expiry');
      if (result.action === 'reactivate') {
        expect(result.next.status).toBe('active');
        expect(result.next.endsAt).toBeNull();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // CT-ENT-CON-09 — access_rule incoming overwrites
  // ---------------------------------------------------------------------------

  describe('CT-ENT-CON-09 — access_rule incoming sobrescreve', () => {
    it('given existing with access_rule drip:true and incoming with access_rule drip:false when extend_expiration then next.accessRule is incoming rule', () => {
      const existing = makeExisting({
        endsAt: new Date('2026-06-01T00:00:00Z'),
        accessRule: { drip: true },
      });
      const incoming = makeIncoming({
        endsAt: new Date('2027-06-01T00:00:00Z'),
        accessRule: { drip: false },
      });

      const result = consolidate(existing, incoming);

      expect(result.action).toBe('extend_expiration');
      if (result.action === 'extend_expiration') {
        expect(result.next.accessRule).toEqual({ drip: false });
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Suspended → treated as active for merge
  // ---------------------------------------------------------------------------

  describe('Suspended — treated as active for merge', () => {
    it('given suspended finite existing and perpetuous incoming when consolidate then promotes perpetuous but keeps status suspended', () => {
      const existing = makeExisting({
        status: 'suspended',
        endsAt: new Date('2026-12-31T00:00:00Z'),
      });
      const incoming = makeIncoming({ endsAt: null });

      const result = consolidate(existing, incoming);

      // BR-ENTITLEMENT-CONSOLIDATION: suspended trata como active para merge
      // mas mantém status='suspended' no resultado
      expect(result.action).toBe('promote_perpetuous');
      if (result.action === 'promote_perpetuous') {
        expect(result.next.endsAt).toBeNull();
        expect(result.next.status).toBe('suspended');
      }
    });
  });
});
