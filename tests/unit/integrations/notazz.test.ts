/**
 * T-8-20 — Notazz outbound unit tests
 *
 * Testa sendInvoiceRequest e buildNotazzPayload sem I/O real:
 *   - DB é mockado via vi.mock('@/lib/db/client')
 *   - HTTP é injetado via parâmetro fetchFn
 *
 * Cenários cobertos:
 *   1. Idempotência: se webhook_log já está 'processed' → noop, HTTP não chamado
 *   2. Payload correto: verificar que HTTP POST recebe body correto
 *   3. webhook_log gravado antes do HTTP (sem linha prévia)
 *   4. Falha HTTP 500 → lança NotazzHttpError, atualiza webhook_log para 'failed'
 *   5. Idempotência com linha em 'failed': reenvia (retry)
 *   6. buildNotazzPayload: monta payload com campos mínimos corretos
 *   7. buildNotazzPayload: fallback para item genérico quando não há itens com produto
 *   8. buildNotazzPayload: strip de não-dígitos do CNPJ do emissor (ADR-02)
 *
 * docs/40-integrations/04-notazz.md §Casos de teste CT-NZ-01, CT-NZ-06
 * BR-INTEGRATION-IDEMPOTENCY
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Mock do DB — factory não pode referenciar variáveis externas (hoisting vitest)
// Usamos vi.fn() diretamente e capturamos as referências depois via vi.mocked
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/client', () => {
  const mockWhere = vi.fn()
  const mockLimit = vi.fn()
  const mockFrom = vi.fn()
  const mockSelect = vi.fn()
  const mockValues = vi.fn()
  const mockInsert = vi.fn()
  const mockSetInner = vi.fn()
  const mockSet = vi.fn()
  const mockUpdate = vi.fn()

  // Conectar cadeia: select().from().where().limit()
  mockLimit.mockResolvedValue([])
  mockWhere.mockReturnValue({ limit: mockLimit })
  mockFrom.mockReturnValue({ where: mockWhere })
  mockSelect.mockReturnValue({ from: mockFrom })

  // insert().values()
  mockValues.mockResolvedValue(undefined)
  mockInsert.mockReturnValue({ values: mockValues })

  // update().set().where()
  mockSetInner.mockResolvedValue(undefined)
  mockSet.mockReturnValue({ where: mockSetInner })
  mockUpdate.mockReturnValue({ set: mockSet })

  return {
    db: {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
    },
  }
})

// Importar DEPOIS do vi.mock (hoisted automaticamente pelo vitest)
import {
  sendInvoiceRequest,
  NotazzHttpError,
  buildNotazzPayload,
  type NotazzInvoicePayload,
} from '@/lib/integrations/notazz/send'
import type { TransactionSnapshotPayload } from '@/lib/domain/transaction/snapshot'
import { db } from '@/lib/db/client'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRANSACTION_ID = 'trx-0001-0000-0000-0000-000000000001'
const EXTERNAL_EVENT_ID = `notazz:invoice:${TRANSACTION_ID}`

/** Payload mínimo válido para testes */
const basePayload: NotazzInvoicePayload = {
  transaction_id: TRANSACTION_ID,
  amount: 297.0,
  customer: {
    name: 'Maria da Silva',
    cpf: '12345678909',
    email: 'maria.silva@example.com',
  },
  issuer: {
    cnpj: '12345678000195',
  },
  items: [
    {
      description: 'Curso Online de Marketing Digital',
      quantity: 1,
      unit_price: 297.0,
    },
  ],
}

/** Mock de snapshot payload v1 para buildNotazzPayload */
const snapshotWithProducts: TransactionSnapshotPayload = {
  version: 1,
  captured_at: '2025-01-15T10:00:00Z',
  brand: { id: 'brand-01', name: 'CNE Educação', slug: 'cne' },
  legal_entity: {
    id: 'le-01',
    cnpj: '12.345.678/0001-95',
    company_name: 'CNE Educação Ltda',
  },
  offer: { id: 'offer-01', name: 'Marketing Digital 2025', slug: 'mkt-2025', type: 'regular' },
  condition: {
    id: 'cond-01',
    name: 'Condição Padrão',
    priority: 1,
    advantage_score: 50,
    is_default: true,
    is_public: true,
  },
  rules: {
    group_id: 'grp-01',
    operator: 'and',
    children: [],
    evaluation: 'fallback_default',
    context_snapshot: {},
  },
  items: [
    {
      condition_item_id: 'ci-01',
      kind: 'main',
      product: { id: 'prod-01', name: 'Curso Marketing Digital', slug: 'cmd', kind: 'course' },
      quantity: 1,
      access_rule: {},
      vigency_months: 12,
      discount: null,
      responsible_user_id: null,
    },
  ],
  payment_option: {
    id: 'po-01',
    method: 'credit_card',
    price: 297.0,
    installments: 1,
    custom_config: {},
  },
  source: { provider: 'digital_guru', external_id: 'txn_001' },
}

