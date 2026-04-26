/**
 * @vitest-environment jsdom
 *
 * Testes do componente <DataTable> — incluindo suporte a visibilidade de colunas (T-16-02).
 *
 * Cobre:
 *  1. Backward-compat: sem columnVisibility → comportamento original
 *  2. Com columnVisibility: toolbar aparece, colunas filtradas por defaults
 *  3. Toggle de coluna (via ColumnsCustomizer) oculta coluna em thead + tbody
 *  4. alwaysVisible aparece disabled no popover
 *  5. labelOverrides substitui o label no popover
 *  6. Persistência: localStorage preenchido antes do render → coluna oculta após mount
 *  7. Reset: "Restaurar padrão" limpa preferências e mostra todas as colunas
 *  8. A11y: aria-sort + scope="col" mantidos
 *
 * Ref: docs/80-roadmap/13-sprint-16-table-columns-customizer.md T-16-02
 * Ref: docs/90-meta/04-decision-log.md ADR-19
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, fireEvent, act, cleanup, waitFor } from '@testing-library/react'
import {
  DataTable,
  type DataTableColumn,
  type DataTableColumnVisibility,
} from '@/components/ui/data-table'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Row = { id: string; name: string; email: string; phone: string; origin: string }

const ROWS: Row[] = [
  { id: '1', name: 'Alice', email: 'alice@ex.com', phone: '11999001', origin: 'organic' },
  { id: '2', name: 'Bob', email: 'bob@ex.com', phone: '11999002', origin: 'paid' },
]

const COLUMNS: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Nome', cell: (r) => r.name },
  { key: 'email', header: 'E-mail', cell: (r) => r.email },
  { key: 'phone', header: 'Telefone', cell: (r) => r.phone },
  { key: 'origin', header: 'Origem', cell: (r) => r.origin },
]

const TABLE_ID = 'test:data-table'
const USER_ID = 'user-test-dt-001'
const STORAGE_KEY = `cne-os:cols:${TABLE_ID}:${USER_ID}`

const BASE_CV: DataTableColumnVisibility = {
  tableId: TABLE_ID,
  userId: USER_ID,
}

// Helper: abre o popover do ColumnsCustomizer (botão "Personalizar colunas")
async function openColumnsPopover(): Promise<void> {
  const trigger = document.querySelector('[aria-label="Personalizar colunas"]') as HTMLElement | null
  if (!trigger) throw new Error('Botão "Personalizar colunas" não encontrado')
  await act(async () => {
    fireEvent.click(trigger)
  })
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// 1. Backward compat — sem columnVisibility
// ---------------------------------------------------------------------------

describe('DataTable — backward compat (sem columnVisibility)', () => {
  it('renderiza todas as colunas no thead', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)

    const headers = document.querySelectorAll('th[scope="col"]')
    expect(headers.length).toBe(COLUMNS.length)

    const headerTexts = Array.from(headers).map((th) => th.textContent?.trim())
    expect(headerTexts).toContain('Nome')
    expect(headerTexts).toContain('E-mail')
    expect(headerTexts).toContain('Telefone')
    expect(headerTexts).toContain('Origem')
  })

  it('renderiza todas as linhas no tbody', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)

    const cells = document.querySelectorAll('td')
    // 2 linhas × 4 colunas = 8 células
    expect(cells.length).toBe(8)
  })

  it('toolbar de personalizar colunas NÃO aparece', () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} />)

    const customizeBtn = document.querySelector('[aria-label="Personalizar colunas"]')
    expect(customizeBtn).toBeNull()
  })

  it('ordena ao clicar em cabeçalho sortable', () => {
    const onSort = vi.fn()
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nome', cell: (r) => r.name, sortable: true },
      { key: 'email', header: 'E-mail', cell: (r) => r.email },
    ]

    render(<DataTable columns={cols} rows={ROWS} rowKey={(r) => r.id} onSort={onSort} />)

    const nameHeader = document.querySelector('th[scope="col"][aria-sort]') as HTMLElement
    fireEvent.click(nameHeader)

    expect(onSort).toHaveBeenCalledWith('name', 'ascending')
  })

  it('aria-sort="none" em coluna sortable sem ordenação ativa', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nome', cell: (r) => r.name, sortable: true },
    ]

    render(<DataTable columns={cols} rows={ROWS} rowKey={(r) => r.id} />)

    const th = document.querySelector('th[scope="col"][aria-sort="none"]')
    expect(th).not.toBeNull()
  })

  it('emptyMessage aparece quando rows está vazio', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={[]}
        rowKey={(r) => r.id}
        emptyMessage="Sem registros."
      />
    )

    expect(document.body.textContent).toContain('Sem registros.')
  })
})

// ---------------------------------------------------------------------------
// 2. Com columnVisibility — toolbar e filtro de colunas
// ---------------------------------------------------------------------------

describe('DataTable — com columnVisibility', () => {
  it('renderiza toolbar com botão "Personalizar colunas"', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    const btn = document.querySelector('[aria-label="Personalizar colunas"]')
    expect(btn).not.toBeNull()
  })

  it('por padrão todas as colunas (exceto defaultHidden) aparecem no thead', () => {
    const cv: DataTableColumnVisibility = {
      ...BASE_CV,
      defaultHidden: ['origin'],
    }

    render(<DataTable columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} columnVisibility={cv} />)

    const headers = document.querySelectorAll('th[scope="col"]')
    const headerTexts = Array.from(headers).map((th) => th.textContent?.trim())

    expect(headerTexts).toContain('Nome')
    expect(headerTexts).toContain('E-mail')
    expect(headerTexts).toContain('Telefone')
    // Origem nasce oculta
    expect(headerTexts).not.toContain('Origem')
  })

  it('sem defaultHidden, todas as colunas aparecem', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    const headers = document.querySelectorAll('th[scope="col"]')
    expect(headers.length).toBe(COLUMNS.length)
  })

  it('coluna oculta não aparece no thead nem no tbody', async () => {
    // Pré-popular localStorage para simular coluna "email" oculta
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, updatedAt: '2026-04-27T00:00:00.000Z', hidden: ['email'] })
    )

    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    // Aguardar hidratação do hook (useEffect que lê localStorage)
    await waitFor(() => {
      const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
        (th) => th.textContent?.trim()
      )
      expect(headerTexts).not.toContain('E-mail')
    })

    // Também não deve aparecer célula com o valor do email
    expect(document.body.textContent).not.toContain('alice@ex.com')
    expect(document.body.textContent).not.toContain('bob@ex.com')
  })
})

// ---------------------------------------------------------------------------
// 3. Toggle de coluna via ColumnsCustomizer
// ---------------------------------------------------------------------------

describe('DataTable — toggle de coluna via ColumnsCustomizer', () => {
  it('após toggle de "Telefone", coluna some do thead e tbody', async () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    // Confirmar que Telefone está visível antes
    expect(
      Array.from(document.querySelectorAll('th[scope="col"]')).some(
        (th) => th.textContent?.trim() === 'Telefone'
      )
    ).toBe(true)

    // Abrir popover
    await openColumnsPopover()

    // Clicar no checkbox de Telefone para ocultar
    const phoneCheckbox = document.querySelector('[aria-label="Telefone"]') as HTMLElement | null
    expect(phoneCheckbox).not.toBeNull()

    await act(async () => {
      fireEvent.click(phoneCheckbox!)
    })

    // Confirmar que Telefone sumiu do thead
    const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
      (th) => th.textContent?.trim()
    )
    expect(headerTexts).not.toContain('Telefone')

    // Confirmar que dados de telefone sumiram do tbody
    expect(document.body.textContent).not.toContain('11999001')
    expect(document.body.textContent).not.toContain('11999002')
  })

  it('após toggle para ocultar e toggle novamente para exibir, coluna reaparece', async () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    await openColumnsPopover()

    const phoneCheckbox = document.querySelector('[aria-label="Telefone"]') as HTMLElement | null
    expect(phoneCheckbox).not.toBeNull()

    // Primeiro toggle: ocultar
    await act(async () => {
      fireEvent.click(phoneCheckbox!)
    })

    // Segundo toggle: exibir novamente
    await act(async () => {
      fireEvent.click(phoneCheckbox!)
    })

    const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
      (th) => th.textContent?.trim()
    )
    expect(headerTexts).toContain('Telefone')
  })
})

// ---------------------------------------------------------------------------
// 4. alwaysVisible — checkbox disabled no popover
// ---------------------------------------------------------------------------

describe('DataTable — alwaysVisible no popover', () => {
  it('coluna alwaysVisible aparece com checkbox disabled', async () => {
    const cv: DataTableColumnVisibility = {
      ...BASE_CV,
      alwaysVisible: ['name'],
    }

    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={cv}
      />
    )

    await openColumnsPopover()

    const nomeCheckbox = document.querySelector(
      '[aria-label="Nome (coluna obrigatória)"]'
    ) as HTMLButtonElement | null
    expect(nomeCheckbox).not.toBeNull()

    const isDisabled =
      nomeCheckbox!.getAttribute('disabled') !== null ||
      nomeCheckbox!.getAttribute('aria-disabled') === 'true' ||
      nomeCheckbox!.hasAttribute('disabled')
    expect(isDisabled).toBe(true)
  })

  it('clique em checkbox alwaysVisible não oculta a coluna', async () => {
    const cv: DataTableColumnVisibility = {
      ...BASE_CV,
      alwaysVisible: ['name'],
    }

    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={cv}
      />
    )

    await openColumnsPopover()

    const nomeCheckbox = document.querySelector(
      '[aria-label="Nome (coluna obrigatória)"]'
    ) as HTMLElement | null
    expect(nomeCheckbox).not.toBeNull()

    await act(async () => {
      fireEvent.click(nomeCheckbox!)
    })

    // Nome ainda visível no thead
    const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
      (th) => th.textContent?.trim()
    )
    expect(headerTexts).toContain('Nome')
  })
})

// ---------------------------------------------------------------------------
// 5. labelOverrides — substitui header no popover
// ---------------------------------------------------------------------------

describe('DataTable — labelOverrides', () => {
  it('substitui o label do cabeçalho no popover pelo override', async () => {
    const cv: DataTableColumnVisibility = {
      ...BASE_CV,
      labelOverrides: { phone: 'Celular (WhatsApp)' },
    }

    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={cv}
      />
    )

    await openColumnsPopover()

    // O checkbox do popover deve usar o label override
    const overrideCheckbox = document.querySelector(
      '[aria-label="Celular (WhatsApp)"]'
    ) as HTMLElement | null
    expect(overrideCheckbox).not.toBeNull()

    // O header original no thead continua como "Telefone" (não é afetado pelo labelOverride)
    const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
      (th) => th.textContent?.trim()
    )
    expect(headerTexts).toContain('Telefone')
  })
})

// ---------------------------------------------------------------------------
// 6. Persistência: localStorage preenchido → coluna oculta após mount
// ---------------------------------------------------------------------------

describe('DataTable — persistência (localStorage)', () => {
  it('coluna listada em hidden aparece oculta após hydratação', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, updatedAt: '2026-04-27T00:00:00.000Z', hidden: ['email'] })
    )

    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    await waitFor(() => {
      const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
        (th) => th.textContent?.trim()
      )
      expect(headerTexts).not.toContain('E-mail')
    })
  })

  it('toggle escreve no localStorage na chave correta', async () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    await openColumnsPopover()

    const emailCheckbox = document.querySelector('[aria-label="E-mail"]') as HTMLElement | null
    expect(emailCheckbox).not.toBeNull()

    await act(async () => {
      fireEvent.click(emailCheckbox!)
    })

    const stored = localStorage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    const payload = JSON.parse(stored!)
    expect(payload.v).toBe(1)
    expect(payload.hidden).toContain('email')
  })

  it('defaultHidden key inexistente em columns é ignorada silenciosamente', () => {
    const cv: DataTableColumnVisibility = {
      ...BASE_CV,
      defaultHidden: ['coluna-inexistente'],
    }

    // Não deve lançar erro
    expect(() => {
      render(
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.id}
          columnVisibility={cv}
        />
      )
    }).not.toThrow()

    // Todas as colunas existentes continuam visíveis
    const headers = document.querySelectorAll('th[scope="col"]')
    expect(headers.length).toBe(COLUMNS.length)
  })
})

// ---------------------------------------------------------------------------
// 7. Reset — "Restaurar padrão"
// ---------------------------------------------------------------------------

describe('DataTable — reset (Restaurar padrão)', () => {
  it('click em "Restaurar padrão" exibe todas as colunas e limpa localStorage', async () => {
    // Pré-popular localStorage com "email" e "origin" ocultos
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        v: 1,
        updatedAt: '2026-04-27T00:00:00.000Z',
        hidden: ['email', 'origin'],
      })
    )

    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    // Aguardar hidratação (colunas ocultas pela preferência)
    await waitFor(() => {
      const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
        (th) => th.textContent?.trim()
      )
      expect(headerTexts).not.toContain('E-mail')
    })

    await openColumnsPopover()

    const resetBtns = Array.from(document.querySelectorAll('button')).filter(
      (btn) => btn.textContent?.trim() === 'Restaurar padrão'
    )
    expect(resetBtns.length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(resetBtns[0] as HTMLButtonElement)
    })

    // localStorage deve estar limpo
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    // Todas as colunas voltam a aparecer
    await waitFor(() => {
      const headerTexts = Array.from(document.querySelectorAll('th[scope="col"]')).map(
        (th) => th.textContent?.trim()
      )
      expect(headerTexts).toContain('E-mail')
      expect(headerTexts).toContain('Origem')
    })
  })
})

// ---------------------------------------------------------------------------
// 8. A11y — aria-sort e scope="col" mantidos com columnVisibility
// ---------------------------------------------------------------------------

describe('DataTable — A11y com columnVisibility', () => {
  it('th tem scope="col" em todas as colunas visíveis', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    const allTh = document.querySelectorAll('th')
    allTh.forEach((th) => {
      expect(th.getAttribute('scope')).toBe('col')
    })
  })

  it('aria-sort="none" presente em coluna sortable com columnVisibility', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nome', cell: (r) => r.name, sortable: true },
      { key: 'email', header: 'E-mail', cell: (r) => r.email },
    ]

    render(
      <DataTable
        columns={cols}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={{ tableId: TABLE_ID, userId: USER_ID }}
      />
    )

    const sortableTh = document.querySelector('th[scope="col"][aria-sort="none"]')
    expect(sortableTh).not.toBeNull()
  })

  it('aria-sort="ascending" após ordenação ativa', () => {
    const cols: DataTableColumn<Row>[] = [
      { key: 'name', header: 'Nome', cell: (r) => r.name, sortable: true },
    ]

    render(
      <DataTable
        columns={cols}
        rows={ROWS}
        rowKey={(r) => r.id}
        sort={{ columnKey: 'name', direction: 'ascending' }}
        columnVisibility={{ tableId: TABLE_ID, userId: USER_ID }}
      />
    )

    const th = document.querySelector('th[scope="col"][aria-sort="ascending"]')
    expect(th).not.toBeNull()
  })

  it('caption sr-only quando fornecido', () => {
    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        caption="Tabela de teste"
        columnVisibility={BASE_CV}
      />
    )

    const caption = document.querySelector('caption.sr-only')
    expect(caption).not.toBeNull()
    expect(caption?.textContent).toBe('Tabela de teste')
  })
})

// ---------------------------------------------------------------------------
// 9. Edge cases
// ---------------------------------------------------------------------------

describe('DataTable — edge cases', () => {
  it('columns vazio com columnVisibility → sem toolbar, tabela vazia normal', () => {
    render(
      <DataTable
        columns={[]}
        rows={[]}
        rowKey={(r: Row) => r.id}
        columnVisibility={BASE_CV}
      />
    )

    // Toolbar não aparece (0 colunas não faz sentido personalizar)
    const customizeBtn = document.querySelector('[aria-label="Personalizar colunas"]')
    expect(customizeBtn).toBeNull()
  })

  it('todas as colunas em alwaysVisible → customizer aparece com checkboxes todos disabled', async () => {
    const cv: DataTableColumnVisibility = {
      ...BASE_CV,
      alwaysVisible: ['name', 'email', 'phone', 'origin'],
    }

    render(
      <DataTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => r.id}
        columnVisibility={cv}
      />
    )

    await openColumnsPopover()

    // Todas as 4 colunas devem ter checkbox disabled
    const disabledCheckboxes = Array.from(document.querySelectorAll('button[disabled]'))
    // Filtrar apenas checkboxes de colunas (pelo aria-label que não contém "Personalizar")
    const columnCheckboxes = disabledCheckboxes.filter(
      (el) =>
        el.getAttribute('aria-label') !== 'Personalizar colunas' &&
        el.getAttribute('role') === 'checkbox'
    )
    expect(columnCheckboxes.length).toBe(4)
  })
})
