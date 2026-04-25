/**
 * T-11-14 — automation-dispatch.spec.ts
 *
 * Cobre o fluxo E2E de automações:
 *
 * CT-AUTOMATION-01: /automations carrega sem erro para admin autenticado.
 * CT-AUTOMATION-02: Criar fluxo via botão "Nova Automação" redireciona para editor /automations/[id].
 * CT-AUTOMATION-03: Editor do fluxo carrega com canvas react-flow e botão "Adicionar nó".
 * CT-AUTOMATION-04: Adicionar nó via modal — fluxo cria nó de tipo "trigger" no canvas.
 * CT-AUTOMATION-05: Lista /automations exibe o fluxo criado pelo nome.
 * CT-AUTOMATION-06: /automations/[id]/executions carrega sem erro (lista de execuções vazia ou preenchida).
 * CT-AUTOMATION-07: Botão "Publicar" falha com mensagem quando flow não tem start_node_id (INV-AUTOMATION-01).
 *
 * Regras cobertas:
 *   INV-AUTOMATION-01 (flow sem start_node_id não pode ser publicado)
 *   docs/20-domain/15-automation.md §13 (casos de teste obrigatórios)
 *   docs/80-roadmap/08-sprint-11-automations.md T-11-14
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true            — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL          — email do usuário admin
 *   E2E_ADMIN_PASSWORD       — senha do usuário admin
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=tiagomenna@gmail.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   pnpm test:e2e -- automation-dispatch
 *
 * Spec de referência:
 *   docs/20-domain/15-automation.md §13 (casos de teste obrigatórios)
 *   docs/80-roadmap/08-sprint-11-automations.md T-11-14
 *   docs/10-architecture/10-testing-strategy.md §4
 *
 * Nota sobre o passo de disparo de evento (cenário principal §11):
 *   O disparo real requer Inngest ativo e integração com outros módulos (T-11-09).
 *   Neste spec, o cenário verifica que a página de execuções carrega corretamente e
 *   que o contrato UI de "execução com status badge" está presente.
 *   Teste de idempotência e retry estão cobertos em tests/integration/automation/retry-dlq.test.ts (T-11-15).
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------
test.describe('automation-dispatch', () => {
  test.skip(
    process.env['SEED_E2E'] !== 'true',
    'requires seeded test database — run with SEED_E2E=true',
  )

  // -------------------------------------------------------------------------
  // Helper: login como admin via /login (email + senha)
  // Padrão idêntico ao usado em flow-07, flow-11, flow-02, analytics-smoke.
  // -------------------------------------------------------------------------

  async function loginAsAdmin(page: import('@playwright/test').Page) {
    const email = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@test.com'
    const password = process.env['E2E_ADMIN_PASSWORD'] ?? ''

    await page.goto('/login')
    await expect(page.getByText('CNE-OS').first()).toBeVisible()

    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    // Aguarda redirecionamento pós-login (qualquer rota protegida)
    await page.waitForURL(
      /\/(contacts|campaigns|funnels|tickets|inbox|offers|transactions|billing|analytics|automations)/,
      { timeout: 10_000 },
    )
  }

  // =========================================================================
  // CT-AUTOMATION-01 — automations.list-loads
  //
  // dado admin autenticado,
  // when acessa /automations,
  // then página carrega sem erro 500 e h1 exibe "Automações"
  //
  // docs/20-domain/15-automation.md §13 — pré-condição de todos os testes
  // =========================================================================

  test('given admin autenticado, when acessa /automations, then pagina carrega sem erro 500 e h1 exibe Automacoes', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    const response = await page.goto('/automations')

    // Não deve retornar 500
    expect(response?.status()).not.toBe(500)

    // h1 com o título correto deve estar visível
    await expect(page.locator('h1')).toContainText('Automa', { timeout: 10_000 })

    // Sem mensagem de erro interno na página
    await expect.soft(page.locator('body')).not.toContainText('Internal Server Error')
    await expect.soft(page.locator('body')).not.toContainText('Application error')
  })

  // =========================================================================
  // CT-AUTOMATION-02 — automations.create-flow-redirects-to-editor
  //
  // dado admin autenticado na /automations,
  // when clica "Nova Automação",
  // then createFlow Action é chamada e redireciona para /automations/[id]
  //
  // components/automation/automation-list.tsx: handleCreateFlow → router.push
  // =========================================================================

  test('given admin autenticado em /automations, when clica Nova Automacao, then redireciona para /automations/[uuid] do editor', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/automations')

    // Aguarda o botão "Nova Automação" aparecer (Client Component pode demorar para hidratar)
    const createButton = page.getByRole('button', { name: /Nova Automação/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })

    // Clica no botão
    await createButton.click()

    // Aguarda redirecionamento para /automations/[uuid]
    await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    // Verifica que chegou na rota correta
    expect(page.url()).toMatch(/\/automations\/[0-9a-f-]{36}$/)

    // Sem erro interno
    await expect.soft(page.locator('body')).not.toContainText('Internal Server Error')
    await expect.soft(page.locator('body')).not.toContainText('Application error')
  })

  // =========================================================================
  // CT-AUTOMATION-03 — automations.editor-loads-with-canvas
  //
  // dado admin autenticado redirecionado para /automations/[id] (editor),
  // when página carrega,
  // then top bar com nome do fluxo e badge de status estão visíveis,
  //      link "Ver execuções" está presente,
  //      canvas react-flow (.react-flow) é montado no DOM (lazy-load)
  //
  // app/(app)/automations/[id]/page.tsx: AutomationEditorLayout
  // components/automation/flow-editor.tsx: FlowEditor (dynamic, ssr:false)
  // =========================================================================

  test('given admin redirecionado para editor de fluxo, when pagina carrega, then top bar e canvas sao visiveis e botao Adicionar no aparece', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/automations')

    // Cria um novo fluxo
    const createButton = page.getByRole('button', { name: /Nova Automação/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()

    // Aguarda redirecionamento
    await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    // Link "Automações" no breadcrumb (top bar)
    await expect(page.getByRole('link', { name: 'Automações' }).first()).toBeVisible({ timeout: 8_000 })

    // Badge de status "Inativo" (fluxo recém-criado tem is_active=false)
    // INV-AUTOMATION-01: flow começa com is_active=false
    await expect.soft(page.getByText('Inativo')).toBeVisible({ timeout: 5_000 })

    // Link "Ver execuções" na top bar
    await expect(
      page.getByRole('link', { name: /Ver execuções/i }),
    ).toBeVisible({ timeout: 5_000 })

    // Botão "Publicar" deve estar presente (flow inativo)
    await expect(
      page.getByRole('button', { name: /Publicar/i }),
    ).toBeVisible({ timeout: 5_000 })

    // Canvas react-flow: aguarda o Client Component montar (ssr:false, dynamic)
    // O react-flow monta um elemento com class="react-flow"
    await expect(
      page.locator('.react-flow'),
    ).toBeVisible({ timeout: 20_000 })

    // Botão "Adicionar nó" deve aparecer no canvas (overlay)
    await expect(
      page.getByRole('button', { name: /\+ Adicionar nó/i }),
    ).toBeVisible({ timeout: 10_000 })
  })

  // =========================================================================
  // CT-AUTOMATION-04 — automations.add-node-via-modal
  //
  // dado admin no editor de fluxo (/automations/[id]) com canvas visível,
  // when clica "+ Adicionar nó" → seleciona tipo "Gatilho" → preenche rótulo → clica "Adicionar",
  // then modal fecha e o nó aparece no canvas com tipo "trigger"
  //
  // components/automation/flow-editor.tsx: handleAddNode → createNode action
  // Spec §13 caso 1: Trigger dispara fluxo — nó trigger deve existir no fluxo
  // =========================================================================

  test('given admin no editor de fluxo, when abre modal Adicionar no e escolhe tipo Gatilho, then modal fecha e no aparece no canvas', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/automations')

    // Cria um novo fluxo e navega para o editor
    const createButton = page.getByRole('button', { name: /Nova Automação/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()
    await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    // Aguarda canvas montar
    await expect(page.locator('.react-flow')).toBeVisible({ timeout: 20_000 })

    // Clica no botão "Adicionar nó"
    const addNodeButton = page.getByRole('button', { name: /\+ Adicionar nó/i })
    await expect(addNodeButton).toBeVisible({ timeout: 10_000 })
    await addNodeButton.click()

    // Modal deve abrir com título "Adicionar nó"
    await expect(
      page.getByRole('heading', { name: 'Adicionar nó' }),
    ).toBeVisible({ timeout: 5_000 })

    // Selecionar tipo "Gatilho" no Select
    // O Select tem id="new-node-kind" na trigger e exibe "Ação" por padrão
    // Usamos role="combobox" para abrir o select
    const kindSelect = page.getByRole('combobox', { name: /Tipo de nó/i })
    // Fallback: locator pelo id do trigger
    const kindTrigger = page.locator('#new-node-kind').or(kindSelect)
    await kindTrigger.click()

    // Escolhe "Gatilho" na lista de opções
    await page.getByRole('option', { name: 'Gatilho' }).click()

    // Preenche rótulo opcional
    await page.locator('#new-node-label').fill('Trigger E2E Test')

    // Clica em "Adicionar"
    await page.getByRole('button', { name: /^Adicionar$/ }).click()

    // Modal deve fechar (heading "Adicionar nó" não visível)
    await expect(
      page.getByRole('heading', { name: 'Adicionar nó' }),
    ).not.toBeVisible({ timeout: 10_000 })

    // O novo nó deve estar no canvas react-flow
    // NodeTrigger renderiza um elemento com data-kind="trigger" ou texto "Gatilho"
    // Aguarda aparecimento de algum nó no canvas (react-flow monta .react-flow__node)
    await expect(
      page.locator('.react-flow__node'),
    ).toBeVisible({ timeout: 10_000 })
  })

  // =========================================================================
  // CT-AUTOMATION-05 — automations.list-shows-created-flow
  //
  // dado admin que criou um fluxo com nome padrão "Novo Fluxo",
  // when navega para /automations,
  // then o fluxo aparece na tabela com nome "Novo Fluxo" e badge "Inativo"
  //
  // app/(app)/automations/page.tsx: lista fluxos não-deleted
  // =========================================================================

  test('given admin criou fluxo, when navega para /automations, then lista exibe o fluxo com nome Novo Fluxo e badge Inativo', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/automations')

    // Cria novo fluxo
    const createButton = page.getByRole('button', { name: /Nova Automação/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()
    await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    // Volta para a lista
    await page.goto('/automations')

    // Aguarda tabela carregar — deve conter "Novo Fluxo"
    await expect(
      page.getByRole('link', { name: 'Novo Fluxo' }).first(),
    ).toBeVisible({ timeout: 10_000 })

    // Badge "Inativo" deve estar presente para o fluxo recém-criado
    // (is_active=false, conforme INV-AUTOMATION-01)
    const flowRow = page.getByRole('link', { name: 'Novo Fluxo' }).first()
    const rowContainer = flowRow.locator('xpath=ancestor::tr')
    await expect.soft(rowContainer.getByText('Inativo')).toBeVisible({ timeout: 5_000 })
  })

  // =========================================================================
  // CT-AUTOMATION-06 — automations.executions-page-loads
  //
  // dado admin autenticado e fluxo existente,
  // when navega para /automations/[id]/executions,
  // then página carrega sem erro 500, h1 exibe "Execuções — Novo Fluxo"
  //      e não há mensagem de erro interno
  //
  // app/(app)/automations/[id]/executions/page.tsx: AutomationExecutionsPage
  // =========================================================================

  test('given admin autenticado e fluxo existente, when acessa /automations/[id]/executions, then pagina carrega sem erro e h1 exibe Execucoes', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/automations')

    // Cria fluxo para obter ID
    const createButton = page.getByRole('button', { name: /Nova Automação/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()
    await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    // Extrai o flowId da URL
    const editorUrl = page.url()
    const flowId = editorUrl.match(/\/automations\/([0-9a-f-]{36})$/)?.[1]
    expect(flowId).toBeTruthy()

    // Acessa a página de execuções diretamente
    const response = await page.goto(`/automations/${flowId}/executions`)

    // Não deve retornar 500
    expect(response?.status()).not.toBe(500)

    // h1 deve exibir "Execuções —" seguido do nome do fluxo
    await expect(page.locator('h1')).toContainText('Execuções', { timeout: 10_000 })
    await expect(page.locator('h1')).toContainText('Novo Fluxo', { timeout: 5_000 })

    // Sem erro interno
    await expect.soft(page.locator('body')).not.toContainText('Internal Server Error')
    await expect.soft(page.locator('body')).not.toContainText('Application error')

    // Lista vazia deve exibir mensagem "Nenhuma execução registrada"
    await expect.soft(
      page.getByText(/Nenhuma execução registrada/i),
    ).toBeVisible({ timeout: 5_000 })
  })

  // =========================================================================
  // CT-AUTOMATION-07 — automations.publish-without-start-node-shows-error
  //
  // dado admin no editor de fluxo recém-criado (sem start_node_id),
  // when clica "Publicar",
  // then mensagem de erro aparece indicando que o fluxo não pode ser publicado
  //      sem nó inicial (INV-AUTOMATION-01) e o badge continua "Inativo"
  //
  // INV-AUTOMATION-01: flow sem start_node_id → publishFlow lança ActionError 'VALIDATION'
  // components/automation/flow-publish-button.tsx: exibe error via role="alert"
  // =========================================================================

  test('given admin em editor de fluxo sem start_node_id, when clica Publicar, then mensagem de erro aparece e badge continua Inativo', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/automations')

    // Cria fluxo (sem nós — start_node_id=null)
    const createButton = page.getByRole('button', { name: /Nova Automação/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()
    await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    // Aguarda a top bar carregar
    await expect(page.getByRole('button', { name: /Publicar/i })).toBeVisible({ timeout: 8_000 })

    // Badge "Inativo" deve estar visível antes de tentar publicar
    await expect.soft(page.getByText('Inativo')).toBeVisible()

    // Clica "Publicar"
    await page.getByRole('button', { name: /Publicar/i }).click()

    // Mensagem de erro deve aparecer (role="alert" em FlowPublishButton)
    // INV-AUTOMATION-01: "Flow has no start node"
    const errorAlert = page.getByRole('alert')
    await expect(errorAlert).toBeVisible({ timeout: 10_000 })

    // Badge ainda deve ser "Inativo" (publicação bloqueada)
    await expect.soft(page.getByText('Inativo')).toBeVisible({ timeout: 5_000 })
    // Badge "Ativo" NÃO deve aparecer
    await expect.soft(page.getByText('Ativo')).not.toBeVisible()
  })

  // =========================================================================
  // CT-AUTOMATION-08 — automations.executions-link-in-editor
  //
  // dado admin no editor do fluxo (/automations/[id]),
  // when clica no link "Ver execuções",
  // then navega para /automations/[id]/executions
  //
  // app/(app)/automations/[id]/page.tsx: Link href=/automations/${flowId}/executions
  // =========================================================================

  test('given admin no editor do fluxo, when clica Ver execucoes, then navega para /automations/[id]/executions', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/automations')

    // Cria fluxo
    const createButton = page.getByRole('button', { name: /Nova Automação/i })
    await expect(createButton).toBeVisible({ timeout: 10_000 })
    await createButton.click()
    await page.waitForURL(/\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })

    const editorUrl = page.url()
    const flowId = editorUrl.match(/\/automations\/([0-9a-f-]{36})$/)?.[1]
    expect(flowId).toBeTruthy()

    // Clica em "Ver execuções"
    const execLink = page.getByRole('link', { name: /Ver execuções/i })
    await expect(execLink).toBeVisible({ timeout: 8_000 })
    await execLink.click()

    // Aguarda redirecionamento para /automations/[id]/executions
    await page.waitForURL(new RegExp(`/automations/${flowId}/executions`), {
      timeout: 10_000,
    })

    // Confirma URL correta
    expect(page.url()).toContain(`/automations/${flowId}/executions`)

    // h1 deve estar visível
    await expect(page.locator('h1')).toContainText('Execuções', { timeout: 8_000 })
  })
})
