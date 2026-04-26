/**
 * T-15-07 — settings-integrations.spec.ts
 *
 * Testes E2E para /settings/integrations e /settings/integrations/[provider].
 *
 * Casos cobertos:
 *   CT-INT-01: admin navega para /settings/integrations → 5 cards de provedor visíveis
 *   CT-INT-02: card WhatsApp (kind=channel) é clicável → leva para /settings/integrations/whatsapp_official
 *   CT-INT-03: página /settings/integrations/whatsapp_official carrega com h1 e seção "Contas configuradas"
 *   CT-INT-04: estado inicial (sem channel_accounts) exibe mensagem "Nenhuma conta configurada"
 *   CT-INT-05: formulário "Adicionar conta" — validação client-side (submit sem campos → erro inline)
 *   CT-INT-06: formulário write-only — campo de credencial é do tipo password (não exibe plaintext)
 *   CT-INT-07: card Brevo (kind=placeholder) exibe badge "Em breve" e não é clicável como link
 *   CT-INT-08: card Digital Guru (kind=webhook) clicável → /settings/integrations/digital_guru carrega read-only
 *   CT-INT-09: página Digital Guru exibe variáveis de ambiente + mensagem sobre migração Sprint 16
 *   CT-INT-10: login como non-admin sem permission integration.configure → submit do form retorna UNAUTHORIZED
 *
 * Regras cobertas:
 *   BR-RBAC: integration.configure requer admin + 2FA
 *   ADR-18: credentials são write-only — campos type=password, sem valor pré-preenchido
 *   T-15-03 (domínio channel) + T-15-05 (UI integrations)
 *   docs/80-roadmap/12-sprint-15-rbac-integrations.md T-15-07
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true              — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL            — email do usuário admin (role=admin)
 *   E2E_ADMIN_PASSWORD         — senha do usuário admin
 *   E2E_NONADMIN_EMAIL         — email de usuário não-admin [opcional — CT-INT-10]
 *   E2E_NONADMIN_PASSWORD      — senha do usuário não-admin [opcional]
 *   E2E_TEST_BRAND_ID          — UUID de brand ativa para usar no form [opcional — CT-INT-05 submit]
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=tiagomenna@gmail.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   pnpm test:e2e -- settings-integrations
 *
 * Notas arquiteturais:
 *   - CT-INT-04 (estado vazio) só garante o texto "Nenhuma conta configurada" se o banco
 *     de testes não tiver channel_accounts. Em banco populado, pode já ter contas — este
 *     caso testa a estrutura, não o dado.
 *   - CT-INT-10 (non-admin UNAUTHORIZED) requer E2E_NONADMIN_EMAIL configurado. Sem ele,
 *     o caso é marcado como fixme.
 *   - O E2E real do fluxo completo (form submit → conta aparece na lista) requer banco em
 *     estado conhecido + brand_id. Marcado como best-effort com test.fixme se E2E_TEST_BRAND_ID
 *     não estiver configurado.
 *
 * Spec de referência:
 *   docs/80-roadmap/12-sprint-15-rbac-integrations.md T-15-07
 *   docs/10-architecture/10-testing-strategy.md §4
 *   app/(app)/settings/integrations/page.tsx
 *   app/(app)/settings/integrations/[provider]/page.tsx
 *   components/settings/integration-card.tsx
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------

test.describe('T-15-07 settings-integrations', () => {
  test.skip(
    process.env['SEED_E2E'] !== 'true',
    'requires seeded test database — run with SEED_E2E=true',
  )

  // -------------------------------------------------------------------------
  // Helper: login como admin via /login (email + senha)
  // Padrão idêntico ao usado em analytics-smoke, automation-dispatch, flow-07.
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
  // Helper: login como usuário não-admin (ex: role=support)
  // Requer E2E_NONADMIN_EMAIL + E2E_NONADMIN_PASSWORD configurados.
  // -------------------------------------------------------------------------

  async function loginAsNonAdmin(page: import('@playwright/test').Page) {
    const email = process.env['E2E_NONADMIN_EMAIL']
    const password = process.env['E2E_NONADMIN_PASSWORD'] ?? ''

    if (!email) {
      throw new Error(
        'E2E_NONADMIN_EMAIL nao configurado — pré-requisito para teste de acesso não-admin',
      )
    }

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

  // =========================================================================
  // CT-INT-01 — integrations.hub-5-cards
  //
  // dado admin autenticado,
  // quando navega para /settings/integrations,
  // então 5 cards de provedores estão visíveis:
  //   Digital Guru, Brevo, WhatsApp (Meta), Instagram, Notazz.
  // =========================================================================

  test('given admin autenticado, when navega para /settings/integrations, then 5 cards de provedores estao visiveis', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations')

    // Heading principal
    await expect(page.locator('h1')).toContainText('Integrações', { timeout: 8_000 })

    // Sem erro interno
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    await expect(page.locator('body')).not.toContainText('Application error')

    // Os 5 provedores definidos em INTEGRATION_PROVIDERS
    const expectedProviders = [
      'Digital Guru',
      'Brevo',
      'WhatsApp (Meta)',
      'Instagram',
      'Notazz',
    ]

    for (const providerName of expectedProviders) {
      await expect(page.getByText(providerName)).toBeVisible()
    }
  })

  // =========================================================================
  // CT-INT-02 — integrations.whatsapp-card-clicavel
  //
  // dado admin autenticado em /settings/integrations,
  // quando clica no card "WhatsApp (Meta)" (kind=channel),
  // então navega para /settings/integrations/whatsapp_official.
  // =========================================================================

  test('given admin autenticado em /settings/integrations, when clica no card WhatsApp, then navega para /settings/integrations/whatsapp_official', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations')

    await expect(page.locator('h1')).toContainText('Integrações', { timeout: 8_000 })

    // O IntegrationCard wraps non-placeholder providers em <Link> com aria-label "Configurar {displayName}"
    const whatsappLink = page.getByRole('link', { name: /Configurar WhatsApp/i })
    await expect(whatsappLink).toBeVisible()

    await whatsappLink.click()

    // Aguarda navegação para /settings/integrations/whatsapp_official
    await expect(page).toHaveURL(/\/settings\/integrations\/whatsapp_official/, {
      timeout: 8_000,
    })
  })

  // =========================================================================
  // CT-INT-03 — integrations.whatsapp-page-carrega
  //
  // dado admin autenticado,
  // quando navega para /settings/integrations/whatsapp_official,
  // então página carrega com h1 "WhatsApp (Meta)", seção "Contas configuradas"
  //   e seção "Adicionar nova conta".
  // =========================================================================

  test('given admin autenticado, when navega para /settings/integrations/whatsapp_official, then pagina carrega com secoes esperadas', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations/whatsapp_official')

    // Heading do provider
    await expect(page.locator('h1')).toContainText('WhatsApp (Meta)', { timeout: 8_000 })

    // Seção "Contas configuradas" (aria-labelledby="accounts-title")
    await expect(page.getByRole('heading', { name: /Contas configuradas/i })).toBeVisible()

    // Seção "Adicionar nova conta" (CardTitle com id="add-account-title")
    await expect(page.getByRole('heading', { name: /Adicionar nova conta/i })).toBeVisible()

    // Link de volta para /settings/integrations
    const backLink = page.getByRole('navigation', { name: /Navegação de volta/i })
      .getByRole('link')
    await expect(backLink).toBeVisible()
    await expect(backLink).toHaveAttribute('href', '/settings/integrations')

    // Sem erro interno
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })

  // =========================================================================
  // CT-INT-04 — integrations.lista-vazia
  //
  // dado admin autenticado em /settings/integrations/whatsapp_official,
  // quando nenhuma channel_account foi configurada para WhatsApp,
  // então a seção "Contas configuradas" exibe mensagem "Nenhuma conta configurada".
  //
  // Nota: este caso só é garantido se o banco de testes não tiver channel_accounts
  // de WhatsApp. Se o banco tiver contas, o teste verifica apenas que a lista existe.
  // =========================================================================

  test('given banco sem channel_accounts de WhatsApp, when acessa pagina do provider, then lista exibe Nenhuma conta configurada ou lista de contas', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations/whatsapp_official')

    await expect(page.locator('h1')).toContainText('WhatsApp (Meta)', { timeout: 8_000 })

    // Verifica que a seção de contas carregou (sem 500)
    await expect(page.getByRole('heading', { name: /Contas configuradas/i })).toBeVisible()

    // Pode estar vazia (ChannelAccountsList empty state) ou ter contas (Table)
    const emptyState = page.getByText('Nenhuma conta configurada')
    const accountsTable = page.getByRole('table')

    const hasEmpty = await emptyState.isVisible()
    const hasTable = await accountsTable.isVisible()

    // Um dos dois deve ser verdadeiro — a UI está em estado válido
    expect(hasEmpty || hasTable).toBe(true)

    // Se vazio, verifica o aria-label do empty state (ChannelAccountsList)
    if (hasEmpty) {
      await expect(
        page.locator('[role="status"]', { hasText: /Nenhuma conta configurada/i }),
      ).toBeVisible()
      // Dica para usuário adicionar conta
      await expect(page.getByText(/Use o formulário abaixo/i)).toBeVisible()
    }
  })

  // =========================================================================
  // CT-INT-05 — integrations.form-validacao-client
  //
  // dado admin autenticado em /settings/integrations/whatsapp_official,
  // quando submete o formulário "Adicionar conta" sem preencher campos obrigatórios,
  // então erros de validação inline aparecem sem navegar para outra página.
  //
  // Verifica client-side validation (ProviderConfigForm.validate()) antes de chamar
  // a Server Action createChannelAccountAction.
  // =========================================================================

  test('given admin autenticado no form de whatsapp, when submit sem campos obrigatorios, then erros de validacao sao exibidos inline', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations/whatsapp_official')

    await expect(page.locator('h1')).toContainText('WhatsApp (Meta)', { timeout: 8_000 })

    // Verifica que o formulário existe
    const form = page.getByRole('heading', { name: /Adicionar nova conta/i })
    await expect(form).toBeVisible()

    // Tenta submeter sem preencher nada
    const submitButton = page.getByRole('button', { name: /Adicionar conta/i })
    await expect(submitButton).toBeVisible()
    await submitButton.click()

    // Mensagens de erro de validação client-side devem aparecer
    // ProviderConfigForm.validate() gera erros para: brandId, externalId, credentialFields
    // As mensagens são renderizadas em <p role="alert">
    const alerts = page.getByRole('alert')
    const count = await alerts.count()
    expect(count).toBeGreaterThan(0)

    // Pelo menos um erro referente a "Selecione uma marca" ou ID externo
    const hasExpectedError =
      (await page.getByText(/Selecione uma marca/i).isVisible()) ||
      (await page.getByText(/é obrigatório/i).first().isVisible())
    expect(hasExpectedError).toBe(true)

    // A página não navegou para outro lugar
    await expect(page).toHaveURL(/\/settings\/integrations\/whatsapp_official/)
  })

  // =========================================================================
  // CT-INT-06 — integrations.campos-write-only
  //
  // dado admin autenticado em /settings/integrations/whatsapp_official,
  // quando a página carrega com o formulário "Adicionar conta",
  // então campos de credencial (App Secret, Access Token, Phone Number ID)
  //   são do tipo "password" (write-only — ADR-18).
  //
  // ADR-18: credentials são encriptadas — UI nunca exibe plaintext.
  // =========================================================================

  test('given admin autenticado, when formulario de whatsapp carrega, then campos de credencial sao do tipo password (write-only ADR-18)', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations/whatsapp_official')

    await expect(page.locator('h1')).toContainText('WhatsApp (Meta)', { timeout: 8_000 })

    // Campos definidos em CREDENTIAL_FIELDS para whatsapp_official:
    //   app_secret (id="cred-app_secret")
    //   access_token (id="cred-access_token")
    //   phone_number_id (id="cred-phone_number_id")
    const credentialFieldIds = [
      'cred-app_secret',
      'cred-access_token',
      'cred-phone_number_id',
    ]

    for (const fieldId of credentialFieldIds) {
      const input = page.locator(`#${fieldId}`)
      // Pode não existir se a seção de formulário não for renderizada (ex: sem brands)
      if (await input.isVisible()) {
        // ADR-18: type=password para nunca expor o valor em texto plano
        await expect(input).toHaveAttribute('type', 'password')
        // autoComplete=off para não salvar em browser
        await expect(input).toHaveAttribute('autocomplete', 'off')
      }
    }

    // Verifica também a nota textual sobre write-only
    await expect(
      page.getByText(/Campos de token são write-only/i),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-INT-07 — integrations.brevo-placeholder
  //
  // dado admin autenticado em /settings/integrations,
  // quando a página carrega,
  // então o card "Brevo" exibe badge "Em breve" e NÃO é um link clicável
  //   para /settings/integrations/brevo.
  //
  // Regra: kind='placeholder' → sem link (IntegrationCard renderiza CardBody sem <Link>).
  // =========================================================================

  test('given admin autenticado, when acessa /settings/integrations, then card Brevo exibe Em breve e nao e clicavel como link', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations')

    await expect(page.locator('h1')).toContainText('Integrações', { timeout: 8_000 })

    // Texto "Brevo" existe na página
    await expect(page.getByText('Brevo')).toBeVisible()

    // Badge "Em breve" visível (IntegrationCard kind=placeholder)
    await expect(page.getByText('Em breve')).toBeVisible()

    // NÃO deve haver link "Configurar Brevo" (kind=placeholder → sem <Link>)
    await expect(
      page.getByRole('link', { name: /Configurar Brevo/i }),
    ).not.toBeVisible()
  })

  // =========================================================================
  // CT-INT-08 — integrations.digital-guru-clicavel
  //
  // dado admin autenticado em /settings/integrations,
  // quando clica no card "Digital Guru" (kind=webhook),
  // então navega para /settings/integrations/digital_guru.
  // =========================================================================

  test('given admin autenticado em /settings/integrations, when clica no card Digital Guru, then navega para /settings/integrations/digital_guru', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations')

    await expect(page.locator('h1')).toContainText('Integrações', { timeout: 8_000 })

    // Card Digital Guru é link com aria-label "Configurar Digital Guru"
    const dgLink = page.getByRole('link', { name: /Configurar Digital Guru/i })
    await expect(dgLink).toBeVisible()

    await dgLink.click()

    await expect(page).toHaveURL(/\/settings\/integrations\/digital_guru/, {
      timeout: 8_000,
    })
  })

  // =========================================================================
  // CT-INT-09 — integrations.digital-guru-read-only
  //
  // dado admin autenticado em /settings/integrations/digital_guru,
  // quando a página carrega (kind=webhook),
  // então exibe variáveis de ambiente, badge de status,
  //   e mensagem sobre migração para Sprint 16.
  // Não há formulário de edição de credenciais para kind=webhook.
  // =========================================================================

  test('given admin autenticado, when acessa /settings/integrations/digital_guru, then pagina read-only com vars de ambiente e nota Sprint 16', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/integrations/digital_guru')

    // Heading do provider
    await expect(page.locator('h1')).toContainText('Digital Guru', { timeout: 8_000 })

    // Sem erro interno
    await expect(page.locator('body')).not.toContainText('Internal Server Error')

    // Card com CardTitle "Configuração via variável de ambiente"
    await expect(
      page.getByRole('heading', { name: /Configuração via variável de ambiente/i }),
    ).toBeVisible()

    // Lista de env vars (ul[role=list][aria-label="Variáveis de ambiente"])
    const envVarList = page.getByRole('list', { name: /Variáveis de ambiente/i })
    await expect(envVarList).toBeVisible()

    // Env var DIGITAL_GURU_WEBHOOK_SECRET deve aparecer na lista
    await expect(envVarList.getByText('DIGITAL_GURU_WEBHOOK_SECRET')).toBeVisible()

    // Nota sobre migração Sprint 16
    await expect(
      page.getByText(/Sprint 16/i),
    ).toBeVisible()

    // NÃO deve ter formulário de "Adicionar conta" (kind=webhook → sem ProviderConfigForm)
    await expect(
      page.getByRole('heading', { name: /Adicionar nova conta/i }),
    ).not.toBeVisible()

    // Link de volta para /settings/integrations
    const backNav = page.getByRole('navigation', { name: /Navegação de volta/i })
    await expect(backNav).toBeVisible()
  })

  // =========================================================================
  // CT-INT-10 — integrations.non-admin-unauthorized
  //
  // dado usuário não-admin (sem permission integration.configure),
  // quando submete o form "Adicionar conta" em /settings/integrations/whatsapp_official,
  // então a Server Action retorna UNAUTHORIZED e a UI exibe toast/alert de erro.
  //
  // BR-RBAC: integration.configure requer admin + 2FA.
  // Guard: requirePermission(ctx, 'integration.configure', { kind: 'global' }).
  //
  // Pré-requisito: E2E_NONADMIN_EMAIL configurado + banco com pelo menos 1 brand ativa.
  // Se não configurado, marcado como fixme.
  // =========================================================================

  test('given usuario nao-admin, when submete form de canal com dados validos, then action retorna UNAUTHORIZED e erro e exibido', async ({
    page,
  }) => {
    const nonAdminEmail = process.env['E2E_NONADMIN_EMAIL']
    const testBrandId = process.env['E2E_TEST_BRAND_ID']

    if (!nonAdminEmail) {
      test.fixme(
        true,
        'OQ-E2E-INT-01: E2E_NONADMIN_EMAIL nao configurado — requer fixture de usuario sem integration.configure para CT-INT-10. Registrado em docs/90-meta/03-open-questions-log.md.',
      )
      return
    }

    if (!testBrandId) {
      test.fixme(
        true,
        'OQ-E2E-INT-02: E2E_TEST_BRAND_ID nao configurado — requer UUID de brand ativa para submissao do form em CT-INT-10. Registrado em docs/90-meta/03-open-questions-log.md.',
      )
      return
    }

    await loginAsNonAdmin(page)
    await page.goto('/settings/integrations/whatsapp_official')

    // Se a página redirecionar ou mostrar 403, o teste captura isso
    const url = page.url()
    if (!url.includes('/settings/integrations/whatsapp_official')) {
      // Redirecionado — UNAUTHORIZED ou middleware bloqueou antes da UI
      // Este é um comportamento válido — a BR foi cumprida
      expect(url).not.toContain('/settings/integrations/whatsapp_official')
      return
    }

    await expect(page.locator('h1')).toContainText('WhatsApp (Meta)', { timeout: 8_000 })

    // A página pode carregar mas o submit da Server Action vai falhar com UNAUTHORIZED.
    // Vamos preencher campos mínimos e submeter.

    const addAccountSection = page.getByRole('heading', { name: /Adicionar nova conta/i })
    if (!(await addAccountSection.isVisible())) {
      // Sem formulário visível (ex: sem brands) — não podemos testar o submit
      test.fixme(
        true,
        'OQ-E2E-INT-02: formulario de adicionar conta nao visivel (sem brands?) — CT-INT-10 incompleto',
      )
      return
    }

    // External ID input (id="external-id-input")
    const externalIdInput = page.locator('#external-id-input')
    await externalIdInput.fill('123456789012345')

    // Credential fields (type=password)
    const appSecretInput = page.locator('#cred-app_secret')
    if (await appSecretInput.isVisible()) {
      await appSecretInput.fill('fake-app-secret-for-test')
    }
    const accessTokenInput = page.locator('#cred-access_token')
    if (await accessTokenInput.isVisible()) {
      await accessTokenInput.fill('fake-access-token-for-test')
    }
    const phoneNumberIdInput = page.locator('#cred-phone_number_id')
    if (await phoneNumberIdInput.isVisible()) {
      await phoneNumberIdInput.fill('123456789012345')
    }

    // Submit
    const submitButton = page.getByRole('button', { name: /Adicionar conta/i })
    await submitButton.click()

    // Aguarda resposta da Server Action (pode demorar até 5s)
    await page.waitForTimeout(3_000)

    // O resultado esperado é um toast de erro ou alert com mensagem de não autorizado.
    // ProviderConfigForm exibe toast.error(result.error.message) quando !result.ok.
    // Verificamos que a página não redireciona para "sucesso" e exibe algum indicador de erro.
    await expect(page).toHaveURL(/\/settings\/integrations\/whatsapp_official/)

    // Se toast aparecer com mensagem de erro, valida
    // Sonner toasts têm [data-sonner-toast] ou role="status"
    const hasErrorFeedback =
      (await page.locator('[data-sonner-toast]').filter({ hasText: /nao autorizado|unauthorized|permissao|UNAUTHORIZED/i }).isVisible()) ||
      (await page.getByRole('status').filter({ hasText: /nao autorizado|unauthorized|permissao/i }).isVisible()) ||
      (await page.getByRole('alert').filter({ hasText: /nao autorizado|unauthorized|permissao/i }).isVisible())

    // Ao menos um indicador de erro deve estar presente
    // Se nenhum toast/alert aparecer, é bug no código (Server Action deveria retornar UNAUTHORIZED)
    expect(hasErrorFeedback).toBe(true)
  })

  // =========================================================================
  // CT-INT-11 — integrations.form-submit-sucesso (best-effort)
  //
  // dado admin autenticado em /settings/integrations/whatsapp_official,
  // quando preenche todos os campos obrigatórios e submete,
  // então toast "Conta adicionada com sucesso" aparece e form é resetado.
  //
  // Pré-requisito: E2E_TEST_BRAND_ID configurado (UUID de brand ativa no banco).
  // Se não configurado, marcado como fixme — não bloqueia o sprint.
  //
  // Nota: este teste cria um channel_account real no banco de testes.
  // Use externalId único por execução para evitar conflito DuplicateChannelAccountError.
  // =========================================================================

  test('given admin autenticado com brand existente, when preenche form whatsapp e submete, then conta e adicionada com sucesso', async ({
    page,
  }) => {
    const testBrandId = process.env['E2E_TEST_BRAND_ID']

    if (!testBrandId) {
      test.fixme(
        true,
        'OQ-E2E-INT-02: E2E_TEST_BRAND_ID nao configurado — requer UUID de brand ativa para CT-INT-11 (submit sucesso). Configure E2E_TEST_BRAND_ID no .env.local.',
      )
      return
    }

    await loginAsAdmin(page)
    await page.goto('/settings/integrations/whatsapp_official')

    await expect(page.locator('h1')).toContainText('WhatsApp (Meta)', { timeout: 8_000 })

    // Verifica que o formulário está presente
    const addSection = page.getByRole('heading', { name: /Adicionar nova conta/i })
    if (!(await addSection.isVisible())) {
      test.fixme(
        true,
        'OQ-E2E-INT-02: formulario nao visivel (marca nao encontrada) — CT-INT-11 nao pode prosseguir',
      )
      return
    }

    // Select de marca (SelectTrigger id="brand-select")
    // Para Radix Select, devemos usar a API de click no trigger
    const brandSelect = page.locator('#brand-select')
    await brandSelect.click()

    // Seleciona a primeira opção disponível no dropdown
    const firstOption = page.getByRole('option').first()
    if (await firstOption.isVisible()) {
      await firstOption.click()
    } else {
      test.fixme(
        true,
        'OQ-E2E-INT-02: sem opcoes de marca disponiveis no select — banco sem brands ativas',
      )
      return
    }

    // External ID único para evitar DuplicateChannelAccountError
    const uniqueExternalId = `e2e-test-${Date.now()}`
    await page.locator('#external-id-input').fill(uniqueExternalId)

    // Preenche campos de credencial (type=password)
    await page.locator('#cred-app_secret').fill('e2e-test-app-secret')
    await page.locator('#cred-access_token').fill('e2e-test-access-token')
    await page.locator('#cred-phone_number_id').fill(uniqueExternalId)

    // Submit
    await page.getByRole('button', { name: /Adicionar conta/i }).click()

    // Aguarda toast de sucesso (Sonner)
    // Toast de sucesso: "Conta adicionada com sucesso."
    // ProviderConfigForm.handleSubmit: toast.success('Conta adicionada com sucesso.')
    await expect(
      page.locator('[data-sonner-toast]', { hasText: /Conta adicionada com sucesso/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Após sucesso, form deve ser resetado (campos limpos)
    const externalIdAfterReset = page.locator('#external-id-input')
    await expect(externalIdAfterReset).toHaveValue('')

    // Sem erro interno
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })
})
