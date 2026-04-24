/**
 * Tests: contact aggregate schema (T-1-01 → T-1-05)
 *
 * Estes são testes estáticos (sem banco real) que verificam:
 *   - Tabelas e enums exportados com shape correto
 *   - Tipos TypeScript inferidos aceitam/rejeitam os campos esperados
 *   - Valores canônicos de enum estão presentes
 *
 * Testes de constraint de banco (CHECK, UNIQUE parcial, trigger append-only)
 * estão marcados com comentário `// DB-CONSTRAINT` e precisam de banco real
 * (integration test com Vitest + conexão Postgres). Ver:
 *   tests/integration/schema/contact.test.ts (a implementar em T-1-06)
 *
 * docs/20-domain/02-contact-identity.md §3
 * docs/30-contracts/01-enums.md
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  contact,
  contactPhone,
  contactEmail,
  contactDocument,
  contactTag,
  contactCustomField,
  contactNote,
  contactStatusHistory,
  contactStatusEnum,
  contactPhoneStatusEnum,
  contactEmailStatusEnum,
  contactClassificationEnum,
  contactIssueKindEnum,
  contactIssueStatusEnum,
} from '@/lib/db/schema'
import type {
  Contact,
  NewContact,
  ContactPhone,
  NewContactPhone,
  ContactEmail,
  NewContactEmail,
  NewContactDocument,
  NewContactTag,
  NewContactCustomField,
  ContactNote,
  NewContactNote,
  ContactStatusHistory,
  NewContactStatusHistory,
} from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// T-1-01: contact
// ---------------------------------------------------------------------------

describe('contact schema', () => {
  it('table object is exported', () => {
    expect(contact).toBeDefined()
  })

  it('contactStatusEnum has all 4 canonical values', () => {
    const values = contactStatusEnum.enumValues
    expect(values).toContain('active')
    expect(values).toContain('inactive')
    expect(values).toContain('invalid')
    expect(values).toContain('blocked')
    expect(values).toHaveLength(4)
  })

  it('contactClassificationEnum has all 4 canonical values', () => {
    const values = contactClassificationEnum.enumValues
    expect(values).toContain('lead')
    expect(values).toContain('customer')
    expect(values).toContain('student')
    expect(values).toContain('paid_lead')
    expect(values).toHaveLength(4)
  })

  it('typed insert requires only full_name', () => {
    const entry: NewContact = { fullName: 'Maria Oliveira' }
    expect(entry.fullName).toBe('Maria Oliveira')
  })

  it('cpf, origin, mergedIntoId are optional in NewContact', () => {
    const entry: NewContact = { fullName: 'Maria Oliveira' }
    expect(entry.cpf).toBeUndefined()
    expect(entry.origin).toBeUndefined()
    expect(entry.mergedIntoId).toBeUndefined()
  })

  it('select type includes all required fields', () => {
    expectTypeOf<Contact>().toHaveProperty('id')
    expectTypeOf<Contact>().toHaveProperty('fullName')
    expectTypeOf<Contact>().toHaveProperty('status')
    expectTypeOf<Contact>().toHaveProperty('classification')
    expectTypeOf<Contact>().toHaveProperty('createdAt')
    expectTypeOf<Contact>().toHaveProperty('updatedAt')
    expectTypeOf<Contact>().toHaveProperty('deletedAt')
  })

  // DB-CONSTRAINT: contact.cpf.unique-across-live-contacts
  // Dois contatos com mesmo CPF violam uq_contact_cpf (índice parcial).
  // Precisa de banco real — implementar em tests/integration/schema/contact.test.ts
  it.todo('contact.cpf.unique-across-live-contacts — requires real DB')

  // DB-CONSTRAINT: contact.create.rejects-invalid-cpf
  // CPF com 10 dígitos é rejeitado pelo CHECK ck_contact_cpf_length.
  // Precisa de banco real.
  it.todo('contact.create.rejects-invalid-cpf — requires real DB')
})

// ---------------------------------------------------------------------------
// T-1-02: contact_phone
// ---------------------------------------------------------------------------

describe('contact_phone schema', () => {
  it('table object is exported', () => {
    expect(contactPhone).toBeDefined()
  })

  it('contactPhoneStatusEnum has all 5 canonical values', () => {
    const values = contactPhoneStatusEnum.enumValues
    expect(values).toContain('primary')
    expect(values).toContain('secondary')
    expect(values).toContain('whatsapp_valid')
    expect(values).toContain('no_whatsapp')
    expect(values).toContain('invalid')
    expect(values).toHaveLength(5)
  })

  it('typed insert requires contactId and e164', () => {
    const entry: NewContactPhone = {
      contactId: '00000000-0000-0000-0000-000000000001',
      e164: '+5511912345678',
    }
    expect(entry.contactId).toBeDefined()
    expect(entry.e164).toBeDefined()
  })

  it('select type includes whatsappCheckedAt (nullable)', () => {
    expectTypeOf<ContactPhone>().toHaveProperty('whatsappCheckedAt')
  })

  // DB-CONSTRAINT: contact.phone.primary.unique-per-contact
  // Dois phones primary no mesmo contato violam uq_contact_phone_primary.
  it.todo('contact.phone.primary.unique-per-contact — requires real DB')

  // DB-CONSTRAINT: contact.phone.e164.unique-when-active
  // e164 duplicado é permitido se um dos registros tem status 'invalid'.
  it.todo('contact.phone.e164.unique-when-active — requires real DB')
})

// ---------------------------------------------------------------------------
// T-1-03: contact_email
// ---------------------------------------------------------------------------

describe('contact_email schema', () => {
  it('table object is exported', () => {
    expect(contactEmail).toBeDefined()
  })

  it('contactEmailStatusEnum has all 4 canonical values', () => {
    const values = contactEmailStatusEnum.enumValues
    expect(values).toContain('primary')
    expect(values).toContain('alternative')
    expect(values).toContain('invalid')
    expect(values).toContain('unsubscribed')
    expect(values).toHaveLength(4)
  })

  it('typed insert requires contactId and email', () => {
    const entry: NewContactEmail = {
      contactId: '00000000-0000-0000-0000-000000000001',
      email: 'maria@example.com',
    }
    expect(entry.contactId).toBeDefined()
    expect(entry.email).toBeDefined()
  })

  it('select type includes verifiedAt (nullable)', () => {
    expectTypeOf<ContactEmail>().toHaveProperty('verifiedAt')
  })

  // DB-CONSTRAINT: contact.email.primary.unique-per-contact
  it.todo('contact.email.primary.unique-per-contact — requires real DB')
})

// ---------------------------------------------------------------------------
// T-1-04: contact_document, contact_tag, contact_custom_field
// ---------------------------------------------------------------------------

describe('contact_document schema', () => {
  it('table object is exported', () => {
    expect(contactDocument).toBeDefined()
  })

  it('typed insert requires contactId, kind and value', () => {
    const entry: NewContactDocument = {
      contactId: '00000000-0000-0000-0000-000000000001',
      kind: 'rg',
      value: '1234567',
    }
    expect(entry.kind).toBe('rg')
    expect(entry.value).toBe('1234567')
  })

  it('issuer is optional', () => {
    const entry: NewContactDocument = {
      contactId: '00000000-0000-0000-0000-000000000001',
      kind: 'rg',
      value: '1234567',
    }
    expect(entry.issuer).toBeUndefined()
  })
})

describe('contact_tag schema', () => {
  it('table object is exported', () => {
    expect(contactTag).toBeDefined()
  })

  it('typed insert requires contactId and tag', () => {
    const entry: NewContactTag = {
      contactId: '00000000-0000-0000-0000-000000000001',
      tag: 'vip',
    }
    expect(entry.tag).toBe('vip')
  })

  it('source defaults to manual in type inference', () => {
    // source tem default 'manual' no DB; no tipo TS é opcional no insert
    const entry: NewContactTag = {
      contactId: '00000000-0000-0000-0000-000000000001',
      tag: 'premium',
    }
    expect(entry.source).toBeUndefined() // DB preenche o default
  })

  // DB-CONSTRAINT: contact.tag.apply.idempotent
  // Tag duplicada viola uq_contact_tag — INSERT duplicado falha.
  it.todo('contact.tag.apply.idempotent — requires real DB')
})

describe('contact_custom_field schema', () => {
  it('table object is exported', () => {
    expect(contactCustomField).toBeDefined()
  })

  it('typed insert requires contactId and key', () => {
    const entry: NewContactCustomField = {
      contactId: '00000000-0000-0000-0000-000000000001',
      key: 'utm_source',
    }
    expect(entry.key).toBe('utm_source')
  })

  it('brandId is optional (NULL = campo global)', () => {
    const entry: NewContactCustomField = {
      contactId: '00000000-0000-0000-0000-000000000001',
      key: 'global_field',
    }
    expect(entry.brandId).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// T-1-05: contact_note, contact_status_history
// ---------------------------------------------------------------------------

describe('contact_note schema', () => {
  it('table object is exported', () => {
    expect(contactNote).toBeDefined()
  })

  it('typed insert requires contactId, authorUserId and body', () => {
    const entry: NewContactNote = {
      contactId: '00000000-0000-0000-0000-000000000001',
      authorUserId: '00000000-0000-0000-0000-000000000002',
      body: 'Contato interessado em produto X.',
    }
    expect(entry.body).toBeDefined()
    expect(entry.authorUserId).toBeDefined()
  })

  it('select type includes pinned field', () => {
    expectTypeOf<ContactNote>().toHaveProperty('pinned')
  })
})

describe('contact_status_history schema', () => {
  it('table object is exported', () => {
    expect(contactStatusHistory).toBeDefined()
  })

  it('typed insert requires contactId and toStatus', () => {
    const entry: NewContactStatusHistory = {
      contactId: '00000000-0000-0000-0000-000000000001',
      toStatus: 'active',
    }
    expect(entry.toStatus).toBe('active')
  })

  it('has no updatedAt column (append-only by design)', () => {
    // O tipo inferido não deve ter updatedAt — append-only não muta linhas.
    // Verificação compile-time: ContactStatusHistory não expõe updatedAt.
    type HistoryKeys = keyof ContactStatusHistory
    // Se updatedAt existisse, a linha abaixo não compilaria:
    // const _bad: 'updatedAt' extends HistoryKeys ? true : false = false
    const _check: 'updatedAt' extends HistoryKeys ? true : false = false
    expect(_check).toBe(false)
    // Verificação runtime: o objeto Drizzle table não tem propriedade updatedAt
    expect(Object.keys(contactStatusHistory).includes('updatedAt')).toBe(false)
  })

  it('fromStatus and fromClassification are optional (first transition)', () => {
    const entry: NewContactStatusHistory = {
      contactId: '00000000-0000-0000-0000-000000000001',
      toStatus: 'active',
    }
    expect(entry.fromStatus).toBeUndefined()
    expect(entry.fromClassification).toBeUndefined()
  })

  // DB-CONSTRAINT: contact.status.history.append-only
  // UPDATE em contact_status_history é recusado pelo trigger append-only.
  it.todo('contact.status.history.append-only — requires real DB')
})

// ---------------------------------------------------------------------------
// Enums auxiliares (contact_issue_*)
// ---------------------------------------------------------------------------

describe('contact issue enums', () => {
  it('contactIssueKindEnum has all 5 canonical values', () => {
    const values = contactIssueKindEnum.enumValues
    expect(values).toContain('email_duplicate')
    expect(values).toContain('phone_conflict')
    expect(values).toContain('document_mismatch')
    expect(values).toContain('source_divergence')
    expect(values).toContain('other')
    expect(values).toHaveLength(5)
  })

  it('contactIssueStatusEnum has all 3 canonical values', () => {
    const values = contactIssueStatusEnum.enumValues
    expect(values).toContain('open')
    expect(values).toContain('resolved')
    expect(values).toContain('ignored')
    expect(values).toHaveLength(3)
  })
})
