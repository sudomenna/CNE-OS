/**
 * Tests: RBAC can() + requirePermission() — T-0-09
 *
 * Spec: docs/50-business-rules/BR-RBAC.md
 * Spec: docs/10-architecture/06-auth-rbac-audit.md §2.2 e §8
 *
 * Testes são unitários e puros: can() não tem I/O, requirePermission() recebe
 * SessionContext injetado — sem acesso a DB ou rede.
 */
import { describe, it, expect } from 'vitest'
import { can, RBAC_MATRIX } from '@/lib/auth/rbac/matrix'
import { requirePermission } from '@/lib/auth/permissions'
import { ActionError } from '@/lib/actions/errors'
import type { Action, Resource, Role } from '@/lib/auth/rbac/types'
import type { SessionContext } from '@/lib/auth/session'

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

function makeUser(role: Role, opts: { has2fa?: boolean; twoFactorRecentlyVerified?: boolean } = {}) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    role,
    has2fa: opts.has2fa ?? false,
    twoFactorRecentlyVerified: opts.twoFactorRecentlyVerified ?? false,
  }
}

function makeCtx(role: Role, opts: { has2fa?: boolean; twoFactorRecentlyVerified?: boolean } = {}): SessionContext {
  return {
    user: makeUser(role, opts),
    impersonatingContactId: null,
    ip: null,
    userAgent: null,
    correlationId: 'test-correlation-id',
  }
}

const GLOBAL: Resource = { kind: 'global' }

// ---------------------------------------------------------------------------
// CT-RBAC-01 — Financial não cria oferta
// ---------------------------------------------------------------------------

