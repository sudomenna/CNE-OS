/**
 * Testes unitários — resolveContactIdentity
 * BR-IDENTITY: tabela de decisão completa (casos #1–#9 + rejeição)
 *
 * Estratégia: mockar @/lib/db/client para que as queries Drizzle retornem
 * dados controlados. O mock intercepta a chain .select().from()[.innerJoin()].where().limit()
 * e retorna sequencialmente os valores configurados antes de cada teste.
 *
 * A implementação executa os lookups SEQUENCIALMENTE (CPF → phone → email),
 * então a ordem dos resultados no array de setup é determinística:
 *   [findByCpf, findByPhone, findByEmail]
 * Cada lookup faz exatamente UMA query (com innerJoin onde necessário).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures de contatos
// ---------------------------------------------------------------------------

const C1 = {
  id: 'c1-uuid-0000-0000-0000000000c1',
  fullName: 'Contato Um',
  cpf: '22222222222',
  status: 'active' as const,
  classification: 'lead' as const,
  birthDate: null,
  origin: 'checkout',
  mergedIntoId: null,
  notesSummary: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

const C2 = {
  id: 'c2-uuid-0000-0000-0000000000c2',
  fullName: 'Contato Dois',
  cpf: null,
  status: 'active' as const,
  classification: 'lead' as const,
  birthDate: null,
  origin: 'import',
  mergedIntoId: null,
  notesSummary: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

// ---------------------------------------------------------------------------
// Mock de @/lib/db/client
//
// Chain Drizzle suportada: select() → from() → [innerJoin()] → where() → limit()
// Cada chamada a limit() consome uma entrada de queryResults em ordem (queryIndex).
//
// A implementação faz os lookups SEQUENCIALMENTE:
//   1. findByCpf  → 1 query
//   2. findByPhone → 1 query (com innerJoin)
//   3. findByEmail → 1 query (com innerJoin)
//
// Portanto, queryResults[0] = resultado findByCpf,
//           queryResults[1] = resultado findByPhone,
//           queryResults[2] = resultado findByEmail.
// (Quando CPF é null, findByCpf é omitido, índices deslocam.)
// ---------------------------------------------------------------------------

const queryResults: Array<Record<string, unknown>[]> = []
let queryIndex = 0

vi.mock('@/lib/db/client', () => {
  const limit = vi.fn(() => {
    const rows = queryResults[queryIndex] ?? []
    queryIndex++
    return Promise.resolve(rows)
  })
  const where = vi.fn(() => ({ limit }))
  const innerJoin = vi.fn(() => ({ innerJoin, where, limit }))
  const from = vi.fn(() => ({ innerJoin, where, limit }))
  const select = vi.fn(() => ({ from }))

  return {
    db: { select },
    DbTx: undefined,
  }
})

// Import AFTER mock is declared (vi.mock é hoisted, mas o import ESM dinâmico
// garante que o módulo é carregado com o mock já ativo)
const { resolveContactIdentity } = await import('../../../lib/domain/contact/resolve-identity')
const { InvalidCpfError } = await import('../../../lib/domain/contact/normalize')

// ---------------------------------------------------------------------------
// Helper: configura respostas sequenciais para o próximo teste
// ---------------------------------------------------------------------------

function setupQueries(responses: Array<Record<string, unknown>[]>) {
  queryResults.length = 0
  for (const r of responses) queryResults.push(r)
  queryIndex = 0
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-IDENTITY — resolveContactIdentity', () => {
  beforeEach(() => {
    queryResults.length = 0
    queryIndex = 0
    vi.clearAllMocks()
  })

  // ── Caso #1 — CPF novo → create ───────────────────────────────────────────

  describe('caso #1 — create-por-cpf-novo', () => {
    it(
      'given nenhum contato com CPF 11111111111 ' +
        'when resolveContactIdentity com CPF novo ' +
        'then retorna action=create, issues=[]',
      async () => {
        setupQueries([
          [],  // findByCpf → sem match (CPF novo)
          [],  // findByPhone → sem match
          [],  // findByEmail → sem match
        ])

        const result = await resolveContactIdentity({
          cpf: '11111111111',
          phoneE164: '+5511900000001',
          email: 'a@x.com',
          origin: 'checkout',
        })

        expect(result.action).toBe('create')
        expect(result.issues).toHaveLength(0)
      },
    )
  })

  // ── Caso #2 — CPF + tel + email batem em C1 → noop ───────────────────────

  describe('caso #2 — noop-tudo-bate', () => {
    it(
      'given C1 com cpf=22222222222, tel=+5511900000002, email=b@x.com ' +
        'when resolveContactIdentity com os mesmos dados ' +
        'then retorna action=noop, contactId=C1.id, issues=[]',
      async () => {
        setupQueries([
          [C1],  // findByCpf → C1
          [C1],  // findByPhone (join) → C1
          [C1],  // findByEmail (join) → C1
        ])

        const result = await resolveContactIdentity({
          cpf: '22222222222',
          phoneE164: '+5511900000002',
          email: 'b@x.com',
          origin: 'checkout',
        })

        expect(result.action).toBe('noop')
        expect(result.contactId).toBe(C1.id)
        expect(result.issues).toHaveLength(0)
      },
    )
  })

  // ── Caso #3 sem colisão — add_alternative_email + source_divergence ───────

  describe('caso #3 — update-email-alternativo-sem-colisao', () => {
    it(
      'given C1 bate por CPF + telefone; novo@x.com não pertence a ninguém ' +
        'when resolveContactIdentity com email novo@x.com ' +
        'then action=update, applied=[add_alternative_email], issues=[source_divergence]',
      async () => {
        setupQueries([
          [C1],  // findByCpf → C1
          [C1],  // findByPhone (join) → C1
          [],    // findByEmail (join) → e-mail não existe em nenhum contato
        ])

        const result = await resolveContactIdentity({
          cpf: '22222222222',
          phoneE164: '+5511900000002',
          email: 'novo@x.com',
          origin: 'import',
        })

        expect(result.action).toBe('update')
        expect(result.contactId).toBe(C1.id)
        if (result.action === 'update') {
          expect(result.applied).toContainEqual({
            field: 'add_alternative_email',
            value: 'novo@x.com',
          })
          expect(result.issues).toHaveLength(1)
          const issue = result.issues.at(0)
          expect(issue).toBeDefined()
          expect(issue?.kind).toBe('source_divergence')
        }
      },
    )
  })

  // ── Caso #3 com colisão — email_duplicate apontando para C2 ──────────────

  describe('caso #3 — update-email-duplicado-colisao', () => {
    it(
      'given C1 bate por CPF+telefone; novo@x.com já é de C2 ' +
        'when resolveContactIdentity ' +
        'then issues[0].kind=email_duplicate, relatedContactId=C2.id',
      async () => {
        setupQueries([
          [C1],  // findByCpf → C1
          [C1],  // findByPhone (join) → C1
          [C2],  // findByEmail (join) → C2 (e-mail pertence a outro contato)
        ])

        const result = await resolveContactIdentity({
          cpf: '22222222222',
          phoneE164: '+5511900000002',
          email: 'novo@x.com',
          origin: 'checkout',
        })

        expect(result.action).toBe('update')
        expect(result.issues).toHaveLength(1)
        const issue = result.issues.at(0)
        expect(issue).toBeDefined()
        expect(issue?.kind).toBe('email_duplicate')
        expect(issue?.relatedContactId).toBe(C2.id)
      },
    )
  })

  // ── Caso #4 — CPF+email batem C1; telefone diferente → phone_conflict ─────

  describe('caso #4 — update-telefone-conflict', () => {
    it(
      'given C1 bate por CPF+email; telefone diferente e livre no sistema ' +
        'when resolveContactIdentity com origin=checkout ' +
        'then action=update, applied=[promote_new_primary_phone], issues=[phone_conflict]',
      async () => {
        setupQueries([
          [C1],  // findByCpf → C1
          [],    // findByPhone (join) → telefone livre (sem match)
          [C1],  // findByEmail (join) → C1
        ])

        const result = await resolveContactIdentity({
          cpf: '22222222222',
          phoneE164: '+5511999999999',
          email: 'b@x.com',
          origin: 'checkout',
        })

        expect(result.action).toBe('update')
        expect(result.contactId).toBe(C1.id)
        if (result.action === 'update') {
          const phoneChange = result.applied.find(
            (a) => a.field === 'promote_new_primary_phone',
          )
          expect(phoneChange).toBeDefined()
          expect(result.issues).toHaveLength(1)
          const issue = result.issues.at(0)
          expect(issue).toBeDefined()
          expect(issue?.kind).toBe('phone_conflict')
        }
      },
    )
  })

  // ── Caso #8 (crítico) — sem CPF, telefone novo, email duplicado → create ──

  describe('caso #8 — novo-contato-sem-cpf-email-duplicado', () => {
    it(
      'given C1 tem email=c@x.com; input traz telefone +5511900000099 + email c@x.com, sem CPF ' +
        'when resolveContactIdentity ' +
        'then action=create, issues=[email_duplicate com relatedContactId=C1.id]',
      async () => {
        setupQueries([
          // findByCpf é omitido (sem CPF)
          [],    // findByPhone (join) → telefone livre
          [C1],  // findByEmail (join) → e-mail pertence a C1
        ])

        const result = await resolveContactIdentity({
          phoneE164: '+5511900000099',
          email: 'c@x.com',
          origin: 'message',
        })

        expect(result.action).toBe('create')
        expect(result.issues).toHaveLength(1)
        const issue = result.issues.at(0)
        expect(issue).toBeDefined()
        expect(issue?.kind).toBe('email_duplicate')
        expect(issue?.relatedContactId).toBe(C1.id)
      },
    )
  })

  // ── Caso #9 — nada bate → create simples ─────────────────────────────────

  describe('caso #9 — novo-sem-nada-bate', () => {
    it(
      'given telefone +5511900000050 e email z@x.com não existem ' +
        'when resolveContactIdentity sem CPF ' +
        'then action=create, issues=[]',
      async () => {
        setupQueries([
          // findByCpf é omitido (sem CPF)
          [],  // findByPhone → sem match
          [],  // findByEmail → sem match
        ])

        const result = await resolveContactIdentity({
          phoneE164: '+5511900000050',
          email: 'z@x.com',
          origin: 'import',
        })

        expect(result.action).toBe('create')
        expect(result.issues).toHaveLength(0)
      },
    )
  })

  // ── Rejeita CPF inválido — falha antes de qualquer query ─────────────────

  describe('rejeita-cpf-invalido', () => {
    it(
      'given input com cpf=123 ' +
        'when resolveContactIdentity chamado ' +
        'then lança InvalidCpfError antes de qualquer query',
      async () => {
        setupQueries([])  // nenhuma query deve ser feita

        await expect(
          resolveContactIdentity({
            cpf: '123',
            origin: 'checkout',
          }),
        ).rejects.toThrow(InvalidCpfError)

        // Garantir que nenhuma query foi executada
        expect(queryIndex).toBe(0)
      },
    )
  })

  // ── Caso #6 — sem CPF; telefone + email batem em C1 → noop ───────────────

  describe('caso #6 — noop-sem-cpf-telefone-e-email-batem', () => {
    it(
      'given sem CPF; telefone e email batem em C1 ' +
        'when resolveContactIdentity ' +
        'then action=noop, contactId=C1.id, issues=[]',
      async () => {
        setupQueries([
          // findByCpf é omitido (sem CPF)
          [C1],  // findByPhone (join) → C1
          [C1],  // findByEmail (join) → C1
        ])

        const result = await resolveContactIdentity({
          phoneE164: '+5511900000002',
          email: 'b@x.com',
          origin: 'integration',
        })

        expect(result.action).toBe('noop')
        expect(result.contactId).toBe(C1.id)
        expect(result.issues).toHaveLength(0)
      },
    )
  })

  // ── Caso #7 — sem CPF; telefone bate C1; email diferente e livre ──────────

  describe('caso #7 — update-sem-cpf-telefone-bate-email-livre', () => {
    it(
      'given sem CPF; telefone bate em C1; email diferente e livre ' +
        'when resolveContactIdentity ' +
        'then action=update, applied=[add_alternative_email], issues=[]',
      async () => {
        setupQueries([
          // findByCpf é omitido (sem CPF)
          [C1],  // findByPhone (join) → C1
          [],    // findByEmail (join) → email livre (sem match)
        ])

        const result = await resolveContactIdentity({
          phoneE164: '+5511900000002',
          email: 'outro@x.com',
          origin: 'message',
        })

        expect(result.action).toBe('update')
        expect(result.contactId).toBe(C1.id)
        if (result.action === 'update') {
          expect(result.applied).toContainEqual({
            field: 'add_alternative_email',
            value: 'outro@x.com',
          })
          expect(result.issues).toHaveLength(0)
        }
      },
    )
  })
})
