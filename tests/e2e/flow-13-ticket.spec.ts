/**
 * FLOW-13 — Ciclo de vida completo de um ticket
 *
 * Cobre os casos de abertura, mudança de status, reabertura, adição de nota
 * e comportamento do ticket em estado terminal (cancelled).
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true              — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL            — email do usuário admin
 *   E2E_ADMIN_PASSWORD         — senha do usuário admin
 *   E2E_TEST_CONTACT_ID        — UUID de um contato existente (para abrir ticket)
 *   E2E_TEST_BRAND_ID          — UUID de uma brand existente (necessário para openTicketAction)
 *   E2E_TEST_TICKET_ID         — UUID de um ticket existente com status 'open' (usado em casos 3–6)
 *   E2E_TEST_CANCELLED_TICKET_ID — UUID de um ticket com status 'cancelled' (caso 7)
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=admin@test.com \
 *   E2E_ADMIN_PASSWORD=... \
 *   E2E_TEST_CONTACT_ID=<uuid> \
 *   E2E_TEST_BRAND_ID=<uuid> \
 *   E2E_TEST_TICKET_ID=<uuid> \
 *   E2E_TEST_CANCELLED_TICKET_ID=<uuid> \
 *   pnpm test:e2e -- flow-13-ticket
 *
 * Spec de referência:
 *   docs/20-domain/06-ticket.md
 *   docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-17)
 *   docs/10-architecture/10-testing-strategy.md §4
 *
 * Nota sobre o caso 7 (ticket.cancelled-terminal):
 *   Segundo a matriz de transições em docs/20-domain/06-ticket.md §6,
 *   `cancelled → open` é uma reabertura válida. A implementação em
 *   components/ticket/ticket-status-select.tsx reflete isso:
 *   TRANSITIONS['cancelled'] = ['open']. Portanto, o select EXIBE "Aberto"
 *   como única opção disponível. O caso verifica que apenas a opção de
 *   reabertura ('Aberto') está presente e que opções de progresso
 *   (in_progress, waiting_reply, resolved) não estão disponíveis.
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// ---------------------------------------------------------------------------
test.describe('FLOW-13 ticket-lifecycle', () => {
  test.skip(
    process.env['SEED_E2E'] !== 'true',
    'requires seeded test database — run with SEED_E2E=true',
  )

  // -------------------------------------------------------------------------
  // Helper: login como admin via /login (email + senha)
  // -------------------------------------------------------------------------

  async function loginAsAdmin(page: import('@playwright/test').Page) {
    const email = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@test.com'
    const password = process.env['E2E_ADMIN_PASSWORD'] ?? ''

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'CNE-OS' })).toBeVisible()

    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    // Aguarda redirecionamento pós-login
    await page.waitForURL(/\/(tickets|contacts|dashboard)/, { timeout: 10_000 })
  }

  // =========================================================================
  // CT-FLOW13-01 — tickets.list-loads
  // dado usuário logado, quando acessa /tickets, então lista carrega
  // =========================================================================

  test('given usuario logado, when acessa /tickets, then heading Tickets e conteudo sao visiveis', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    await page.goto('/tickets')

    // Heading principal da página de lista de tickets
    await expect(
      page.getByRole('heading', { name: 'Tickets', level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // Grupo de filtros de status (aria-label definido em tickets/page.tsx)
    await expect(
      page.getByRole('group', { name: 'Filtrar por status' }),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW13-02 — ticket.open-from-button
  // dado página /tickets, quando clica em "Novo ticket" / "Abrir ticket",
  // preenche título/categoria/prioridade e confirma, então ticket aparece na lista
  // =========================================================================

  test('given pagina /tickets, when abre dialog e preenche titulo/categoria/prioridade, then ticket aparece na lista com status Aberto', async ({
    page,
  }) => {
    const contactId = process.env['E2E_TEST_CONTACT_ID']
    const brandId = process.env['E2E_TEST_BRAND_ID']

    if (!contactId || !brandId) {
      test.skip(
        true,
        'E2E_TEST_CONTACT_ID e E2E_TEST_BRAND_ID necessarios — pular este caso',
      )
      return
    }

    await loginAsAdmin(page)

    // Navega para o detalhe de um contato para usar o OpenTicketButton
    // O componente OpenTicketButton recebe contactId + brandId como props,
    // portanto é renderizado via /contacts/[id] ou equivalente.
    // Como o /tickets não renderiza o OpenTicketButton diretamente nesta sprint,
    // usamos a rota do contato que possui o botão integrado.
    // Se o botão estiver disponível em /tickets, adapte o goto abaixo.
    await page.goto('/tickets')

    // Verifica que a página de lista carregou
    await expect(
      page.getByRole('heading', { name: 'Tickets', level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // Localiza o botão trigger do dialog "Abrir ticket"
    // O label padrão do componente OpenTicketButton é "Abrir ticket"
    const openButton = page.getByRole('button', { name: /Abrir ticket/i }).first()
    await expect(openButton).toBeVisible()
    await openButton.click()

    // Dialog deve abrir com título "Abrir ticket"
    await expect(
      page.getByRole('dialog', { name: /Abrir ticket/i }),
    ).toBeVisible({ timeout: 5_000 })

    // Preenche o formulário
    const uniqueTitle = `Ticket E2E ${Date.now()}`
    await page.getByLabel(/Titulo/i).fill(uniqueTitle)
    await page.getByLabel(/Categoria/i).selectOption('support')
    await page.getByLabel(/Prioridade/i).selectOption('high')

    // Confirma abertura
    await page.getByRole('button', { name: /^Abrir ticket$/ }).click()

    // Dialog deve fechar após sucesso
    await expect(
      page.getByRole('dialog', { name: /Abrir ticket/i }),
    ).not.toBeVisible({ timeout: 8_000 })

    // O ticket recém-criado deve aparecer na lista com badge "Aberto"
    await expect(
      page.getByText(uniqueTitle),
    ).toBeVisible({ timeout: 8_000 })

    await expect(
      page.getByText('Aberto').first(),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW13-03 — ticket.detail-loads
  // dado ticket criado, quando acessa /tickets/[id],
  // então header com número e título são visíveis
  // =========================================================================

  test('given ticket existente, when acessa /tickets/[id], then numero e titulo sao visiveis no header', async ({
    page,
  }) => {
    const ticketId = process.env['E2E_TEST_TICKET_ID']

    if (!ticketId) {
      test.skip(true, 'E2E_TEST_TICKET_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/tickets/${ticketId}`)

    // Breadcrumb deve mostrar link "Tickets"
    const nav = page.getByRole('navigation', { name: 'Navegacao' })
    await expect(nav.getByRole('link', { name: 'Tickets' })).toBeVisible({ timeout: 8_000 })

    // O número do ticket (formato #NNN) deve estar visível no breadcrumb
    await expect(nav.getByText(/^#\d+$/)).toBeVisible()

    // O título do ticket deve aparecer como heading h1
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW13-04 — ticket.change-status-to-resolved
  // dado ticket open em /tickets/[id], quando muda status para resolved
  // via dropdown, então badge de status atualiza para "Resolvido"
  // =========================================================================

  test('given ticket open em /tickets/[id], when seleciona Resolvido no dropdown de status, then badge atualiza para Resolvido', async ({
    page,
  }) => {
    const ticketId = process.env['E2E_TEST_TICKET_ID']

    if (!ticketId) {
      test.skip(true, 'E2E_TEST_TICKET_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/tickets/${ticketId}`)

    // Aguarda o detalhe carregar
    await expect(
      page.getByRole('navigation', { name: 'Navegacao' }),
    ).toBeVisible({ timeout: 8_000 })

    // O select de alteração de status tem aria-label "Alterar status do ticket"
    const statusSelect = page.getByRole('combobox', { name: 'Alterar status do ticket' })
    await expect(statusSelect).toBeVisible()

    // Seleciona "Resolvido"
    await statusSelect.selectOption('resolved')

    // Aguarda a navegação/revalidação após a mudança de status
    // O Server Component recarrega com o novo status
    await page.waitForLoadState('networkidle', { timeout: 10_000 })

    // Badge de status no header do ticket deve mostrar "Resolvido"
    // O badge usa o texto do STATUS_LABELS['resolved'] = 'Resolvido'
    const statusBadge = page.locator('.bg-green-100').filter({ hasText: 'Resolvido' })
    await expect(statusBadge).toBeVisible({ timeout: 8_000 })
  })

  // =========================================================================
  // CT-FLOW13-05 — ticket.reopen
  // dado ticket resolved, quando muda status para open,
  // então status volta para "Aberto" (reabertura válida — INV-TICKET-05)
  // =========================================================================

  test('given ticket resolved, when seleciona Aberto no dropdown de status, then badge volta para Aberto', async ({
    page,
  }) => {
    const ticketId = process.env['E2E_TEST_TICKET_ID']

    if (!ticketId) {
      test.skip(true, 'E2E_TEST_TICKET_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/tickets/${ticketId}`)

    // Aguarda o detalhe carregar
    await expect(
      page.getByRole('navigation', { name: 'Navegacao' }),
    ).toBeVisible({ timeout: 8_000 })

    const statusSelect = page.getByRole('combobox', { name: 'Alterar status do ticket' })
    await expect(statusSelect).toBeVisible()

    // Primeiro resolve o ticket (pode já estar resolved — idempotente para este teste)
    // Tenta selecionar 'resolved'; se não disponível (já resolved), segue.
    const resolvedOption = statusSelect.locator('option[value="resolved"]')
    const resolvedOptionCount = await resolvedOption.count()

    if (resolvedOptionCount > 0) {
      await statusSelect.selectOption('resolved')
      await page.waitForLoadState('networkidle', { timeout: 10_000 })
    }

    // Agora reabre: seleciona 'open' (INV-TICKET-05: resolved → open é reabertura válida)
    const statusSelectAfter = page.getByRole('combobox', { name: 'Alterar status do ticket' })
    await expect(statusSelectAfter).toBeVisible({ timeout: 8_000 })
    await statusSelectAfter.selectOption('open')

    await page.waitForLoadState('networkidle', { timeout: 10_000 })

    // Badge de status deve voltar para "Aberto"
    const statusBadge = page.locator('.bg-blue-100').filter({ hasText: 'Aberto' })
    await expect(statusBadge).toBeVisible({ timeout: 8_000 })
  })

  // =========================================================================
  // CT-FLOW13-06 — ticket.add-note
  // dado ticket em detalhe, quando adiciona nota interna,
  // então nota aparece na lista com badge "Interna"
  // =========================================================================

  test('given ticket em /tickets/[id], when adiciona nota interna, then nota aparece na lista com badge Interna', async ({
    page,
  }) => {
    const ticketId = process.env['E2E_TEST_TICKET_ID']

    if (!ticketId) {
      test.skip(true, 'E2E_TEST_TICKET_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/tickets/${ticketId}`)

    // Aguarda o detalhe carregar (heading h2 "Notas" na seção de notas)
    await expect(
      page.getByRole('heading', { name: /^Notas/, level: 2 }),
    ).toBeVisible({ timeout: 8_000 })

    // Preenche o corpo da nota
    const noteText = `Nota interna E2E ${Date.now()}`
    const noteTextarea = page.getByLabel(/Nova nota/i)
    await expect(noteTextarea).toBeVisible()
    await noteTextarea.fill(noteText)

    // O checkbox "Nota interna (apenas agentes)" deve estar marcado por padrão
    const internalCheckbox = page.getByRole('checkbox', {
      name: /Nota interna/i,
    })
    await expect(internalCheckbox).toBeChecked()

    // Submete a nota
    await page.getByRole('button', { name: /Adicionar nota/i }).click()

    // Aguarda o formulário resetar e a lista atualizar
    await page.waitForLoadState('networkidle', { timeout: 10_000 })

    // A nota deve aparecer na lista de notas com o texto e badge "Interna"
    const notesList = page.getByRole('list', { name: 'Notas do ticket' })
    await expect(notesList.getByText(noteText)).toBeVisible({ timeout: 8_000 })
    await expect(notesList.getByText('Interna').last()).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW13-07 — ticket.cancelled-terminal
  // dado ticket cancelled, quando acessa /tickets/[id],
  // então o select de status só exibe a opção de reabertura (Aberto)
  // e não exibe opções de progressão (in_progress, waiting_reply, resolved).
  //
  // Nota: segundo docs/20-domain/06-ticket.md §6, cancelled → open é reabertura
  // válida (INV-TICKET-05). O componente TicketStatusSelect renderiza um <select>
  // com TRANSITIONS['cancelled'] = ['open']. Portanto, o estado cancelled NÃO é
  // completamente terminal — oferece apenas reabertura.
  // =========================================================================

  test('given ticket cancelled, when acessa /tickets/[id], then dropdown exibe apenas opcao de reabrir (Aberto) sem opcoes de progressao', async ({
    page,
  }) => {
    const cancelledTicketId = process.env['E2E_TEST_CANCELLED_TICKET_ID']

    if (!cancelledTicketId) {
      test.skip(
        true,
        'E2E_TEST_CANCELLED_TICKET_ID nao configurado — pular este caso',
      )
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/tickets/${cancelledTicketId}`)

    // Aguarda o detalhe carregar
    await expect(
      page.getByRole('navigation', { name: 'Navegacao' }),
    ).toBeVisible({ timeout: 8_000 })

    // O select "Alterar status do ticket" deve estar presente
    const statusSelect = page.getByRole('combobox', { name: 'Alterar status do ticket' })
    await expect(statusSelect).toBeVisible()

    // Opção de reabertura deve estar disponível
    await expect(
      statusSelect.locator('option[value="open"]'),
    ).toHaveCount(1)

    // Opções de progressão NÃO devem estar disponíveis para ticket cancelled
    await expect(
      statusSelect.locator('option[value="in_progress"]'),
    ).toHaveCount(0)

    await expect(
      statusSelect.locator('option[value="waiting_reply"]'),
    ).toHaveCount(0)

    await expect(
      statusSelect.locator('option[value="resolved"]'),
    ).toHaveCount(0)

    // Badge no header deve indicar status "Cancelado"
    const cancelledBadge = page.locator('.bg-slate-100').filter({ hasText: 'Cancelado' }).first()
    await expect(cancelledBadge).toBeVisible()
  })
})
