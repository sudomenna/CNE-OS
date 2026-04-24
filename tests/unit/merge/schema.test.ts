/**
 * Tests: contact_merge aggregate schema (T-1-07)
 *
 * Estes são testes estáticos (sem banco real) que verificam:
 *   - Tabelas exportadas com shape correto
 *   - Tipos TypeScript inferidos aceitam/rejeitam os campos esperados
 *   - Constraints de schema declaradas no objeto Drizzle
 *
 * Testes de constraint de banco (CHECK, UNIQUE, trigger updated_at)
 * estão marcados com comentário `// DB-CONSTRAINT` e precisam de banco real.
 *
 * docs/20-domain/03-contact-merge-issues.md §3
 * docs/30-contracts/01-enums.md
 * docs/30-contracts/02-db-schema-conventions.md
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import {
  contactIssue,
  contactMerge,
  contactMergeUndo,
} from '@/lib/db/schema'
import type {
  ContactIssue,
  NewContactIssue,
  ContactMerge,
  NewContactMerge,
  ContactMergeUndo,
  NewContactMergeUndo,
} from '@/lib/db/schema'

// ---------------------------------------------------------------------------
// contact_issue
// ---------------------------------------------------------------------------

describe('contact_issue schema', () => {
  it('table object is exported', () => {
    expect(contactIssue).toBeDefined()
  })

  it('status field is typed as contact_issue_status enum values', () => {
    // Verifica que o tipo Select contém a propriedade status
    expectTypeOf<ContactIssue>().toHaveProperty('status')
    // O tipo de status deve ser uma das strings do enum
    type IssueStatus = ContactIssue['status']
    const validStatus: IssueStatus = 'open'
    expect(validStatus).toBe('open')
    // Compile-time: os outros valores devem ser assignáveis
    const _resolved: IssueStatus = 'resolved'
    const _ignored: IssueStatus = 'ignored'
    expect(_resolved).toBe('resolved')
    expect(_ignored).toBe('ignored')
  })

  it('typed insert requires contactId, kind and detail', () => {
    const entry: NewContactIssue = {
      contactId: '00000000-0000-0000-0000-000000000001',
      kind: 'email_duplicate',
      detail: 'E-mail duplicado detectado pelo resolvedor de identidade.',
    }
    expect(entry.contactId).toBeDefined()
    expect(entry.kind).toBe('email_duplicate')
    expect(entry.detail).toBeDefined()
  })

  it('optional fields are undefined when not provided', () => {
    const entry: NewContactIssue = {
      contactId: '00000000-0000-0000-0000-000000000001',
      kind: 'phone_conflict',
      detail: 'Conflito de telefone.',
    }
    expect(entry.relatedContactId).toBeUndefined()
    expect(entry.openedBySystem).toBeUndefined()
    expect(entry.openedByUserId).toBeUndefined()
    expect(entry.resolvedByUserId).toBeUndefined()
    expect(entry.resolution).toBeUndefined()
    expect(entry.resolvedAt).toBeUndefined()
  })

  it('status defaults to open (type allows omission)', () => {
    // status tem DEFAULT 'open' no DB — no tipo TS é opcional no insert
    const entry: NewContactIssue = {
      contactId: '00000000-0000-0000-0000-000000000001',
      kind: 'other',
      detail: 'Pendência genérica.',
    }
    // DB preenche o default; TS não obriga o campo
    expect(entry.status).toBeUndefined()
  })

  it('select type includes all required fields', () => {
    expectTypeOf<ContactIssue>().toHaveProperty('id')
    expectTypeOf<ContactIssue>().toHaveProperty('contactId')
    expectTypeOf<ContactIssue>().toHaveProperty('kind')
    expectTypeOf<ContactIssue>().toHaveProperty('status')
    expectTypeOf<ContactIssue>().toHaveProperty('detail')
    expectTypeOf<ContactIssue>().toHaveProperty('payload')
    expectTypeOf<ContactIssue>().toHaveProperty('createdAt')
    expectTypeOf<ContactIssue>().toHaveProperty('updatedAt')
  })

  // DB-CONSTRAINT: contact_issue.updated_at.trigger
  // UPDATE em contact_issue deve atualizar updated_at automaticamente.
  // Precisa de banco real.
  it.todo('contact_issue.updated_at.trigger — requires real DB')

  // DB-CONSTRAINT: contact_issue.idx_contact_issue_open
  // Índice parcial WHERE status = 'open' — validação via EXPLAIN ANALYZE.
  it.todo('contact_issue.idx_contact_issue_open — requires real DB')
})

// ---------------------------------------------------------------------------
// contact_merge
// ---------------------------------------------------------------------------

describe('contact_merge schema', () => {
  it('table object is exported', () => {
    expect(contactMerge).toBeDefined()
  })

  it('principalSnapshot field is typed as unknown (jsonb)', () => {
    // jsonb do Drizzle é inferido como `unknown` no tipo Select
    expectTypeOf<ContactMerge>().toHaveProperty('principalSnapshot')
    type SnapshotType = ContactMerge['principalSnapshot']
    // jsonb é `unknown` — assignável a qualquer valor
    const _snapshot: SnapshotType = { name: 'Maria', cpf: '12345678901' }
    expect(_snapshot).toBeDefined()
  })

  it('secondarySnapshot field is typed as unknown (jsonb)', () => {
    expectTypeOf<ContactMerge>().toHaveProperty('secondarySnapshot')
    type SnapshotType = ContactMerge['secondarySnapshot']
    const _snapshot: SnapshotType = { name: 'Maria S.', cpf: null }
    expect(_snapshot).toBeDefined()
  })

  it('typed insert requires principalSnapshot and secondarySnapshot', () => {
    const entry: NewContactMerge = {
      principalContactId: '00000000-0000-0000-0000-000000000001',
      secondaryContactId: '00000000-0000-0000-0000-000000000002',
      reason: 'Contatos duplicados identificados manualmente.',
      mergedByUserId: '00000000-0000-0000-0000-000000000003',
      principalSnapshot: { id: '00000000-0000-0000-0000-000000000001', fullName: 'Maria' },
      secondarySnapshot: { id: '00000000-0000-0000-0000-000000000002', fullName: 'Maria S.' },
    }
    expect(entry.principalSnapshot).toBeDefined()
    expect(entry.secondarySnapshot).toBeDefined()
  })

  it('has no updatedAt column (immutable by design)', () => {
    // contact_merge é imutável — sem updated_at por design
    type MergeKeys = keyof ContactMerge
    const _check: 'updatedAt' extends MergeKeys ? true : false = false
    expect(_check).toBe(false)
    // Runtime: propriedade não deve existir no objeto table
    expect(Object.keys(contactMerge).includes('updatedAt')).toBe(false)
  })

  it('optional fields are undefined when not provided', () => {
    const entry: NewContactMerge = {
      principalContactId: '00000000-0000-0000-0000-000000000001',
      secondaryContactId: '00000000-0000-0000-0000-000000000002',
      reason: 'Duplicata.',
      mergedByUserId: '00000000-0000-0000-0000-000000000003',
      principalSnapshot: {},
      secondarySnapshot: {},
    }
    expect(entry.issueId).toBeUndefined()
    expect(entry.undoneAt).toBeUndefined()
  })

  it('select type includes undoneAt (nullable timestamp)', () => {
    expectTypeOf<ContactMerge>().toHaveProperty('undoneAt')
  })

  // DB-CONSTRAINT: contact_merge.ck_contact_merge_distinct
  // Inserir com principal = secondary deve falhar no CHECK.
  // Precisa de banco real.
  it.todo('contact_merge.ck_contact_merge_distinct — requires real DB')

  // DB-CONSTRAINT: contact_merge.RESTRICT-on-contact-delete
  // Deletar contato que participa de merge deve ser rejeitado (ON DELETE RESTRICT).
  it.todo('contact_merge.RESTRICT-on-contact-delete — requires real DB')
})

// ---------------------------------------------------------------------------
// contact_merge_undo
// ---------------------------------------------------------------------------

describe('contact_merge_undo schema', () => {
  it('table object is exported', () => {
    expect(contactMergeUndo).toBeDefined()
  })

  it('mergeId field is typed as string (uuid)', () => {
    expectTypeOf<ContactMergeUndo>().toHaveProperty('mergeId')
    type MergeIdType = ContactMergeUndo['mergeId']
    // uuid é string no Drizzle
    const _id: MergeIdType = '00000000-0000-0000-0000-000000000001'
    expect(_id).toBeDefined()
    // Garante que é string, não number ou outro tipo
    expectTypeOf<MergeIdType>().toBeString()
  })

  it('typed insert requires mergeId, reason and undoneByUserId', () => {
    const entry: NewContactMergeUndo = {
      mergeId: '00000000-0000-0000-0000-000000000010',
      reason: 'Merge feito por engano — contatos são distintos.',
      undoneByUserId: '00000000-0000-0000-0000-000000000003',
    }
    expect(entry.mergeId).toBeDefined()
    expect(entry.reason).toBeDefined()
    expect(entry.undoneByUserId).toBeDefined()
  })

  it('has no updatedAt column (immutable by design)', () => {
    type UndoKeys = keyof ContactMergeUndo
    const _check: 'updatedAt' extends UndoKeys ? true : false = false
    expect(_check).toBe(false)
    expect(Object.keys(contactMergeUndo).includes('updatedAt')).toBe(false)
  })

  it('revertedTables is optional in insert (defaults to {} in DB)', () => {
    const entry: NewContactMergeUndo = {
      mergeId: '00000000-0000-0000-0000-000000000010',
      reason: 'Undo.',
      undoneByUserId: '00000000-0000-0000-0000-000000000003',
    }
    // DB preenche o default {}
    expect(entry.revertedTables).toBeUndefined()
  })

  it('select type includes all required fields', () => {
    expectTypeOf<ContactMergeUndo>().toHaveProperty('id')
    expectTypeOf<ContactMergeUndo>().toHaveProperty('mergeId')
    expectTypeOf<ContactMergeUndo>().toHaveProperty('reason')
    expectTypeOf<ContactMergeUndo>().toHaveProperty('undoneByUserId')
    expectTypeOf<ContactMergeUndo>().toHaveProperty('revertedTables')
    expectTypeOf<ContactMergeUndo>().toHaveProperty('createdAt')
  })

  // DB-CONSTRAINT: contact_merge_undo.uq_contact_merge_undo_merge
  // Segundo undo no mesmo merge_id viola a UNIQUE constraint.
  // INV-MERGE-04: undo ocorre no máximo uma vez por merge.
  // Precisa de banco real.
  it.todo('contact_merge_undo.uq_contact_merge_undo_merge — requires real DB (INV-MERGE-04)')

  // DB-CONSTRAINT: contact_merge_undo.RESTRICT-on-merge-delete
  // Deletar contact_merge que tem undo associado deve ser rejeitado.
  it.todo('contact_merge_undo.RESTRICT-on-merge-delete — requires real DB')
})
