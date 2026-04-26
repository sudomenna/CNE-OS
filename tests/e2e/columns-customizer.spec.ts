/**
 * T-16-16 — columns-customizer.spec.ts
 *
 * Testes E2E para customização de colunas via <ColumnsCustomizer> (Sprint 16, ADR-19).
 *
 * Casos cobertos:
 *   CT-COLS-01: abre popover via botão "Personalizar colunas" em /contacts
 *   CT-COLS-02: coluna alwaysVisible (Nome) aparece checked e disabled no popover
 *   CT-COLS-03: desligar coluna esconde columnheader da tabela
 *   CT-COLS-04: preferência persiste no localStorage após toggle
 *   CT-COLS-05: recarregar página mantém coluna oculta (persiste entre navegações)
 *   CT-COLS-06: "Restaurar padrão" remove preferência do localStorage e mostra colunas defaults
 *   CT-COLS-07: smoke — padrão funciona em /offers (brand defaultVisible, togglável)
 *   CT-COLS-08: smoke — padrão funciona em /transactions (contact defaultVisible, togglável)
 *
 * Regras cobertas:
 *   ADR-19: localStorage key `cne-os:cols:<tableId>:<userId>`, payload `{v,updatedAt,hidden[]}`
 *   docs/70-ux/12-table-column-customizer.md §4 (alwaysVisible, defaultVisible)
 *   T-16-04 (contacts), T-16-05 (offers), T-16-06 (transactions)
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true              — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL            — email do usuário admin (role=admin)
 *   E2E_ADMIN_PASSWORD         — senha do usuário admin
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=tiagomenna@gmail.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   pnpm test:e2e -- columns-customizer
 *
 * Notas:
 *   - O customizador é client-only (useEffect lê localStorage após hydratação).
 *     Todos os expects usam auto-wait do Playwright — sem waitForTimeout.
 *   - A chave do localStorage é `cne-os:cols:<tableId>:<userId>`. O userId é
 *     obtido dinamicamente via page.evaluate (busca a chave que começa com o prefix).
 *   - Seletores dentro do popover usam `page.getByRole('dialog')` como escopo
 *     para evitar colisão com labels de filtro na página (ex.: "Nome" no filtro de
 *     busca de contatos vs checkbox "Nome" no popover).
 *   - CT-COLS-07 (offers): OfferList só renderiza customizer quando offers.length > 0.
 *     Se o banco estiver vazio, o caso é marcado fixme com instrução de seed.
 *   - CT-COLS-08 (transactions): idem para TransactionList.
 *
 * Spec de referência:
 *   docs/80-roadmap/13-sprint-16-table-columns-customizer.md T-16-16
 *   docs/10-architecture/10-testing-strategy.md §4
 *   components/ui/columns-customizer.tsx
 *   lib/hooks/use-column-visibility.ts (chave ADR-19)
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------

test.describe('T-16-16 ColumnsCustomizer', () => {
  test.skip(
    process.env['SEED_E2E'] !== 'true',
    'requires seeded test database — run with SEED_E2E=true',
  )

  // -------------------------------------------------------------------------
  // Helper: login como admin via /login (email + senha).
  // Padrão idêntico ao usado em settings-permissions.spec.ts (T-15-07).
  // -------------------------------------------------------------------------

  async function loginAsAdmin(page: import('@playwright/test').Page) {
    const email = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@test.com'
    const password = process.env['E2E_ADMIN_PASSWORD'] ?? ''

    await page.goto('/login')
    await expect(page.getByText('CNE-OS').first()).toBeVisible()

    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    await page.waitForURL(
      /\/(contacts|campaigns|funnels|tickets|inbox|offers|transactions|billing|analytics|automations|settings)/,
      { timeout: 10_000 },
    )
  }

  // -------------------------------------------------------------------------
  // Helper: limpa todas as preferências de coluna do localStorage para o
  // tableId informado (independente do userId — varre todas as chaves).
  // Garante que cada teste começa do zero sem interferência de execução anterior.
  // -------------------------------------------------------------------------

  async function clearColumnPreferences(
    page: import('@playwright/test').Page,
    tableId: string,
  ) {
    await page.evaluate((tid) => {
      const prefix = `cne-os:cols:${tid}:`
      Object.keys(localStorage)
        .filter((k) => k.startsWith(prefix))
        .forEach((k) => localStorage.removeItem(k))
    }, tableId)
  }

  // -------------------------------------------------------------------------
  // Helper: descobre a chave exata do localStorage para um tableId,
  // sem precisar conhecer o userId antecipadamente.
  // Retorna null se nenhuma chave existir ainda.
  // -------------------------------------------------------------------------

  async function findStorageKey(
    page: import('@playwright/test').Page,
    tableId: string,
  ): Promise<string | null> {
    return page.evaluate((tid) => {
      const prefix = `cne-os:cols:${tid}:`
      return Object.keys(localStorage).find((k) => k.startsWith(prefix)) ?? null
    }, tableId)
  }

  // =========================================================================
  // CT-COLS-01 — contacts.popover-abre
  //
  // dado admin autenticado em /contacts,
  // quando clica no botão "Personalizar colunas",
  // então popover (role=dialog) fica visível com checkboxes para cada coluna.
  //
  // Verifica: aria-label do botão trigger + presença do popover + checkbox Nome.
  // =========================================================================

  test('given admin autenticado em /contacts, when clica em Personalizar colunas, then popover aparece com checkboxes das colunas', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await clearColumnPreferences(page, 'contacts:list')
    await page.goto('/contacts')

    // Aguarda tabela de contatos carregar (aria-label do thead ou h1)
    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    // Botão trigger do customizer (aria-label="Personalizar colunas" conforme columns-customizer.tsx §54)
    const customizerBtn = page.getByRole('button', { name: /personalizar colunas/i })
    await expect(customizerBtn).toBeVisible()

    await customizerBtn.click()

    // Popover renderizado pelo Radix Popover (role=dialog implicitamente via PopoverContent)
    const popover = page.getByRole('dialog')
    await expect(popover).toBeVisible()

    // Checkboxes das colunas definidas em CONTACT_COLUMNS estão presentes.
    // Usamos o escopo do popover para evitar colisão com labels externos.
    await expect(popover.getByLabel('Nome (coluna obrigatória)')).toBeVisible()
    await expect(popover.getByLabel('E-mail')).toBeVisible()
    await expect(popover.getByLabel('Telefone')).toBeVisible()
    await expect(popover.getByLabel('Classificação')).toBeVisible()
    await expect(popover.getByLabel('Status')).toBeVisible()

    // Sem erro interno
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  // =========================================================================
  // CT-COLS-02 — contacts.alwaysVisible-disabled
  //
  // dado admin autenticado com popover aberto em /contacts,
  // quando verifica coluna "Nome" (alwaysVisible: true em CONTACT_COLUMNS),
  // então checkbox Nome está checked e disabled (não pode ser desligado).
  //
  // Regra: docs/70-ux/12-table-column-customizer.md §4.1 — alwaysVisible aparece
  //   checked + disabled + title="Coluna obrigatória".
  // =========================================================================

  test('given admin autenticado, when popover de /contacts abre, then coluna Nome esta checked e disabled (alwaysVisible)', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await clearColumnPreferences(page, 'contacts:list')
    await page.goto('/contacts')

    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    await page.getByRole('button', { name: /personalizar colunas/i }).click()

    const popover = page.getByRole('dialog')
    await expect(popover).toBeVisible()

    // Checkbox Nome: alwaysVisible=true → aria-label "Nome (coluna obrigatória)" em columns-customizer.tsx §96
    const nomeCheckbox = popover.getByLabel('Nome (coluna obrigatória)')
    await expect(nomeCheckbox).toBeVisible()
    await expect(nomeCheckbox).toBeChecked()

    // disabled — atributo data-disabled (Radix Checkbox usa data-disabled ao invés de disabled nativo)
    // Verificamos pela presença do atributo data-disabled ou disabled conforme implementação shadcn Checkbox
    const isDisabled =
      (await nomeCheckbox.isDisabled()) ||
      (await nomeCheckbox.getAttribute('data-disabled')) !== null

    expect(isDisabled).toBe(true)

    // Coluna "Ações" também é alwaysVisible
    const acoesCheckbox = popover.getByLabel('Ações (coluna obrigatória)')
    await expect(acoesCheckbox).toBeChecked()

    const acoesDisabled =
      (await acoesCheckbox.isDisabled()) ||
      (await acoesCheckbox.getAttribute('data-disabled')) !== null

    expect(acoesDisabled).toBe(true)
  })

  // =========================================================================
  // CT-COLS-03 — contacts.desligar-coluna-esconde-th
  //
  // dado admin autenticado em /contacts com coluna "E-mail" visível,
  // quando abre popover e desmarca checkbox "E-mail",
  // então columnheader "E-mail" desaparece da tabela.
  //
  // Verifica: comportamento UI imediato após toggle (sem reload).
  // Nota: toggle fecha popover automaticamente se o Radix fechar ao blur;
  //   pressionamos Escape para garantir fechamento e verificar o thead limpo.
  // =========================================================================

  test('given admin autenticado em /contacts com E-mail visivel, when desmarca checkbox E-mail, then columnheader E-mail some da tabela', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await clearColumnPreferences(page, 'contacts:list')
    await page.goto('/contacts')

    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    // Confirma que E-mail está visível no thead antes do toggle
    const table = page.getByRole('table', { name: /Lista de contatos/i })
    await expect(table.getByRole('columnheader', { name: /^e-mail$/i })).toBeVisible()

    // Abre popover e desmarca E-mail
    await page.getByRole('button', { name: /personalizar colunas/i }).click()

    const popover = page.getByRole('dialog')
    await expect(popover).toBeVisible()

    const emailCheckbox = popover.getByLabel('E-mail')
    await expect(emailCheckbox).toBeVisible()
    await expect(emailCheckbox).toBeChecked()

    // Clica no checkbox para ocultar E-mail
    await emailCheckbox.click()

    // Fecha popover via Escape
    await page.keyboard.press('Escape')

    // Após ocultar, columnheader E-mail deve sumir (isVisible=false)
    await expect(
      table.getByRole('columnheader', { name: /^e-mail$/i }),
    ).not.toBeVisible()

    // Colunas alwaysVisible continuam presentes
    await expect(table.getByRole('columnheader', { name: /^nome$/i })).toBeVisible()
  })

  // =========================================================================
  // CT-COLS-04 — contacts.toggle-persiste-localStorage
  //
  // dado admin autenticado em /contacts,
  // quando oculta a coluna "E-mail" via toggle,
  // então localStorage contém chave `cne-os:cols:contacts:list:<userId>` com
  //   payload v=1 e `hidden` incluindo "email".
  //
  // Regra: ADR-19 — lista negativa, chave `cne-os:cols:<tableId>:<userId>`.
  // =========================================================================

  test('given admin autenticado, when oculta coluna E-mail em /contacts, then localStorage e atualizado com hidden=[email]', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await clearColumnPreferences(page, 'contacts:list')
    await page.goto('/contacts')

    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    // Oculta E-mail via popover
    await page.getByRole('button', { name: /personalizar colunas/i }).click()

    const popover = page.getByRole('dialog')
    await expect(popover).toBeVisible()

    await popover.getByLabel('E-mail').click()
    await page.keyboard.press('Escape')

    // Aguarda o toggle ser processado (hook escreve em localStorage sincronamente)
    await expect(
      page.getByRole('table', { name: /Lista de contatos/i })
        .getByRole('columnheader', { name: /^e-mail$/i }),
    ).not.toBeVisible()

    // Verifica chave no localStorage (dinâmico — não precisa do userId exato)
    const storageKey = await findStorageKey(page, 'contacts:list')
    expect(storageKey).not.toBeNull()

    // Lê o payload e valida estrutura ADR-19
    const rawPayload = await page.evaluate(
      (key) => localStorage.getItem(key!),
      storageKey,
    )
    expect(rawPayload).not.toBeNull()

    const payload = JSON.parse(rawPayload!) as {
      v: number
      updatedAt: string
      hidden: string[]
    }

    expect(payload.v).toBe(1)
    expect(payload.hidden).toContain('email')
    expect(typeof payload.updatedAt).toBe('string')
  })

  // =========================================================================
  // CT-COLS-05 — contacts.preferencia-persiste-apos-reload
  //
  // dado localStorage com hidden=['email'] para contacts:list,
  // quando admin recarrega /contacts,
  // então coluna "E-mail" permanece oculta (preferência lida do localStorage).
  //
  // Verifica: useEffect do hook lê localStorage após hydratação e aplica estado.
  // Pré-condição: escreve payload diretamente no localStorage antes do reload.
  // =========================================================================

  test('given localStorage com email oculto, when admin recarrega /contacts, then coluna E-mail permanece oculta', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    // Primeiro acesso para obter o userId (necessário para construir a chave exata)
    await page.goto('/contacts')
    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    // Obtém o userId dinamicamente (faz um toggle e captura a chave criada)
    await page.getByRole('button', { name: /personalizar colunas/i }).click()
    const popover = page.getByRole('dialog')
    await expect(popover).toBeVisible()

    // Toggle para forçar criação da chave no localStorage
    await popover.getByLabel('CPF').click() // CPF é defaultHidden=false, safe de toglar
    await page.keyboard.press('Escape')

    // Captura a chave criada
    const storageKey = await findStorageKey(page, 'contacts:list')
    expect(storageKey).not.toBeNull()

    // Escreve a preferência desejada: ocultar email
    await page.evaluate(
      ({ key, payload }) => localStorage.setItem(key!, JSON.stringify(payload)),
      {
        key: storageKey,
        payload: {
          v: 1,
          updatedAt: new Date().toISOString(),
          hidden: ['email'],
        },
      },
    )

    // Reload da página — hook deve ler localStorage e aplicar estado
    await page.reload()

    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    // Após hidratação, E-mail deve estar oculto
    const table = page.getByRole('table', { name: /Lista de contatos/i })
    await expect(
      table.getByRole('columnheader', { name: /^e-mail$/i }),
    ).not.toBeVisible()

    // Colunas alwaysVisible continuam presentes
    await expect(table.getByRole('columnheader', { name: /^nome$/i })).toBeVisible()
  })

  // =========================================================================
  // CT-COLS-06 — contacts.restaurar-padrao
  //
  // dado admin autenticado em /contacts com email e telefone ocultos,
  // quando clica em "Restaurar padrão" no popover,
  // então localStorage é limpo (chave removida) e colunas defaults reaparecem.
  //
  // Regra: ADR-19 — reset() chama localStorage.removeItem(key).
  //   docs/70-ux/12-table-column-customizer.md §8 — "Teste reset: localStorage deve ser limpo".
  // =========================================================================

  test('given admin com email e telefone ocultos em /contacts, when clica Restaurar padrao, then localStorage e limpo e colunas defaults voltam', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/contacts')
    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    // Obtém a chave via toggle de coluna dummy
    await page.getByRole('button', { name: /personalizar colunas/i }).click()
    const popover1 = page.getByRole('dialog')
    await expect(popover1).toBeVisible()
    await popover1.getByLabel('CPF').click()
    await page.keyboard.press('Escape')

    const storageKey = await findStorageKey(page, 'contacts:list')
    expect(storageKey).not.toBeNull()

    // Pré-condição: ocultar email e telefone via localStorage direto
    await page.evaluate(
      ({ key, payload }) => localStorage.setItem(key!, JSON.stringify(payload)),
      {
        key: storageKey,
        payload: {
          v: 1,
          updatedAt: new Date().toISOString(),
          hidden: ['email', 'phone'],
        },
      },
    )

    // Reload para aplicar o estado salvo
    await page.reload()
    await expect(page.locator('h1')).toContainText('Contatos', { timeout: 8_000 })

    const table = page.getByRole('table', { name: /Lista de contatos/i })
    await expect(
      table.getByRole('columnheader', { name: /^e-mail$/i }),
    ).not.toBeVisible()
    await expect(
      table.getByRole('columnheader', { name: /^telefone$/i }),
    ).not.toBeVisible()

    // Abre popover e clica em "Restaurar padrão"
    await page.getByRole('button', { name: /personalizar colunas/i }).click()

    const popover2 = page.getByRole('dialog')
    await expect(popover2).toBeVisible()

    await popover2.getByRole('button', { name: /restaurar padrão/i }).click()

    // localStorage deve ser removido (chave apagada)
    const storedAfterReset = await page.evaluate(
      (key) => localStorage.getItem(key!),
      storageKey,
    )
    expect(storedAfterReset).toBeNull()

    // Colunas defaultVisible voltam a aparecer na tabela
    await expect(
      table.getByRole('columnheader', { name: /^e-mail$/i }),
    ).toBeVisible()
    await expect(
      table.getByRole('columnheader', { name: /^telefone$/i }),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-COLS-07 — offers.smoke-toggle-coluna
  //
  // dado admin autenticado em /offers com ofertas presentes,
  // quando abre popover e desmarca "Marca",
  // então columnheader "Marca" desaparece da tabela.
  //
  // Smoke: verifica que o pattern funciona em /offers (T-16-05).
  // OFFER_COLUMNS: brand (defaultVisible=true), slug/createdAt (defaultHidden).
  //
  // Pré-requisito: ao menos 1 oferta no banco de testes.
  // Se banco vazio, OfferList não renderiza tabela → marcado fixme.
  // =========================================================================

  test('given admin autenticado em /offers com ofertas presentes, when desmarca Marca, then columnheader Marca some', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await clearColumnPreferences(page, 'offers:list')
    await page.goto('/offers')

    await expect(page.locator('h1')).toContainText(/Ofertas/i, { timeout: 8_000 })

    // OfferList só renderiza customizer se offers.length > 0
    const customizerBtn = page.getByRole('button', { name: /personalizar colunas/i })
    const customizerVisible = await customizerBtn.isVisible()

    if (!customizerVisible) {
      test.fixme(
        true,
        'OQ-E2E-COLS-01: banco sem ofertas cadastradas — OfferList não renderiza tabela nem customizer quando offers=[]. Adicionar fixture de oferta para CT-COLS-07.',
      )
      return
    }

    // Confirma Marca visível no thead antes do toggle
    const offersTable = page.getByRole('table', { name: /Lista de ofertas/i })
    await expect(offersTable.getByRole('columnheader', { name: /^marca$/i })).toBeVisible()

    // Toggle: ocultar Marca
    await customizerBtn.click()

    const popover = page.getByRole('dialog')
    await expect(popover).toBeVisible()

    await popover.getByLabel('Marca').click()
    await page.keyboard.press('Escape')

    // Marca some do thead
    await expect(
      offersTable.getByRole('columnheader', { name: /^marca$/i }),
    ).not.toBeVisible()

    // Nome (alwaysVisible) continua presente
    await expect(offersTable.getByRole('columnheader', { name: /^nome$/i })).toBeVisible()
  })

  // =========================================================================
  // CT-COLS-08 — transactions.smoke-toggle-coluna
  //
  // dado admin autenticado em /transactions com transações presentes,
  // quando abre popover e desmarca "Contato",
  // então columnheader "Contato" desaparece da tabela.
  //
  // Smoke: verifica que o pattern funciona em /transactions (T-16-06).
  // TRANSACTION_COLUMNS: date (alwaysVisible), contact/offer/amount/status (defaultVisible).
  //
  // Pré-requisito: ao menos 1 transação no banco de testes.
  // Se banco vazio, TransactionList exibe empty state sem tabela → marcado fixme.
  // =========================================================================

  test('given admin autenticado em /transactions com transacoes presentes, when desmarca Contato, then columnheader Contato some', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await clearColumnPreferences(page, 'transactions:list')
    await page.goto('/transactions')

    await expect(page.locator('h1')).toContainText(/Transações/i, { timeout: 8_000 })

    // TransactionList só renderiza tabela se transactions.length > 0
    const customizerBtn = page.getByRole('button', { name: /personalizar colunas/i })
    const customizerVisible = await customizerBtn.isVisible()

    if (!customizerVisible) {
      test.fixme(
        true,
        'OQ-E2E-COLS-02: banco sem transações cadastradas — TransactionList exibe empty state sem tabela nem customizer. Adicionar fixture de transação para CT-COLS-08.',
      )
      return
    }

    // Confirma Contato visível no thead antes do toggle
    const txTable = page.getByRole('table', { name: /Lista de transacoes/i })
    await expect(txTable.getByRole('columnheader', { name: /^contato$/i })).toBeVisible()

    // Toggle: ocultar Contato
    await customizerBtn.click()

    const popover = page.getByRole('dialog')
    await expect(popover).toBeVisible()

    await popover.getByLabel('Contato').click()
    await page.keyboard.press('Escape')

    // Contato some do thead
    await expect(
      txTable.getByRole('columnheader', { name: /^contato$/i }),
    ).not.toBeVisible()

    // Data (alwaysVisible) continua presente
    await expect(txTable.getByRole('columnheader', { name: /^data$/i })).toBeVisible()
  })
})