describe('BR-RBAC CT-RBAC-01: financial não cria oferta', () => {
  it('given financial com 2FA verified when offer.write then returns false', () => {
    const user = makeUser('financial', { has2fa: true, twoFactorRecentlyVerified: true })
    const result = can(user, 'offer.write', GLOBAL)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CT-RBAC-02 — Marketing não aprova reembolso
// ---------------------------------------------------------------------------

describe('BR-RBAC CT-RBAC-02: marketing não aprova reembolso', () => {
  it('given marketing when refund.approve then returns false', () => {
    const user = makeUser('marketing', { has2fa: true, twoFactorRecentlyVerified: true })
    const result = can(user, 'refund.approve', { kind: 'transaction', id: 'T1' })
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CT-RBAC-03 — Admin pode tudo com 2FA verified
// ---------------------------------------------------------------------------

describe('BR-RBAC CT-RBAC-03: admin pode todas as ações com 2FA', () => {
  it('given admin com 2FA verified when any action then returns true', () => {
    const user = makeUser('admin', { has2fa: true, twoFactorRecentlyVerified: true })
    const allActions = Object.keys(RBAC_MATRIX) as Action[]
    for (const action of allActions) {
      expect(can(user, action, GLOBAL), `action: ${action}`).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// CT-RBAC-04 — 2FA ausente bloqueia ação crítica mesmo para admin
// ---------------------------------------------------------------------------

describe('BR-RBAC CT-RBAC-04: 2FA ausente bloqueia ação crítica', () => {
  it('given admin com twoFactorRecentlyVerified=false when refund.approve then returns false', () => {
    const user = makeUser('admin', { has2fa: true, twoFactorRecentlyVerified: false })
    const result = can(user, 'refund.approve', GLOBAL)
    expect(result).toBe(false)
  })

  it('given admin sem has2fa when refund.approve then returns false', () => {
    const user = makeUser('admin', { has2fa: false, twoFactorRecentlyVerified: false })
    const result = can(user, 'refund.approve', GLOBAL)
    expect(result).toBe(false)
  })

  it('given admin sem 2FA when offer.write then returns false', () => {
    const user = makeUser('admin', { has2fa: false, twoFactorRecentlyVerified: false })
    expect(can(user, 'offer.write', GLOBAL)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CT-RBAC-05 — Suporte responde inbox (sem 2FA exigido)
// ---------------------------------------------------------------------------

describe('BR-RBAC CT-RBAC-05: suporte responde inbox', () => {
  it('given support sem 2FA when inbox.reply then returns true', () => {
    const user = makeUser('support', { has2fa: false, twoFactorRecentlyVerified: false })
    const result = can(user, 'inbox.reply', GLOBAL)
    expect(result).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// CT-RBAC-06 — Comercial cria oferta com 2FA; sem 2FA é bloqueado
// ---------------------------------------------------------------------------

describe('BR-RBAC CT-RBAC-06: commercial cria oferta com 2FA', () => {
  it('given commercial com 2FA verified when offer.write then returns true', () => {
    const user = makeUser('commercial', { has2fa: true, twoFactorRecentlyVerified: true })
    expect(can(user, 'offer.write', { kind: 'offer', id: 'O1' })).toBe(true)
  })

  it('given commercial sem 2FA fresh when offer.write then returns false', () => {
    const user = makeUser('commercial', { has2fa: true, twoFactorRecentlyVerified: false })
    expect(can(user, 'offer.write', { kind: 'offer', id: 'O1' })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CT-AUTH-07 — can() retorna false para ação inexistente
// ---------------------------------------------------------------------------

describe('BR-RBAC CT-AUTH-07: can() retorna false para ação inexistente', () => {
  it('given any user when nonexistent action then returns false', () => {
    const user = makeUser('admin', { has2fa: true, twoFactorRecentlyVerified: true })
    const result = can(user, 'nonexistent.action' as Action, GLOBAL)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// requirePermission — lança ActionError quando negado
// ---------------------------------------------------------------------------

describe('BR-RBAC requirePermission lança ActionError quando negado', () => {
  it('given marketing when refund.approve then lança ActionError UNAUTHORIZED com rule BR-RBAC', async () => {
    const ctx = makeCtx('marketing', { has2fa: true, twoFactorRecentlyVerified: true })
    await expect(
      requirePermission(ctx, 'refund.approve', GLOBAL),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      meta: { rule: 'BR-RBAC' },
    })
  })

  it('given marketing when refund.approve then lança instância de ActionError', async () => {
    const ctx = makeCtx('marketing', { has2fa: true, twoFactorRecentlyVerified: true })
    await expect(requirePermission(ctx, 'refund.approve', GLOBAL)).rejects.toBeInstanceOf(ActionError)
  })

  it('given admin sem 2FA when integration.configure then lança ActionError', async () => {
    const ctx = makeCtx('admin', { has2fa: false, twoFactorRecentlyVerified: false })
    await expect(
      requirePermission(ctx, 'integration.configure', GLOBAL),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      meta: { rule: 'BR-RBAC' },
    })
  })
})

// ---------------------------------------------------------------------------
// requirePermission — não lança quando autorizado
// ---------------------------------------------------------------------------

describe('BR-RBAC requirePermission não lança quando autorizado', () => {
  it('given admin com 2FA when refund.approve then resolve sem erro', async () => {
    const ctx = makeCtx('admin', { has2fa: true, twoFactorRecentlyVerified: true })
    await expect(requirePermission(ctx, 'refund.approve', GLOBAL)).resolves.toBeUndefined()
  })

  it('given support when inbox.reply then resolve sem erro', async () => {
    const ctx = makeCtx('support')
    await expect(requirePermission(ctx, 'inbox.reply', GLOBAL)).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Cobertura adicional de matrix — todos os papéis das ações não-2FA
// ---------------------------------------------------------------------------

describe('BR-RBAC ações sem exigência de 2FA são acessíveis sem 2FA', () => {
  const cases: Array<{ role: Role; action: Action }> = [
    { role: 'financial', action: 'billing.view' },
    { role: 'marketing', action: 'offer.condition.write' },
    { role: 'support', action: 'ticket.open' },
    { role: 'commercial', action: 'campaign.write' },
    { role: 'marketing', action: 'creative.write' },
    { role: 'commercial', action: 'funnel.write' },
    { role: 'financial', action: 'contact.merge' },
    { role: 'financial', action: 'ticket.cancel' },
  ]

  for (const { role, action } of cases) {
    it(`given ${role} sem 2FA when ${action} then returns true`, () => {
      const user = makeUser(role, { has2fa: false, twoFactorRecentlyVerified: false })
      expect(can(user, action, GLOBAL)).toBe(true)
    })
  }
})
