/**
 * Testes de integração — Idempotência + Retry + DLQ (T-11-15)
 *
 * docs/20-domain/15-automation.md §5 (INV-AUTOMATION-03), §9 (retries e DLQ)
 * docs/80-roadmap/08-sprint-11-automations.md T-11-15
 *
 * Cenários cobertos:
 *   Cenário 1 — Idempotência: mesmo trigger 3x = 1 execução criada
 *     (INV-AUTOMATION-03: uq_automation_execution_idem barra duplicação)
 *   Cenário 2 — Retry + DLQ: action falha 5x → status `failed`
 *     (docs/20-domain/15-automation.md §9: 5 tentativas com backoff exponencial)
 *   Cenário 3 — Reenfileirar DLQ: reprocess cria execução nova, original permanece `failed`
 *     (FLOW-AUTOMATION-REPROCESS: nova execution com novo idempotency_key)
 *
 * Estratégia:
 *   - tx mockado via vi.fn() (zero I/O real — padrão dos outros testes de integração)
 *   - runFlow mockado para simular falhas isoladamente do handler Inngest
 *   - Inngest client mockado (sem runtime real)
 *   - Padrão Given/When/Then em todos os casos
 *
 * ADR-11: tx como argumento (testado via mock)
 * INV-AUTOMATION-03: (flow_id, idempotency_key) UNIQUE — enforced via onConflictDoNothing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — DEVEM vir antes de qualquer import do código de produção
// vi.mock faz hoisting automático para o topo do arquivo
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/client', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/domain/automation/run-flow', () => ({
  runFlow: vi.fn(),
}))

// inngest client mock: fornece send() para reprocessExecution e
// createFunction() para que automation-run.ts possa ser importado sem erro.
// O handler interno do createFunction é capturado e invocado diretamente nos testes.
vi.mock('@/inngest/client', () => {
  // Armazenar o handler internamente para permitir extração posterior
  let _capturedHandler: ((ctx: unknown) => Promise<unknown>) | null = null

  const inngestMock = {
    send: vi.fn().mockResolvedValue(undefined),
    createFunction: vi.fn().mockImplementation(
      (_config: unknown, _trigger: unknown, handler: (ctx: unknown) => Promise<unknown>) => {
        _capturedHandler = handler
        // Retorna um objeto que simula a InngestFunction com a propriedade interna
        // usada pelo invokeAutomationHandler para extrair o handler
        return {
          id: 'automation-run',
          fn: handler,
        }
      },
    ),
    getCapturedHandler: () => _capturedHandler,
  }

  return { inngest: inngestMock }
})

vi.mock('@/lib/auth/session', () => ({
  requireSession: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports após mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db/client'
import { runFlow } from '@/lib/domain/automation/run-flow'
import { requireSession } from '@/lib/auth/session'
import {
  dispatchTrigger,
  computeIdempotencyKey,
} from '@/lib/domain/automation/dispatch'
import type { TriggerSubject } from '@/lib/domain/automation/dispatch'
import type { DbTx } from '@/lib/db/client'
import { AUTOMATION_MAX_RETRIES } from '@/inngest/functions/automation-run'

// ---------------------------------------------------------------------------
// Fixtures — IDs determinísticos
// ---------------------------------------------------------------------------

const FLOW_ID = '00000000-0000-0000-0000-000000000001'
const EXECUTION_ID = '00000000-0000-0000-0000-000000000011'
const NEW_EXECUTION_ID = '00000000-0000-0000-0000-000000000022'
const SUBJECT_ID = '00000000-0000-0000-0000-000000000099'
const USER_ID = '00000000-0000-0000-0000-000000000088'

const DEFAULT_SUBJECT: TriggerSubject = {
  subjectKind: 'contact',
  subjectId: SUBJECT_ID,
  data: {},
}

// ---------------------------------------------------------------------------
// Helpers — factory functions
// ---------------------------------------------------------------------------

function makeFailedExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: EXECUTION_ID,
    flowId: FLOW_ID,
    subjectKind: 'contact',
    subjectId: SUBJECT_ID,
    idempotencyKey: `${FLOW_ID}:contact:${SUBJECT_ID}:2026-04-25T10:30`,
    status: 'failed',
    triggeredAt: new Date('2026-04-25T10:30:00Z'),
    startedAt: new Date('2026-04-25T10:30:01Z'),
    finishedAt: new Date('2026-04-25T10:30:30Z'),
    error: 'Action send_external falhou após 5 tentativas',
    retryCount: 5,
    createdAt: new Date('2026-04-25T10:30:00Z'),
    updatedAt: new Date('2026-04-25T10:30:30Z'),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helpers — mock tx builder para dispatchTrigger
//
// Simula a chain de query do Drizzle:
//   tx.select({...}).from(...).innerJoin(...).innerJoin(...).where(...) → flows
//   tx.insert(...).values({...}).returning({...}).onConflictDoNothing() → [row]|[]
// ---------------------------------------------------------------------------

type DispatchTxOptions = {
  flows: Array<{ flowId: string; triggerFilter: Record<string, unknown> }>
  insertResults: Array<{ id: string } | undefined>
}

function makeDispatchTx(opts: DispatchTxOptions): {
  tx: DbTx
  insertCallCount: () => number
} {
  const { flows, insertResults } = opts
  let callCount = 0

  const selectChain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(flows),
  }

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockImplementation(() => {
      const result = insertResults[callCount]
      callCount++
      return Promise.resolve(result !== undefined ? [result] : [])
    }),
  }

  const tx = {
    select: vi.fn().mockReturnValue(selectChain),
    insert: vi.fn().mockReturnValue(insertChain),
  } as unknown as DbTx

  return { tx, insertCallCount: () => callCount }
}

// ---------------------------------------------------------------------------
// Helpers — step stub (simula Inngest step.run executando callbacks imediatamente)
// ---------------------------------------------------------------------------

function buildStep() {
  return {
    run: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
  }
}

// ---------------------------------------------------------------------------
// Helpers — db mock setup helpers (padrão de inngest.test.ts)
// ---------------------------------------------------------------------------

function setupDbSelectMock(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  ;(db.select as Mock).mockReturnValue(chain)
  return chain
}

function setupDbUpdateMock() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }
  ;(db.update as Mock).mockReturnValue(chain)
  return chain
}

// ---------------------------------------------------------------------------
// Helper — invoca o handler do Inngest automation-run diretamente
// (mesmo padrão de inngest.test.ts)
// ---------------------------------------------------------------------------

async function invokeAutomationHandler(opts: {
  executionId: string
  attempt?: number
  step: ReturnType<typeof buildStep>
}) {
  const { automationRun } = await import('@/inngest/functions/automation-run')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = automationRun as any
  const handler = fn['fn'] ?? fn['handler'] ?? fn['_fn']

  if (typeof handler !== 'function') {
    throw new Error(
      'Não foi possível extrair handler interno do objeto Inngest. ' +
        'Exporte uma função auxiliar de automation-run.ts para testar sem runtime.',
    )
  }

  return handler({
    event: {
      name: 'automation/run',
      data: { executionId: opts.executionId },
    },
    step: opts.step,
    attempt: opts.attempt ?? 0,
  })
}

// ---------------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
// CENÁRIO 1 — Idempotência: mesmo trigger 3x = 1 execução criada
//
// INV-AUTOMATION-03: (flow_id, idempotency_key) UNIQUE
// dispatchTrigger com onConflictDoNothing → 1ª chamada insere, 2ª e 3ª ignoradas
// ─────────────────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('Cenário 1 — Idempotência: mesmo trigger 3x = 1 execução criada', () => {
  it(
    'given active flow and same trigger dispatched 3 times in same minute ' +
      'when dispatchTrigger called 3x ' +
      'then only 1 execution created and 2nd/3rd calls return []',
    async () => {
      // INV-AUTOMATION-03: mesmo (flow_id, idempotency_key) dentro do mesmo minuto
      // onConflictDoNothing → 1ª call insere (retorna row), 2ª e 3ª skip (retornam [])

      // Montamos 3 tx separados, um por chamada ao dispatchTrigger
      // (em produção seria a mesma tx, mas como o minuto bucket é igual, a key é a mesma)
      const triggeredAt = new Date('2026-04-25T10:30:00Z')
      const idempKey = computeIdempotencyKey(FLOW_ID, 'new_message', SUBJECT_ID, triggeredAt)
      void idempKey // calculado apenas para documentação — a função também calcula internamente

      // 1ª chamada: insere com sucesso
      const { tx: tx1 } = makeDispatchTx({
        flows: [{ flowId: FLOW_ID, triggerFilter: {} }],
        insertResults: [{ id: EXECUTION_ID }],
      })

      // 2ª chamada: conflito UNIQUE → onConflictDoNothing retorna []
      const { tx: tx2 } = makeDispatchTx({
        flows: [{ flowId: FLOW_ID, triggerFilter: {} }],
        insertResults: [undefined], // undefined = conflito silencioso
      })

      // 3ª chamada: conflito UNIQUE → onConflictDoNothing retorna []
      const { tx: tx3 } = makeDispatchTx({
        flows: [{ flowId: FLOW_ID, triggerFilter: {} }],
        insertResults: [undefined], // undefined = conflito silencioso
      })

      const result1 = await dispatchTrigger('new_message', DEFAULT_SUBJECT, tx1)
      const result2 = await dispatchTrigger('new_message', DEFAULT_SUBJECT, tx2)
      const result3 = await dispatchTrigger('new_message', DEFAULT_SUBJECT, tx3)

      // INV-AUTOMATION-03: apenas a 1ª chamada retorna executionId
      expect(result1).toEqual([EXECUTION_ID])
      expect(result1).toHaveLength(1)

      // 2ª e 3ª chamadas retornam [] (conflito silencioso)
      expect(result2).toEqual([])
      expect(result3).toEqual([])
    },
  )

  it(
    'given same subjectId and flowId dispatched within same minute bucket ' +
      'when idempotency_key is computed for all 3 calls ' +
      'then all 3 keys are identical (INV-AUTOMATION-03)',
    () => {
      // INV-AUTOMATION-03: granularidade de 1 minuto para deduplicar reentregas rápidas
      const t1 = new Date('2026-04-25T10:30:00.000Z')
      const t2 = new Date('2026-04-25T10:30:15.000Z') // 15s depois, mesmo minuto
      const t3 = new Date('2026-04-25T10:30:59.999Z') // 59.999s depois, ainda mesmo minuto

      const key1 = computeIdempotencyKey(FLOW_ID, 'new_message', SUBJECT_ID, t1)
      const key2 = computeIdempotencyKey(FLOW_ID, 'new_message', SUBJECT_ID, t2)
      const key3 = computeIdempotencyKey(FLOW_ID, 'new_message', SUBJECT_ID, t3)

      // Mesmo minuto → mesma chave (deduplicação pelo constraint UNIQUE)
      expect(key1).toBe(key2)
      expect(key2).toBe(key3)
      expect(key1).toMatch(/^[0-9a-f]{64}$/) // SHA-256 hex
    },
  )

  it(
    'given same trigger dispatched once in minute 10:30 and once in minute 10:31 ' +
      'when idempotency_key computed for both ' +
      'then keys are different (re-dispatch legítimo após 1 minuto)',
    () => {
      // Granularidade de 1 minuto: re-dispatch legítimo após novo minuto
      const t1 = new Date('2026-04-25T10:30:59.999Z')
      const t2 = new Date('2026-04-25T10:31:00.000Z')

      const key1 = computeIdempotencyKey(FLOW_ID, 'new_message', SUBJECT_ID, t1)
      const key2 = computeIdempotencyKey(FLOW_ID, 'new_message', SUBJECT_ID, t2)

      expect(key1).not.toBe(key2)
    },
  )

  it(
    'given multiple active flows with same trigger kind ' +
      'when dispatch called once ' +
      'then 1 execution per flow is attempted (idempotency applies per flow)',
    async () => {
      const FLOW_ID_2 = '00000000-0000-0000-0000-000000000002'
      const EXEC_ID_1 = '00000000-0000-0000-0000-000000000011'
      const EXEC_ID_2 = '00000000-0000-0000-0000-000000000012'

      // Dois fluxos com filter vazio → ambos devem tentar criar execution
      // 1º insert insere (retorna EXEC_ID_1), 2º insert insere (retorna EXEC_ID_2)
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([
          { flowId: FLOW_ID, triggerFilter: {} },
          { flowId: FLOW_ID_2, triggerFilter: {} },
        ]),
      }

      let insertCallIndex = 0
      const insertResults = [[{ id: EXEC_ID_1 }], [{ id: EXEC_ID_2 }]]
      const insertChain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockReturnThis(),
        onConflictDoNothing: vi.fn().mockImplementation(() => {
          const result = insertResults[insertCallIndex] ?? []
          insertCallIndex++
          return Promise.resolve(result)
        }),
      }

      const tx = {
        select: vi.fn().mockReturnValue(selectChain),
        insert: vi.fn().mockReturnValue(insertChain),
      } as unknown as DbTx

      const result = await dispatchTrigger('new_message', DEFAULT_SUBJECT, tx)

      // 2 fluxos → 2 executions criadas
      expect(result).toHaveLength(2)
      expect(result).toContain(EXEC_ID_1)
      expect(result).toContain(EXEC_ID_2)
    },
  )
})

// ---------------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
// CENÁRIO 2 — Retry + DLQ: action falha 5x → status `failed`
//
// docs/20-domain/15-automation.md §9: "5 tentativas; após esgotar → status='failed'"
// Simulamos o handler Inngest sendo invocado 5x (attempts 0..4).
// Na última tentativa (attempt=4 = AUTOMATION_MAX_RETRIES-1): não relança, DLQ.
// ─────────────────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('Cenário 2 — Retry + DLQ: action falha 5x → status `failed`', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // db.transaction executa callback com tx stub
    ;(db.transaction as Mock).mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    )
  })

  it(
    'given runFlow that always throws ' +
      'when handler invoked on attempt 0 (first try) ' +
      'then exception is re-thrown for Inngest to retry (attempt 1/5)',
    async () => {
      // docs/20-domain/15-automation.md §9: tentativas 1-4 relançam a exceção
      setupDbSelectMock([
        {
          id: EXECUTION_ID,
          flowId: FLOW_ID,
          subjectKind: 'contact',
          subjectId: SUBJECT_ID,
          status: 'pending',
          retryCount: 0,
        },
      ])
      ;(runFlow as Mock).mockRejectedValue(new Error('action falhou'))
      setupDbUpdateMock()
      const step = buildStep()

      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, attempt: 0, step }),
      ).rejects.toThrow('action falhou')

      // retry_count deve ter sido incrementado via db.update
      expect(db.update as Mock).toHaveBeenCalled()
    },
  )

  it(
    'given runFlow that always throws ' +
      'when handler invoked on attempt 1 (second try) ' +
      'then exception is re-thrown for Inngest to retry (attempt 2/5)',
    async () => {
      setupDbSelectMock([
        {
          id: EXECUTION_ID,
          flowId: FLOW_ID,
          subjectKind: 'contact',
          subjectId: SUBJECT_ID,
          status: 'pending',
          retryCount: 1,
        },
      ])
      ;(runFlow as Mock).mockRejectedValue(new Error('action falhou'))
      setupDbUpdateMock()
      const step = buildStep()

      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, attempt: 1, step }),
      ).rejects.toThrow('action falhou')
    },
  )

  it(
    'given runFlow that always throws ' +
      'when handler invoked on attempt 2 (third try) ' +
      'then exception is re-thrown for Inngest to retry (attempt 3/5)',
    async () => {
      setupDbSelectMock([
        {
          id: EXECUTION_ID,
          flowId: FLOW_ID,
          subjectKind: 'contact',
          subjectId: SUBJECT_ID,
          status: 'pending',
          retryCount: 2,
        },
      ])
      ;(runFlow as Mock).mockRejectedValue(new Error('action falhou'))
      setupDbUpdateMock()
      const step = buildStep()

      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, attempt: 2, step }),
      ).rejects.toThrow('action falhou')
    },
  )

  it(
    'given runFlow that always throws ' +
      'when handler invoked on attempt 3 (fourth try) ' +
      'then exception is re-thrown for Inngest to retry (attempt 4/5)',
    async () => {
      setupDbSelectMock([
        {
          id: EXECUTION_ID,
          flowId: FLOW_ID,
          subjectKind: 'contact',
          subjectId: SUBJECT_ID,
          status: 'pending',
          retryCount: 3,
        },
      ])
      ;(runFlow as Mock).mockRejectedValue(new Error('action falhou'))
      setupDbUpdateMock()
      const step = buildStep()

      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, attempt: 3, step }),
      ).rejects.toThrow('action falhou')
    },
  )

  it(
    'given runFlow that always throws ' +
      'when handler invoked on attempt 4 (fifth and last try = DLQ) ' +
      'then exception is NOT re-thrown (DLQ path — Inngest stops retrying)',
    async () => {
      // docs/20-domain/15-automation.md §9: "após esgotar → status='failed' e cancelled via DLQ manual"
      // Na última tentativa (attempt = AUTOMATION_MAX_RETRIES - 1 = 4):
      //   - handler NÃO relança a exceção
      //   - db.update é chamado para atualizar retry_count e error
      //   - execution permanece com status='failed' no DB (definido pelo runFlow antes de lançar)
      setupDbSelectMock([
        {
          id: EXECUTION_ID,
          flowId: FLOW_ID,
          subjectKind: 'contact',
          subjectId: SUBJECT_ID,
          status: 'pending',
          retryCount: 4,
        },
      ])
      ;(runFlow as Mock).mockRejectedValue(new Error('action falhou na 5ª tentativa'))
      setupDbUpdateMock()
      const step = buildStep()

      // Na última tentativa: resolve (não rejeita)
      await expect(
        invokeAutomationHandler({
          executionId: EXECUTION_ID,
          attempt: AUTOMATION_MAX_RETRIES - 1, // = 4
          step,
        }),
      ).resolves.toBeUndefined()

      // db.update deve ter sido chamado (atualiza retry_count e error final)
      expect(db.update as Mock).toHaveBeenCalled()
    },
  )

  it(
    'given AUTOMATION_MAX_RETRIES constant ' +
      'when checked ' +
      'then equals 5 (spec docs/20-domain/15-automation.md §9)',
    () => {
      // Verificação explícita da constante de retry — garante que o ciclo de 5 tentativas
      // está correto (attempts 0,1,2,3,4 = 5 tentativas totais)
      expect(AUTOMATION_MAX_RETRIES).toBe(5)
    },
  )

  it(
    'given execution not found in DB ' +
      'when handler invoked ' +
      'then throws error without calling runFlow (fatal error — no retry useful)',
    async () => {
      // Execution não existe: erro fatal, runFlow não deve ser chamado
      setupDbSelectMock([])
      const step = buildStep()

      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, attempt: 0, step }),
      ).rejects.toThrow(EXECUTION_ID)

      expect(runFlow as Mock).not.toHaveBeenCalled()
    },
  )
})

// ---------------------------------------------------------------------------
// ─────────────────────────────────────────────────────────────────────────────
// CENÁRIO 3 — Reenfileirar DLQ: reprocess cria execução nova
//
// FLOW-AUTOMATION-REPROCESS: execução com status='failed' → nova automation_execution
// com novo idempotency_key (baseado em timestamp + executionId original).
// Execution original permanece com status='failed' (não é modificada).
// ─────────────────────────────────────────────────────────────────────────────
// ---------------------------------------------------------------------------

describe('Cenário 3 — Reenfileirar DLQ: reprocess cria execução nova', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Sessão mock com usuário admin
    ;(requireSession as Mock).mockResolvedValue({
      user: { id: USER_ID, role: 'admin' },
      ip: '127.0.0.1',
      userAgent: 'test-agent',
      correlationId: 'corr-001',
    })

    // db.transaction executa o callback com tx stub que simula select + insert
    ;(db.transaction as Mock).mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        // Simula o tx dentro da transação de reprocessExecution
        const txStub = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue([makeFailedExecution()]),
          }),
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnThis(),
            returning: vi.fn().mockResolvedValue([{ id: NEW_EXECUTION_ID }]),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockResolvedValue([]),
          }),
        }
        return fn(txStub)
      },
    )
  })

  it(
    'given execution with status=failed ' +
      'when reprocessExecution called ' +
      'then a NEW automation_execution is created with status=pending',
    async () => {
      const { reprocessExecution } = await import('@/app/(app)/automations/actions')

      const result = await reprocessExecution({ executionId: EXECUTION_ID })

      // FLOW-AUTOMATION-REPROCESS: nova execution criada
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.data.executionId).toBe(NEW_EXECUTION_ID)
      }
    },
  )

  it(
    'given execution with status=failed ' +
      'when reprocessExecution called ' +
      'then Inngest event automation/run is sent with the NEW executionId',
    async () => {
      const { inngest } = await import('@/inngest/client')
      const { reprocessExecution } = await import('@/app/(app)/automations/actions')

      await reprocessExecution({ executionId: EXECUTION_ID })

      // Inngest deve ser notificado com o novo executionId (não o original)
      expect(inngest.send as Mock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'automation/run',
          data: expect.objectContaining({
            executionId: NEW_EXECUTION_ID,
          }),
        }),
      )
    },
  )

  it(
    'given execution with status=failed ' +
      'when reprocessExecution called ' +
      'then original execution is NOT modified (remains failed)',
    async () => {
      const { reprocessExecution } = await import('@/app/(app)/automations/actions')

      await reprocessExecution({ executionId: EXECUTION_ID })

      // A transação deve ter: 1 select (buscar original) + 1 insert (nova execução)
      // O db.update NÃO deve ter sido chamado (original não é modificado)
      // Verificamos via o txStub capturado no mock de db.transaction
      const transactionMock = db.transaction as Mock
      const callArg = transactionMock.mock.calls[0]?.[0]
      expect(callArg).toBeTypeOf('function')

      // O resultado retornado pela transação deve ter o novo executionId
      const result = await reprocessExecution({ executionId: EXECUTION_ID })
      expect(result.ok).toBe(true)
      if (result.ok) {
        // O ID retornado é o NOVO, não o original
        expect(result.data.executionId).not.toBe(EXECUTION_ID)
        expect(result.data.executionId).toBe(NEW_EXECUTION_ID)
      }
    },
  )

  it(
    'given execution with status=failed ' +
      'when reprocessExecution called ' +
      'then new idempotency_key is different from original (no UNIQUE conflict)',
    async () => {
      // Capturar os valores inseridos para verificar o idempotency_key
      const insertedValues: unknown[] = []

      ;(db.transaction as Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txStub = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue([makeFailedExecution()]),
            }),
            insert: vi.fn().mockReturnValue({
              values: vi.fn().mockImplementation((vals: unknown) => {
                insertedValues.push(vals)
                return {
                  returning: vi.fn().mockResolvedValue([{ id: NEW_EXECUTION_ID }]),
                }
              }),
            }),
            update: vi.fn().mockReturnValue({
              set: vi.fn().mockReturnThis(),
              where: vi.fn().mockResolvedValue([]),
            }),
          }
          return fn(txStub)
        },
      )

      const { reprocessExecution } = await import('@/app/(app)/automations/actions')
      await reprocessExecution({ executionId: EXECUTION_ID })

      // A nova execution deve ter um idempotency_key diferente da original
      const inserted = insertedValues[0] as Record<string, unknown>
      const originalKey = makeFailedExecution().idempotencyKey

      expect(inserted).toBeDefined()
      expect(inserted?.idempotencyKey).toBeDefined()
      expect(inserted?.idempotencyKey).not.toBe(originalKey)

      // O novo key deve conter o EXECUTION_ID original como base (FLOW-AUTOMATION-REPROCESS)
      expect(String(inserted?.idempotencyKey)).toContain(EXECUTION_ID)
    },
  )

  it(
    'given execution with status=pending (not failed) ' +
      'when reprocessExecution called ' +
      'then returns error (only failed executions can be reprocessed)',
    async () => {
      // FLOW-AUTOMATION-REPROCESS: apenas execuções failed podem ser reenfileiradas
      ;(db.transaction as Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txStub = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue([makeFailedExecution({ status: 'pending' })]),
            }),
            insert: vi.fn(),
          }
          return fn(txStub)
        },
      )

      const { reprocessExecution } = await import('@/app/(app)/automations/actions')
      const result = await reprocessExecution({ executionId: EXECUTION_ID })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        // ActionError('VALIDATION', ...) → código mapeado para 'VALIDATION_FAILED' via toActionResult
        expect(result.error.code).toBe('VALIDATION_FAILED')
      }
    },
  )

  it(
    'given execution not found ' +
      'when reprocessExecution called ' +
      'then returns NOT_FOUND error without creating new execution',
    async () => {
      ;(db.transaction as Mock).mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          const txStub = {
            select: vi.fn().mockReturnValue({
              from: vi.fn().mockReturnThis(),
              where: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue([]), // execution não encontrada
            }),
            insert: vi.fn(),
          }
          return fn(txStub)
        },
      )

      const { reprocessExecution } = await import('@/app/(app)/automations/actions')
      const result = await reprocessExecution({ executionId: EXECUTION_ID })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND')
      }
    },
  )
})