/** Snapshot sem itens com produto (só benefício comercial) */
const snapshotWithoutProducts: TransactionSnapshotPayload = {
  ...snapshotWithProducts,
  items: [
    {
      condition_item_id: 'ci-02',
      kind: 'commercial_benefit',
      commercial_benefit: { id: 'cb-01', name: 'Desconto Alumni', slug: 'alumni' },
      quantity: 1,
      access_rule: {},
      vigency_months: null,
      discount: 10,
      responsible_user_id: null,
    },
  ],
}

// ---------------------------------------------------------------------------
// Helper: resetar mocks do DB para comportamento desejado
// ---------------------------------------------------------------------------

function getMocks() {
  // db é o objeto mockado — extraímos as funções via cast duplo (unknown first)
  const mockedDb = db as unknown as {
    select: Mock
    insert: Mock
    update: Mock
  }
  return mockedDb
}

function setupSelectResult(result: unknown[]) {
  const mocks = getMocks()
  const mockSetInner = vi.fn().mockResolvedValue(undefined)
  const mockLimit = vi.fn().mockResolvedValue(result)
  const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit })
  const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
  mocks.select.mockReturnValue({ from: mockFrom })
  return { mockLimit, mockWhere, mockFrom, mockSetInner }
}

function setupInsertSuccess() {
  const mocks = getMocks()
  const mockValues = vi.fn().mockResolvedValue(undefined)
  mocks.insert.mockReturnValue({ values: mockValues })
  return { mockValues }
}

function setupUpdateSuccess() {
  const mocks = getMocks()
  const mockSetInner = vi.fn().mockResolvedValue(undefined)
  const mockSet = vi.fn().mockReturnValue({ where: mockSetInner })
  mocks.update.mockReturnValue({ set: mockSet })
  return { mockSet, mockSetInner }
}

// ---------------------------------------------------------------------------
// Testes de sendInvoiceRequest
// ---------------------------------------------------------------------------

describe('sendInvoiceRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env['NOTAZZ_API_KEY'] = 'test-api-key'
    process.env['NOTAZZ_BASE_URL'] = 'https://app.notazz.com'
    delete process.env['NOTAZZ_DEFAULT_NCM']
    delete process.env['NOTAZZ_DEFAULT_CFOP']
  })

  // ── Teste 1: Idempotência — noop se já processado ──────────────────────
  it('retorna noop sem chamar HTTP quando webhook_log já está processed', async () => {
    setupSelectResult([{ id: 'wl-01', status: 'processed' }])
    setupInsertSuccess()
    setupUpdateSuccess()

    const fetchFn = vi.fn() as Mock

    await sendInvoiceRequest(TRANSACTION_ID, basePayload, fetchFn)

    // HTTP NÃO deve ser chamado — idempotência
    expect(fetchFn).not.toHaveBeenCalled()
    // INSERT não deve ser chamado — linha já existe como processed
    const mocks = getMocks()
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  // ── Teste 2: Grava webhook_log antes do HTTP (sem linha prévia) ────────
  it('insere webhook_log com status received antes de chamar HTTP', async () => {
    // Primeiro select: sem linha prévia
    setupSelectResult([])
    const { mockValues } = setupInsertSuccess()
    setupUpdateSuccess()

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"id":"inv-001"}',
    }) as Mock

    await sendInvoiceRequest(TRANSACTION_ID, basePayload, fetchFn)

    // INSERT deve ter sido chamado com campos corretos
    const mocks = getMocks()
    expect(mocks.insert).toHaveBeenCalledOnce()
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'notazz',
        externalEventId: EXTERNAL_EVENT_ID,
        eventKind: 'invoice.issue',
        status: 'received',
      }),
    )

    // HTTP deve ter sido chamado depois do INSERT
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  // ── Teste 3: Monta payload HTTP correto ────────────────────────────────
  it('envia POST com payload correto e cabeçalhos de autenticação', async () => {
    setupSelectResult([])
    setupInsertSuccess()
    setupUpdateSuccess()

    const capturedRequests: { url: string; options: RequestInit }[] = []

    const fetchFn = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
      capturedRequests.push({ url, options })
      return { ok: true, status: 200, text: async () => '{}' }
    }) as Mock

    await sendInvoiceRequest(TRANSACTION_ID, basePayload, fetchFn)

    expect(capturedRequests).toHaveLength(1)
    const [req] = capturedRequests

    // URL correta
    expect(req!.url).toBe('https://app.notazz.com/api/invoices')

    // Headers de autenticação
    expect(req!.options.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer test-api-key',
    })

    // Body inclui external_ref para idempotência na Notazz
    const body = JSON.parse(req!.options.body as string)
    expect(body).toMatchObject({
      transaction_id: TRANSACTION_ID,
      amount: 297.0,
      external_ref: TRANSACTION_ID,
      customer: {
        name: 'Maria da Silva',
        cpf: '12345678909',
        email: 'maria.silva@example.com',
      },
      issuer: {
        cnpj: '12345678000195',
      },
    })
  })

  // ── Teste 4: Falha HTTP → lança NotazzHttpError, atualiza status ────────
  it('lança NotazzHttpError e atualiza webhook_log para failed em erro HTTP', async () => {
    setupSelectResult([])
    setupInsertSuccess()
    const { mockSet } = setupUpdateSuccess()

    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    }) as Mock

    await expect(
      sendInvoiceRequest(TRANSACTION_ID, basePayload, fetchFn),
    ).rejects.toThrow(NotazzHttpError)

    // Deve atualizar status para 'failed'
    const mocks = getMocks()
    expect(mocks.update).toHaveBeenCalled()
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
      }),
    )
  })

  // ── Teste 5: Idempotência com linha prévia em failed → tenta novamente ─
  it('reenvia HTTP quando linha existe com status failed (retry)', async () => {
    // Linha prévia com status 'failed'
    setupSelectResult([{ id: 'wl-01', status: 'failed' }])
    setupInsertSuccess()
    setupUpdateSuccess()

    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    }) as Mock

    await sendInvoiceRequest(TRANSACTION_ID, basePayload, fetchFn)

    // Não deve inserir nova linha (já existe)
    const mocks = getMocks()
    expect(mocks.insert).not.toHaveBeenCalled()
    // HTTP deve ser chamado
    expect(fetchFn).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Testes de buildNotazzPayload (função pura)
