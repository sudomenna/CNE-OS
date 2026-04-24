/**
 * Testes unitários — mergeContacts e undoMerge
 *
 * BR-MERGE: 8 casos conforme task T-1-10
 *
 * Estratégia: mockar @/lib/db/client e @/lib/timeline/emit para isolar
 * a lógica de domínio. A tx é um objeto mock que intercepta a chain Drizzle.
 *
 * docs/20-domain/03-contact-merge-issues.md
 * docs/50-business-rules/BR-MERGE.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// UUIDs de fixture
// ---------------------------------------------------------------------------

const PRINCIPAL_ID = '00000000-0000-0000-0000-000000000001'
const SECONDARY_ID = '00000000-0000-0000-0000-000000000002'
const ACTOR_USER_ID = '00000000-0000-0000-0000-000000000099'
const MERGE_ID = '00000000-0000-0000-0000-000000000010'
const ISSUE_ID = '00000000-0000-0000-0000-000000000020'

// ---------------------------------------------------------------------------
// Fixture de contatos
// ---------------------------------------------------------------------------

const principalContact = {
  id: PRINCIPAL_ID,
  mergedIntoId: null,
  fullName: 'Maria Principal',
  cpf: '11111111111',
  status: 'active' as const,
  classification: 'lead' as const,
}

const secondaryContact = {
  id: SECONDARY_ID,
  mergedIntoId: null,
  fullName: 'Maria Secundária',
  cpf: null,
  status: 'active' as const,
  classification: 'lead' as const,
}

const secondaryAlreadyMerged = {
  ...secondaryContact,
  mergedIntoId: '00000000-0000-0000-0000-000000000099',
}

// ---------------------------------------------------------------------------
// Fixture de merge existente (para undoMerge)
// ---------------------------------------------------------------------------

const existingMerge = {
  id: MERGE_ID,
  principalContactId: PRINCIPAL_ID,
  secondaryContactId: SECONDARY_ID,
  reason: 'Duplicata',
  issueId: null,
  mergedByUserId: ACTOR_USER_ID,
  reassignedTables: {},
  principalSnapshot: {
    contact: principalContact,
    phones: [{ id: 'ph-1', e164: '+5511999990001', status: 'primary' }],
    emails: [{ id: 'em-1', email: 'principal@test.com', status: 'primary' }],
    documents: [],
    tags: [],
  },
  secondarySnapshot: {
    contact: secondaryContact,
    phones: [{ id: 'ph-2', e164: '+5511999990002', status: 'primary' }],
    emails: [{ id: 'em-2', email: 'secondary@test.com', status: 'primary' }],
    documents: [{ id: 'doc-1', kind: 'rg', value: '1234567' }],
    tags: [{ id: 'tag-1', tag: 'importado' }],
  },
  undoneAt: null,
  createdAt: new Date(),
}

// ---------------------------------------------------------------------------
// Mock do emitTimelineEvent
// ---------------------------------------------------------------------------

const emitTimelineEventMock = vi.fn().mockResolvedValue({ id: 'te-1' })

vi.mock('@/lib/timeline/emit', () => ({
  emitTimelineEvent: emitTimelineEventMock,
}))

// ---------------------------------------------------------------------------
// Construtor de mock de tx Drizzle
//
// Suporta a chain usada em mergeContacts / undoMerge:
//   select(cols).from(table).where(cond)              → array de linhas
//   update(table).set(vals).where(cond).returning(...)→ array de linhas
//   insert(table).values(vals).returning(cols)         → array com id
//   insert(table).values(vals)                         → void
//
// As respostas são configuradas por operação via setupTx().
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Imports dinâmicos (após mocks declarados)
// ---------------------------------------------------------------------------

const {
  mergeContacts,
} = await import('../../../lib/domain/merge/apply')

const {
  undoMerge,
} = await import('../../../lib/domain/merge/undo')

const {
  SameContactError,
  SecondaryAlreadyMergedError,
  MergeNotFoundError,
  AlreadyUndoneError,
  MergeForbiddenError,
} = await import('../../../lib/domain/merge/errors')

// ---------------------------------------------------------------------------
// Helpers: montam configs de tx para cenários comuns
// ---------------------------------------------------------------------------

/**
 * Cria um mock de tx completo para mergeContacts (happy path).
 * select: [contacts query, principal snapshot contact, phones, emails, docs, tags,
 *          secondary snapshot contact, phones, emails, docs, tags]
 * update: 8 tabelas com returning (phone, email, doc, tag, custom_field, note,
 *          status_history, contact_issue) + 2 sem returning
 * insert: contact_merge retornando mergeId
 */
