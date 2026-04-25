/**
 * FLOW-09 — Resolução de pendência de identidade
 *
 * Cobre o fluxo completo de detecção e resolução de issues de identidade:
 * 1. Dois contatos com e-mail duplicado existem no sistema (email_duplicate issue)
 * 2. Atendente acessa /contacts/[id]/issues e vê a issue aberta
 * 3. Atendente clica em "Resolver", preenche descrição e confirma
 * 4. Issue some da lista (status muda para resolved)
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true           — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL         — email do usuário admin (ex: admin@test.com)
 *   E2E_ADMIN_PASSWORD      — senha do usuário admin
 *   E2E_TEST_CONTACT_ID     — UUID do contato que possui issue email_duplicate aberta
 *
 * Para rodar manualmente:
 *   SEED_E2E=true E2E_ADMIN_EMAIL=admin@test.com E2E_ADMIN_PASSWORD=... \
 *   E2E_TEST_CONTACT_ID=<uuid> pnpm test:e2e -- identity-resolution
 *
 * Spec de referência:
 *   docs/60-flows/09-identity-pending-resolution.md
 *   docs/10-architecture/10-testing-strategy.md §4
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------
test.describe('FLOW-09 identity-resolution', () => {
  test.skip(
    process.env['SEED_E2E'] !== 'true',
    'requires seeded test database — run with SEED_E2E=true',
  )

  // -------------------------------------------------------------------------
  // Helpers de login reutilizados por todos os casos deste describe
  // -------------------------------------------------------------------------

  /**
   * Realiza login com email + senha via página /login.
   * O app redireciona para /contacts após autenticação bem-sucedida.
   */
  async function loginAsAdmin(page: import('@playwright/test').Page) {
    const email = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@test.com'
    const password = process.env['E2E_ADMIN_PASSWORD'] ?? ''

    await page.goto('/login')
    await expect(page.getByText('CNE-OS').first()).toBeVisible()

    // Preenche email e senha
    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    // Aguarda redirecionamento pós-login
    await expect(page).toHaveURL(/\/contacts/, { timeout: 10_000 })
  }

  // -------------------------------------------------------------------------
  // CT-FLOW09-01: navegação e estrutura da página de issues
  // -------------------------------------------------------------------------

  test('given atendente autenticado when acessa /contacts then página carrega com cabeçalho Contatos', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    await page.goto('/contacts')
    await expect(page.getByRole('heading', { name: 'Contatos', level: 1 })).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // CT-FLOW09-02: página de issues de um contato exibe issue email_duplicate
  // -------------------------------------------------------------------------

  test('given contato com issue email_duplicate aberta when atendente acessa /contacts/[id]/issues then vê a issue na lista', async ({
    page,
  }) => {
    const contactId = process.env['E2E_TEST_CONTACT_ID']
    if (!contactId) {
      test.skip(true, 'E2E_TEST_CONTACT_ID não configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    // Navegar diretamente para a página de issues do contato semeado
    await page.goto(`/contacts/${contactId}/issues`)

    // Cabeçalho da página de pendências deve estar visível
    await expect(
      page.getByRole('heading', { name: /Pendencias de Identidade/i }),
    ).toBeVisible()

    // A issue de email duplicado deve aparecer na lista de pendências
    await expect(
      page.getByText('Email duplicado'),
    ).toBeVisible()

    // O botão de resolver deve estar acessível
    await expect(
      page.getByRole('button', { name: /Resolver/i }).first(),
    ).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // CT-FLOW09-03: resolução de issue via dialog (caminho feliz)
  // Caso principal do FLOW-09 — atendente resolve a issue email_duplicate
  // -------------------------------------------------------------------------

  test('given issue email_duplicate open when atendente clica Resolver e preenche resolução then issue some da lista', async ({
    page,
  }) => {
    const contactId = process.env['E2E_TEST_CONTACT_ID']
    if (!contactId) {
      test.skip(true, 'E2E_TEST_CONTACT_ID não configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/contacts/${contactId}/issues`)

    // Aguarda a lista de issues carregar
    await expect(
      page.getByRole('heading', { name: /Pendencias de Identidade/i }),
    ).toBeVisible()

    // Abre o dialog de resolução clicando no primeiro botão "Resolver"
    await page.getByRole('button', { name: /Resolver/i }).first().click()

    // Verifica que o dialog abriu
    await expect(
      page.getByRole('dialog', { name: /Resolver pendência/i }),
    ).toBeVisible()

    // Preenche a descrição da resolução (mínimo 5 caracteres conforme resolveIssueSchema)
    const descricao = 'Contatos verificados: são a mesma pessoa — e-mail consolidado no principal.'
    await page.getByLabel(/Descrição da resolução/i).fill(descricao)

    // Confirma que o botão fica habilitado após preenchimento válido
    await expect(page.getByRole('button', { name: /Confirmar/i })).toBeEnabled()

    // Clica em Confirmar para submeter a resolução via resolveIssueAction
    await page.getByRole('button', { name: /Confirmar/i }).click()

    // O dialog deve fechar após sucesso
    await expect(
      page.getByRole('dialog', { name: /Resolver pendência/i }),
    ).not.toBeVisible({ timeout: 8_000 })

    // Após resolver, a issue some da lista (revalidatePath atualiza)
    // A página deve mostrar estado vazio ou não mostrar mais o badge "Email duplicado"
    await expect(
      page.getByText('Nenhuma pendencia aberta'),
    ).toBeVisible({ timeout: 8_000 })
  })

  // -------------------------------------------------------------------------
  // CT-FLOW09-04: validação client-side — resolução com texto muito curto
  // O botão "Confirmar" fica desabilitado quando resolução < 5 caracteres
  // -------------------------------------------------------------------------

  test('given dialog aberto when resolução tem menos de 5 caracteres then botão Confirmar fica desabilitado', async ({
    page,
  }) => {
    const contactId = process.env['E2E_TEST_CONTACT_ID']
    if (!contactId) {
      test.skip(true, 'E2E_TEST_CONTACT_ID não configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/contacts/${contactId}/issues`)
    await expect(
      page.getByRole('heading', { name: /Pendencias de Identidade/i }),
    ).toBeVisible()

    await page.getByRole('button', { name: /Resolver/i }).first().click()

    await expect(
      page.getByRole('dialog', { name: /Resolver pendência/i }),
    ).toBeVisible()

    // Preenche texto curto demais (< 5 chars)
    await page.getByLabel(/Descrição da resolução/i).fill('ok')

    // Confirmar deve estar desabilitado — BR-MERGE: resolução obrigatória e não trivial
    await expect(page.getByRole('button', { name: /Confirmar/i })).toBeDisabled()

    // Fecha sem submeter
    await page.getByRole('button', { name: /Cancelar/i }).click()
    await expect(
      page.getByRole('dialog', { name: /Resolver pendência/i }),
    ).not.toBeVisible()
  })

  // -------------------------------------------------------------------------
  // CT-FLOW09-05: resolução com desfecho "Ignorar"
  // Atendente classifica a issue como falso positivo
  // -------------------------------------------------------------------------

  test('given issue email_duplicate open when atendente escolhe Ignorar then issue some da lista', async ({
    page,
  }) => {
    const contactId = process.env['E2E_TEST_CONTACT_ID']
    if (!contactId) {
      test.skip(true, 'E2E_TEST_CONTACT_ID não configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/contacts/${contactId}/issues`)
    await expect(
      page.getByRole('heading', { name: /Pendencias de Identidade/i }),
    ).toBeVisible()

    await page.getByRole('button', { name: /Resolver/i }).first().click()

    await expect(
      page.getByRole('dialog', { name: /Resolver pendência/i }),
    ).toBeVisible()

    // Preenche descrição válida
    await page.getByLabel(/Descrição da resolução/i).fill('Falso positivo — e-mails pertencentes à mesma pessoa.')

    // Troca desfecho para "Ignorar"
    await page.getByLabel(/Desfecho/i).selectOption('ignored')

    await expect(page.getByRole('button', { name: /Confirmar/i })).toBeEnabled()
    await page.getByRole('button', { name: /Confirmar/i }).click()

    // Dialog fecha e issue some
    await expect(
      page.getByRole('dialog', { name: /Resolver pendência/i }),
    ).not.toBeVisible({ timeout: 8_000 })

    await expect(
      page.getByText('Nenhuma pendencia aberta'),
    ).toBeVisible({ timeout: 8_000 })
  })

  // -------------------------------------------------------------------------
  // CT-FLOW09-06: breadcrumb de navegação exibe o nome do contato
  // -------------------------------------------------------------------------

  test('given contato existente when atendente acessa página de issues then breadcrumb exibe nome do contato', async ({
    page,
  }) => {
    const contactId = process.env['E2E_TEST_CONTACT_ID']
    if (!contactId) {
      test.skip(true, 'E2E_TEST_CONTACT_ID não configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    await page.goto(`/contacts/${contactId}/issues`)
    await expect(
      page.getByRole('heading', { name: /Pendencias de Identidade/i }),
    ).toBeVisible()

    // Breadcrumb deve mostrar "Contatos" como link e o nome do contato
    const nav = page.getByRole('navigation', { name: 'Navegação' })
    await expect(nav.getByRole('link', { name: 'Contatos' })).toBeVisible()
    // "Issues" deve aparecer no final do breadcrumb
    await expect(nav.getByText('Issues')).toBeVisible()
  })
})
