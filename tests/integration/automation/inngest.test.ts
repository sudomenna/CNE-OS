/**
 * Testes de integração — MOD-AUTOMATION: automation-run (T-11-07)
 *
 * docs/20-domain/15-automation.md §9 (execução, retries, DLQ)
 * docs/80-roadmap/08-sprint-11-automations.md T-11-07
 *
 * Cenários cobertos:
 *   1. Evento válido → runFlow chamado com executionId correto → succeeded
 *   2. runFlow lança exceção → exceção propagada para Inngest fazer retry
 *   3. Execution não encontrada → erro fatal lançado (sem retry útil)
 *   4. Última tentativa (attempt=4) → retry_count incrementado, DLQ logado, não relança
 *   5. Tentativa intermediária (attempt < 4) → retry_count incrementado e erro relançado
 *
 * Estratégia:
 *   - Chama a função handler diretamente extraindo o callback interno.
 *   - db.select, db.update, db.transaction são mockados via vi.mock.
 *   - runFlow mockado via vi.mock para isolar o handler Inngest do runner.
 *   - step stub executa callbacks imediatamente (simula Inngest step.run).
 *   - Nenhum runtime Inngest real é necessário.
 *
 * Padrão Given/When/Then
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
    transaction: vi.fn(),
  },
}))

vi.mock('@/lib/domain/automation/run-flow', () => ({
  runFlow: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports após mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db/client'
import { runFlow } from '@/lib/domain/automation/run-flow'
import { AUTOMATION_MAX_RETRIES } from '@/inngest/functions/automation-run'

// ---------------------------------------------------------------------------
// Constantes de fixture
// ---------------------------------------------------------------------------

const EXECUTION_ID = '00000000-0000-0000-0000-000000000001'
const FLOW_ID = '00000000-0000-0000-0000-000000000002'

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: EXECUTION_ID,
    flowId: FLOW_ID,
    subjectKind: 'contact',
    subjectId: '00000000-0000-0000-0000-000000000099',
    status: 'pending',
    retryCount: 0,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Step stub — executa callbacks imediatamente (simula Inngest step.run)
// ---------------------------------------------------------------------------

function buildStep() {
  return {
    run: vi.fn().mockImplementation((_name: string, fn: () => Promise<unknown>) => fn()),
  }
}

// ---------------------------------------------------------------------------
// Helpers para configurar o mock chain de db.select
// ---------------------------------------------------------------------------

function setupSelectMock(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  }
  ;(db.select as Mock).mockReturnValue(chain)
  return chain
}

function setupUpdateMock() {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }
  ;(db.update as Mock).mockReturnValue(chain)
  return chain
}

// ---------------------------------------------------------------------------
// Extrai o handler real da função Inngest criada pelo SDK
//
// A função criada por inngest.createFunction retorna um objeto com propriedade
// interna que contém o handler. Para testar sem runtime Inngest, invocamos
// o handler diretamente extraindo-o do módulo após instanciar.
//
// Estratégia: importar o módulo e chamar o handler armazenado no módulo como
// função exportada auxiliar — mas como o automationRun é um objeto Inngest,
// precisamos importar e reconstruir o handler inline.
//
// Solução mais simples e robusta: exportar uma função auxiliar `runAutomationHandler`
// do módulo automation-run.ts que pode ser chamada diretamente em testes.
// Porém, como não queremos modificar o design do handler para fins de testabilidade,
// usamos a abordagem de extrair o handler do objeto Inngest via sua API interna.
//
// ALTERNATIVA ADOTADA: testar a lógica de orquestração diretamente via
// uma função auxiliar exportada `runAutomationStep` que encapsula a lógica
// do handler sem depender do runtime Inngest. Esta é a mesma abordagem usada
// em `runDunningCycle` do dunning-retry.ts.
//
// Como T-11-07 não exporta função auxiliar separada (diferente de dunning),
// testamos importando o handler e simulando o contexto Inngest manualmente.
// ---------------------------------------------------------------------------

// Importa o handler internamente reconstruindo a chamada
// A abordagem é: mockar os deps e chamar a função exportada runAutomationHandler
// que vamos criar como export auxiliar — para manter consistência com o padrão
// do projeto (ver dunning-retry.ts que exporta runDunningCycle).
//
// Como automationRun NÃO exporta função auxiliar (é uma função Inngest direta),
// vamos testar via uma abordagem de "snapshot da lógica":
//   - Mock de db + runFlow
//   - Invocar diretamente a lógica do handler passando step stub + event mock

// ---------------------------------------------------------------------------
// Helper: simula execução do handler como se fosse o Inngest
//
// Esta função replica exatamente o que o runtime Inngest faria ao chamar o
// handler: passa o objeto `event`, `step` e `attempt` e captura o resultado.
// ---------------------------------------------------------------------------

async function invokeAutomationHandler(opts: {
  executionId: string
  brandId?: string
  attempt?: number
  step: ReturnType<typeof buildStep>
}) {
  // Importar dinamicamente para garantir que os mocks estão ativos
  const { automationRun } = await import('@/inngest/functions/automation-run')

  // O SDK Inngest armazena o handler internamente.
  // Usamos a API pública do objeto para acessar o handler real:
  // automationRun é um InngestFunction — tem propriedades como `id` e o handler.
  // Para invocar sem runtime: acessar o callback passado ao createFunction.
  //
  // Como o Inngest SDK não expõe o handler diretamente na API pública estável,
  // usamos a abordagem de "type-cast para any" para acessar a propriedade interna.
  // Esta é a mesma abordagem usada em outros projetos que testam Inngest sem servidor.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = automationRun as any
  const handler = fn['fn'] ?? fn['handler'] ?? fn['_fn']

  if (typeof handler !== 'function') {
    // Fallback: se o SDK mudou a API interna, lançar erro informativo
    throw new Error(
      'Não foi possível extrair handler interno do objeto Inngest. ' +
        'Exporte uma função auxiliar de automation-run.ts para testar sem runtime.',
    )
  }

  return handler({
    event: {
      name: 'automation/run',
      data: { executionId: opts.executionId, brandId: opts.brandId },
    },
    step: opts.step,
    attempt: opts.attempt ?? 0,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('automationRun — Inngest handler (T-11-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // db.transaction: executa o callback com um tx stub
    ;(db.transaction as Mock).mockImplementation(
      (fn: (tx: unknown) => Promise<unknown>) => fn({}),
    )
  })

  // ── Cenário 1: Evento válido → runFlow chamado corretamente ────────────────

  describe('given valid execution exists', () => {
    it('when handler invoked then runFlow is called with correct executionId', async () => {
      // Arrange
      setupSelectMock([makeExecution()])
      ;(runFlow as Mock).mockResolvedValue(undefined)
      const step = buildStep()

      // Act
      await invokeAutomationHandler({ executionId: EXECUTION_ID, step })

      // Assert: runFlow foi chamado com executionId correto
      expect(runFlow as Mock).toHaveBeenCalledTimes(1)
      const [calledExecutionId] = (runFlow as Mock).mock.calls[0] as [string, ...unknown[]]
      expect(calledExecutionId).toBe(EXECUTION_ID)
    })

    it('when handler invoked then RunFlowContext is built from execution subject fields', async () => {
      // Arrange
      const execution = makeExecution({ subjectKind: 'transaction', subjectId: '00000000-0000-0000-0000-000000000099' })
      setupSelectMock([execution])
      ;(runFlow as Mock).mockResolvedValue(undefined)
      const step = buildStep()

      // Act
      await invokeAutomationHandler({ executionId: EXECUTION_ID, step })

      // Assert: contexto tem subjectKind e subjectId corretos
      expect(runFlow as Mock).toHaveBeenCalledTimes(1)
      const [, ctx] = (runFlow as Mock).mock.calls[0] as [string, { subjectKind: string; subjectId: string }, ...unknown[]]
      expect(ctx.subjectKind).toBe('transaction')
      expect(ctx.subjectId).toBe('00000000-0000-0000-0000-000000000099')
    })
  })

  // ── Cenário 2: runFlow lança exceção → propagada para Inngest retry ────────

  describe('given runFlow throws exception on non-last attempt', () => {
    it('when handler invoked then exception is propagated for Inngest retry', async () => {
      // Arrange
      setupSelectMock([makeExecution()])
      const runError = new Error('action send_external timeout')
      ;(runFlow as Mock).mockRejectedValue(runError)
      setupUpdateMock()
      const step = buildStep()

      // Act & Assert: a exceção deve ser relançada para o Inngest retentar
      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, attempt: 0, step }),
      ).rejects.toThrow('action send_external timeout')

      // retry_count deve ter sido incrementado
      expect(db.update as Mock).toHaveBeenCalled()
    })

    it('when handler invoked with attempt=1 then exception still propagated', async () => {
      // Arrange
      setupSelectMock([makeExecution()])
      ;(runFlow as Mock).mockRejectedValue(new Error('db connection lost'))
      setupUpdateMock()
      const step = buildStep()

      // Act & Assert: tentativas 0,1,2,3 ainda relançam a exceção
      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, attempt: 1, step }),
      ).rejects.toThrow('db connection lost')
    })
  })

  // ── Cenário 3: Execution não encontrada → erro fatal ──────────────────────

  describe('given execution not found', () => {
    it('when handler invoked then throws error with clear message', async () => {
      // Arrange: select retorna array vazio
      setupSelectMock([])
      const step = buildStep()

      // Act & Assert
      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, step }),
      ).rejects.toThrow(EXECUTION_ID)

      // runFlow não deve ter sido chamado
      expect(runFlow as Mock).not.toHaveBeenCalled()
    })

    it('when handler invoked with unknown id then error message is clear', async () => {
      // Arrange
      setupSelectMock([])
      const step = buildStep()

      // Act & Assert
      await expect(
        invokeAutomationHandler({ executionId: EXECUTION_ID, step }),
      ).rejects.toThrow('not found')
    })
  })

  // ── Cenário 4: Última tentativa → DLQ, não relança ────────────────────────

  describe('given last attempt (attempt=4) and runFlow throws', () => {
    it('when handler invoked then does NOT re-throw (DLQ path)', async () => {
      // Arrange
      setupSelectMock([makeExecution()])
      ;(runFlow as Mock).mockRejectedValue(new Error('persistent failure'))
      setupUpdateMock()
      const step = buildStep()

      // Act: a última tentativa NÃO deve relançar a exceção
      // Inngest para de retentar; execution fica com status='failed' no DB
      await expect(
        invokeAutomationHandler({
          executionId: EXECUTION_ID,
          attempt: AUTOMATION_MAX_RETRIES - 1, // = 4
          step,
        }),
      ).resolves.toBeUndefined()

      // retry_count e error devem ter sido atualizados no DB
      expect(db.update as Mock).toHaveBeenCalled()
    })
  })

  // ── Cenário 5: AUTOMATION_MAX_RETRIES exportado corretamente ──────────────

  describe('AUTOMATION_MAX_RETRIES constant', () => {
    it('should be 5 per spec docs/20-domain/15-automation.md §9', () => {
      expect(AUTOMATION_MAX_RETRIES).toBe(5)
    })
  })
})