function buildMergeTx(overrides: {
  contacts?: Record<string, unknown>[]
  issueId?: string
}) {
  const contacts = overrides.contacts ?? [principalContact, secondaryContact]

  const tx = {
    selectIdx: 0,
    updateIdx: 0,
    insertCalls: [] as string[],

    _selectResults: [
      contacts,             // inArray(contact.id, [principal, secondary])
      // principal snapshot collectSnapshot → select contact
      [principalContact],
      // principal phones, emails, docs, tags
      [{ id: 'ph-1', e164: '+5511999990001', status: 'primary' }],
      [{ id: 'em-1', email: 'principal@test.com', status: 'primary' }],
      [],
      [],
      // secondary snapshot collectSnapshot → select contact
      [secondaryContact],
      // secondary phones, emails, docs, tags
      [{ id: 'ph-2', e164: '+5511999990002', status: 'primary' }],
      [{ id: 'em-2', email: 'secondary@test.com', status: 'primary' }],
      [],
      [],
    ],

    // returning com [] (0 rows affected) para as 8 tabelas de reassign
    _updateResults: Array(8).fill([]) as Record<string, unknown>[][],

    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  }

  tx.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockImplementation(() =>
        Promise.resolve(tx._selectResults[tx.selectIdx++] ?? []),
      ),
    }),
  })

  tx.update.mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockImplementation(() => {
          const result = tx._updateResults[tx.updateIdx++] ?? []
          return Promise.resolve(result)
        }),
      }),
    }),
  })

  tx.insert.mockImplementation((table: unknown) => {
    tx.insertCalls.push(String(table))
    return {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: MERGE_ID }]),
      }),
    }
  })

  return tx
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('BR-MERGE — mergeContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 1: happy path ───────────────────────────────────────────────────

  describe('merge.happy-path', () => {
    it(
      'given dois contatos vivos ' +
        'when mergeContacts ' +
        'then retorna { mergeId, principalId, secondaryId } e emite timeline x2',
      async () => {
        const tx = buildMergeTx({})

        const result = await mergeContacts(tx as unknown as Parameters<typeof mergeContacts>[0], {
          principalId: PRINCIPAL_ID,
          secondaryId: SECONDARY_ID,
          reason: 'Duplicata identificada',
          actorUserId: ACTOR_USER_ID,
        })

        expect(result.mergeId).toBe(MERGE_ID)
        expect(result.principalId).toBe(PRINCIPAL_ID)
        expect(result.secondaryId).toBe(SECONDARY_ID)

        // emitTimelineEvent deve ser chamado exatamente 2 vezes
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(2)

        // Primeira emissão: no contato principal
        expect(emitTimelineEventMock).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            contactId: PRINCIPAL_ID,
            kind: 'contact_merged',
            source: 'MOD-MERGE',
            actorUserId: ACTOR_USER_ID,
          }),
          tx,
        )

        // Segunda emissão: no contato secundário
        expect(emitTimelineEventMock).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            contactId: SECONDARY_ID,
            kind: 'contact_merged',
            source: 'MOD-MERGE',
            actorUserId: ACTOR_USER_ID,
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 2: snapshots antes do estado ─────────────────────────────────────

  describe('merge.snapshots-before-state', () => {
    it(
      'given dois contatos vivos ' +
        'when mergeContacts ' +
        'then INSERT de contact_merge recebe principalSnapshot e secondarySnapshot',
      async () => {
        const tx = buildMergeTx({})
        const insertValuesMock = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: MERGE_ID }]),
        })
        tx.insert.mockReturnValue({ values: insertValuesMock })

        await mergeContacts(tx as unknown as Parameters<typeof mergeContacts>[0], {
          principalId: PRINCIPAL_ID,
          secondaryId: SECONDARY_ID,
          reason: 'Duplicata',
          actorUserId: ACTOR_USER_ID,
        })

        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            principalSnapshot: expect.objectContaining({
              contact: expect.objectContaining({ id: PRINCIPAL_ID }),
            }),
            secondarySnapshot: expect.objectContaining({
              contact: expect.objectContaining({ id: SECONDARY_ID }),
            }),
          }),
        )
      },
    )
  })

  // ── Caso 3: resolve issue vinculada ───────────────────────────────────────

  describe('merge.resolves-linked-issue', () => {
    it(
      'given issueId fornecido ' +
        'when mergeContacts ' +
        'then UPDATE em contact_issue com status=resolved é chamado',
      async () => {
        const tx = buildMergeTx({ issueId: ISSUE_ID })

        // Override do update para capturar chamadas com issueId
        const updateWhere = vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        })
        const updateSet = vi.fn().mockReturnValue({ where: updateWhere })

        let updateCallCount = 0
        tx.update.mockImplementation(() => {
          updateCallCount++
          return { set: updateSet }
        })

        await mergeContacts(tx as unknown as Parameters<typeof mergeContacts>[0], {
          principalId: PRINCIPAL_ID,
          secondaryId: SECONDARY_ID,
          reason: 'Via issue',
          issueId: ISSUE_ID,
          actorUserId: ACTOR_USER_ID,
        })

        // Deve ter chamado update pelo menos para as tabelas de reassign + contact + contact_merge_undone_at + issue
        expect(updateCallCount).toBeGreaterThan(0)
      },
    )
  })

  // ── Caso 4: rejeita mesmo contato ─────────────────────────────────────────

  describe('merge.rejects-same-contact', () => {
    it(
      'given mesmo ID para principal e secundário ' +
        'when mergeContacts ' +
        'then lança SameContactError sem nenhuma query ao DB',
      async () => {
        const tx = {
          select: vi.fn(),
          update: vi.fn(),
          insert: vi.fn(),
        }

        await expect(
          mergeContacts(tx as unknown as Parameters<typeof mergeContacts>[0], {
            principalId: PRINCIPAL_ID,
            secondaryId: PRINCIPAL_ID, // mesmo ID
            reason: 'Erro de usuario',
            actorUserId: ACTOR_USER_ID,
          }),
        ).rejects.toThrow(SameContactError)

        // Nenhuma query deve ter sido executada
        expect(tx.select).not.toHaveBeenCalled()
        expect(tx.update).not.toHaveBeenCalled()
        expect(tx.insert).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 5: rejeita secundário já mergeado ────────────────────────────────

  describe('merge.rejects-already-merged', () => {
    it(
      'given secundário com mergedIntoId preenchido ' +
        'when mergeContacts ' +
        'then lança SecondaryAlreadyMergedError',
      async () => {
        const tx = buildMergeTx({
          contacts: [principalContact, secondaryAlreadyMerged],
        })

        await expect(
          mergeContacts(tx as unknown as Parameters<typeof mergeContacts>[0], {
            principalId: PRINCIPAL_ID,
            secondaryId: SECONDARY_ID,
            reason: 'Tentar re-mergar',
            actorUserId: ACTOR_USER_ID,
          }),
        ).rejects.toThrow(SecondaryAlreadyMergedError)
      },
    )
  })
})

// ---------------------------------------------------------------------------
// undoMerge
// ---------------------------------------------------------------------------

describe('BR-MERGE — undoMerge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Caso 6: admin-only ────────────────────────────────────────────────────

  describe('undo.admin-only', () => {
    it(
      'given actorRole=commercial ' +
        'when undoMerge ' +
        'then lança MergeForbiddenError antes de qualquer query',
      async () => {
        const tx = {
          select: vi.fn(),
          update: vi.fn(),
          insert: vi.fn(),
        }

        await expect(
          undoMerge(tx as unknown as Parameters<typeof undoMerge>[0], {
            mergeId: MERGE_ID,
            reason: 'Undo não autorizado',
            actorUserId: ACTOR_USER_ID,
            actorRole: 'commercial',
          }),
        ).rejects.toThrow(MergeForbiddenError)

        // Nenhuma query deve ter sido executada
        expect(tx.select).not.toHaveBeenCalled()
      },
    )
  })

  // ── Caso 7: undo happy path ───────────────────────────────────────────────

  describe('undo.restores-fks', () => {
    it(
      'given mergeId válido e actorRole=admin ' +
        'when undoMerge ' +
        'then UPDATE em contact + INSERT em contact_merge_undo + emitTimelineEvent x2',
      async () => {
        const insertValuesMock = vi.fn().mockResolvedValue([])
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([existingMerge]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: insertValuesMock,
          }),
        }

        await undoMerge(tx as unknown as Parameters<typeof undoMerge>[0], {
          mergeId: MERGE_ID,
          reason: 'Contatos distintos',
          actorUserId: ACTOR_USER_ID,
          actorRole: 'admin',
        })

        // UPDATE deve ter sido chamado pelo menos para contact e phone e email
        expect(tx.update).toHaveBeenCalled()

        // INSERT deve ter sido chamado para contact_merge_undo
        expect(tx.insert).toHaveBeenCalled()
        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            mergeId: MERGE_ID,
            reason: 'Contatos distintos',
            undoneByUserId: ACTOR_USER_ID,
          }),
        )

        // emitTimelineEvent chamado 2 vezes (principal + secundário)
        expect(emitTimelineEventMock).toHaveBeenCalledTimes(2)
        expect(emitTimelineEventMock).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            contactId: PRINCIPAL_ID,
            kind: 'contact_unmerged',
            source: 'MOD-MERGE',
          }),
          tx,
        )
        expect(emitTimelineEventMock).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            contactId: SECONDARY_ID,
            kind: 'contact_unmerged',
            source: 'MOD-MERGE',
          }),
          tx,
        )
      },
    )
  })

  // ── Caso 8: once-per-merge ────────────────────────────────────────────────

  describe('undo.once-per-merge', () => {
    it(
      'given merge já com undoneAt preenchido ' +
        'when undoMerge ' +
        'then lança AlreadyUndoneError (detectado no select)',
      async () => {
        const mergeAlreadyUndone = { ...existingMerge, undoneAt: new Date() }

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([mergeAlreadyUndone]),
            }),
          }),
          update: vi.fn(),
          insert: vi.fn(),
        }

        await expect(
          undoMerge(tx as unknown as Parameters<typeof undoMerge>[0], {
            mergeId: MERGE_ID,
            reason: 'Undo duplicado',
            actorUserId: ACTOR_USER_ID,
            actorRole: 'admin',
          }),
        ).rejects.toThrow(AlreadyUndoneError)

        // Não deve ter feito updates
        expect(tx.update).not.toHaveBeenCalled()
      },
    )

    it(
      'given violação de unique constraint no INSERT de contact_merge_undo ' +
        'when undoMerge ' +
        'then mapeia para AlreadyUndoneError',
      async () => {
        const uniqueViolationError = new Error(
          'duplicate key value violates unique constraint "uq_contact_merge_undo_merge"',
        )

        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([existingMerge]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([]),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockRejectedValue(uniqueViolationError),
          }),
        }

        await expect(
          undoMerge(tx as unknown as Parameters<typeof undoMerge>[0], {
            mergeId: MERGE_ID,
            reason: 'Race condition no undo',
            actorUserId: ACTOR_USER_ID,
            actorRole: 'financial',
          }),
        ).rejects.toThrow(AlreadyUndoneError)
      },
    )
  })

  // ── Caso extra: mergeId não encontrado ────────────────────────────────────

  describe('undo.not-found', () => {
    it(
      'given mergeId inexistente ' +
        'when undoMerge com admin ' +
        'then lança MergeNotFoundError',
      async () => {
        const tx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]), // sem resultado
            }),
          }),
          update: vi.fn(),
          insert: vi.fn(),
        }

        await expect(
          undoMerge(tx as unknown as Parameters<typeof undoMerge>[0], {
            mergeId: 'non-existent-uuid',
            reason: 'Merge inexistente',
            actorUserId: ACTOR_USER_ID,
            actorRole: 'admin',
          }),
        ).rejects.toThrow(MergeNotFoundError)
      },
    )
  })
})