// ---------------------------------------------------------------------------

describe('buildNotazzPayload', () => {
  beforeEach(() => {
    delete process.env['NOTAZZ_DEFAULT_NCM']
    delete process.env['NOTAZZ_DEFAULT_CFOP']
  })

  // ── Teste 6: monta payload com campos mínimos corretos ─────────────────
  it('monta payload com customer, issuer e items a partir do snapshot', () => {
    const result = buildNotazzPayload({
      transactionId: TRANSACTION_ID,
      amount: 297.0,
      contactName: 'Maria da Silva',
      contactCpf: '12345678909',
      contactEmail: 'maria.silva@example.com',
      issuingCnpj: '12.345.678/0001-95',
      snapshotPayload: snapshotWithProducts,
    })

    expect(result.transaction_id).toBe(TRANSACTION_ID)
    expect(result.amount).toBe(297.0)
    expect(result.customer).toEqual({
      name: 'Maria da Silva',
      cpf: '12345678909',
      email: 'maria.silva@example.com',
    })
    // ADR-02: CNPJ sem formatação (só dígitos)
    expect(result.issuer.cnpj).toBe('12345678000195')
    // Itens extraídos do snapshot
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.description).toBe('Curso Marketing Digital')
    expect(result.items[0]!.quantity).toBe(1)
  })

  // ── Teste 7: fallback para item genérico sem produtos no snapshot ──────
  it('usa nome da oferta como item genérico quando snapshot não tem produtos', () => {
    const result = buildNotazzPayload({
      transactionId: TRANSACTION_ID,
      amount: 297.0,
      contactName: 'João Santos',
      contactCpf: '98765432100',
      contactEmail: 'joao@example.com',
      issuingCnpj: '12345678000195',
      snapshotPayload: snapshotWithoutProducts,
    })

    // Deve ter item genérico com nome da oferta
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.description).toBe('Marketing Digital 2025')
    expect(result.items[0]!.quantity).toBe(1)
    expect(result.items[0]!.unit_price).toBe(297.0)
  })

  // ── Teste 8: strip de não-dígitos do CNPJ do emissor ──────────────────
  it('remove formatação do CNPJ do emissor (ADR-02)', () => {
    const result = buildNotazzPayload({
      transactionId: TRANSACTION_ID,
      amount: 100.0,
      contactName: 'Test User',
      contactCpf: '11122233344',
      contactEmail: 'test@example.com',
      issuingCnpj: '12.345.678/0001-95',
      snapshotPayload: snapshotWithProducts,
    })

    expect(result.issuer.cnpj).toBe('12345678000195')
    expect(result.issuer.cnpj).toMatch(/^\d+$/)
  })
})
