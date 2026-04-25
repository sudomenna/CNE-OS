/**
 * FLOW-07 — Refund end-to-end (wizard UI)
 *
 * Cobre o fluxo completo do wizard de solicitação de reembolso via UI:
 *
 * CT-FLOW07-01: wizard carrega com heading "Solicitar Reembolso" e passo 1 ativo.
 * CT-FLOW07-02: validação do step 1 (motivo vazio ou valor 0 bloqueiam avanço).
 * CT-FLOW07-03: preenchimento válido avança para step 2 com seção "Efeitos previstos".
 * CT-FLOW07-04: step 3 confirma e exibe tela de sucesso "Reembolso solicitado!".
 * CT-FLOW07-05: após refund solicitado, botão "Reembolsar" não aparece na transação.
 * CT-FLOW07-06: transação não-aprovada redireciona para /transactions/[id].
 *
 * Regras cobertas:
 *   BR-REFUND §1-3 (abertura: status approved, sem refund ativo, motivo e valor obrigatórios)
 *   BR-RBAC: refund.open → admin|financial + 2FA
 *   FLOW-07 §Abertura (passos 1-4)
 *   docs/20-domain/14-refund.md §7 (wizard T-8-19)
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true                     — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL                   — email do usuário admin
 *   E2E_ADMIN_PASSWORD                — senha do usuário admin
 *   E2E_APPROVED_TRANSACTION_ID       — UUID de transação com status='approved' e sem refund ativo
 *   E2E_REFUSED_TRANSACTION_ID        — UUID de transação com status='refused' (opcional)
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=admin@test.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   E2E_APPROVED_TRANSACTION_ID=<uuid> \
 *   E2E_REFUSED_TRANSACTION_ID=<uuid> \
 *   pnpm test:e2e -- flow-07-refund-end-to-end
 *
 * Spec de referência:
 *   docs/60-flows/07-refund-end-to-end.md
 *   docs/20-domain/14-refund.md §7
 *   docs/50-business-rules/BR-REFUND.md
 *   docs/80-roadmap/05-sprint-8-snapshot-dg-integration.md T-8-24
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------
test.describe('FLOW-07 — refund-end-to-end', () => {
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
    await expect(page.getByText('CNE-OS').first()).toBeVisible()

    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    // Aguarda redirecionamento pós-login (qualquer rota protegida)
    await page.waitForURL(/\/(contacts|campaigns|funnels|tickets|inbox|offers|transactions)/, {
      timeout: 10_000,
    })
  }

  // -------------------------------------------------------------------------
  // Helper: navega para a página de wizard de refund de uma transação aprovada
  // -------------------------------------------------------------------------

  async function goToRefundWizard(page: import('@playwright/test').Page, transactionId: string) {
    await page.goto(`/transactions/${transactionId}/refund`)
    // Aguarda o heading principal do wizard aparecer
    await expect(
      page.getByRole('heading', { name: 'Solicitar Reembolso', level: 1 }),
    ).toBeVisible({ timeout: 10_000 })
  }

  // =========================================================================
  // CT-FLOW07-01 — refund-wizard-loads
  //
  // dado E2E_APPROVED_TRANSACTION_ID (transação approved sem refund ativo),
  // when loginAsAdmin e navega para /transactions/[id]/refund,
  // then página exibe heading "Solicitar Reembolso" e step 1 do wizard ativo
  //
  // FLOW-07 §Abertura passo 1; BR-REFUND §3 (status approved)
  // =========================================================================

  test('given transacao approved sem refund ativo, when admin acessa /transactions/[id]/refund, then heading Solicitar Reembolso e step 1 Motivo estao visiveis', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_APPROVED_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_APPROVED_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/transactions/${transactionId}/refund`)

    // Não deve ter renderizado erro 500
    await expect.soft(page.locator('body')).not.toContainText('500')
    await expect.soft(page.locator('body')).not.toContainText('Internal Server Error')

    // Heading principal do wizard
    await expect(
      page.getByRole('heading', { name: 'Solicitar Reembolso', level: 1 }),
    ).toBeVisible({ timeout: 10_000 })

    // Breadcrumb "Reembolso" como página atual
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' })
    await expect(breadcrumb).toBeVisible({ timeout: 8_000 })
    await expect.soft(breadcrumb.getByText('Reembolso')).toBeVisible()

    // Step indicator: step 1 (Motivo) deve estar ativo (aria-current="step")
    const activeStep = page.locator('[aria-current="step"]')
    await expect(activeStep).toBeVisible({ timeout: 5_000 })
    await expect.soft(activeStep).toContainText('1')

    // Label "Motivo" do step ativo deve estar visível
    const stepNav = page.getByRole('navigation', { name: 'Passos do wizard de reembolso' })
    await expect.soft(stepNav).toBeVisible()

    // Campo de valor (#refund-amount) deve estar presente no step 1
    await expect(page.locator('#refund-amount')).toBeVisible({ timeout: 5_000 })

    // Campo de motivo (#refund-reason) deve estar presente no step 1
    await expect(page.locator('#refund-reason')).toBeVisible()

    // Botão "Próximo →" deve estar presente
    await expect(
      page.getByRole('button', { name: /Próximo/i }),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW07-02 — refund-wizard-step1-validation
  //
  // dado wizard no step 1,
  // when submete form com motivo vazio (< 10 chars) ou valor 0,
  // then mensagem de erro visível e não avança para step 2
  //
  // BR-REFUND: motivo mínimo 10 chars; valor > 0
  // wizard.tsx handleStep1Submit: validação antes de chamar getRefundPreview
  // =========================================================================

  test('given wizard no step 1, when submete com motivo vazio (menos de 10 chars), then erro e exibido e nao avanca para step 2', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_APPROVED_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_APPROVED_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await goToRefundWizard(page, transactionId)

    // Garante que estamos no step 1
    await expect(page.locator('#refund-reason')).toBeVisible()

    // Testa: motivo com menos de 10 caracteres (9 chars) — valor válido
    await page.locator('#refund-amount').fill('100')
    await page.locator('#refund-reason').fill('curto')
    await page.getByRole('button', { name: /Próximo/i }).click()

    // Mensagem de erro deve aparecer — usa #wizard-error (id específico do wizard)
    // evita strict-mode com __next-route-announcer__ que também tem role="alert"
    const errorAlert = page.locator('#wizard-error')
    await expect(errorAlert).toBeVisible({ timeout: 5_000 })
    await expect.soft(errorAlert).toContainText(/10 caracteres/i)

    // Ainda deve estar no step 1 — campo de reason visível
    await expect(page.locator('#refund-reason')).toBeVisible()
  })

  test('given wizard no step 1, when submete com valor zero, then erro e exibido e nao avanca para step 2', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_APPROVED_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_APPROVED_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await goToRefundWizard(page, transactionId)

    // Garante que estamos no step 1
    await expect(page.locator('#refund-amount')).toBeVisible()

    // Zera o valor e fornece motivo válido
    await page.locator('#refund-amount').fill('0')
    await page.locator('#refund-reason').fill('Motivo valido com mais de dez caracteres')
    await page.getByRole('button', { name: /Próximo/i }).click()

    // Mensagem de erro deve aparecer — usa #wizard-error (id específico do wizard)
    // evita strict-mode com __next-route-announcer__ que também tem role="alert"
    const errorAlert = page.locator('#wizard-error')
    await expect(errorAlert).toBeVisible({ timeout: 5_000 })
    await expect.soft(errorAlert).toContainText(/valor válido/i)

    // Ainda deve estar no step 1 — campo de amount visível
    await expect(page.locator('#refund-amount')).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW07-03 — refund-wizard-step2-shows-effects
  //
  // dado E2E_APPROVED_TRANSACTION_ID,
  // when preenche motivo válido (>= 10 chars) e valor válido e clica "Próximo",
  // then step 2 carrega com seção "Efeitos previstos" visível
  //
  // FLOW-07 §Abertura passo 3; wizard.tsx handleStep1Submit → getRefundPreview
  // EffectsPreview exibe "Efeitos ao aprovar o reembolso"
  // =========================================================================

  test('given wizard no step 1 com campos validos, when clica Proximo, then step 2 exibe secao Efeitos previstos', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_APPROVED_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_APPROVED_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await goToRefundWizard(page, transactionId)

    // Preenche campos válidos no step 1
    // Motivo: exatamente 10+ chars; valor: mantém o pré-preenchido (transactionAmount) ou usa 100
    await page.locator('#refund-amount').fill('100')
    await page.locator('#refund-reason').fill('Solicitacao de reembolso por insatisfacao do cliente')

    // Clica "Próximo →"
    await page.getByRole('button', { name: /Próximo/i }).click()

    // Aguarda o step 2 carregar (getRefundPreview é async)
    // Heading "Efeitos previstos" confirma transição
    await expect(
      page.getByRole('heading', { name: /Efeitos previstos/i }),
    ).toBeVisible({ timeout: 15_000 })

    // Seção "Efeitos ao aprovar o reembolso" deve estar visível (EffectsPreview)
    await expect.soft(
      page.getByText('Efeitos ao aprovar o reembolso'),
    ).toBeVisible({ timeout: 5_000 })

    // Step indicator: step 2 (Efeitos) deve estar ativo
    const activeStep = page.locator('[aria-current="step"]')
    await expect.soft(activeStep).toContainText('2')

    // Botão "Confirmar efeitos →" deve estar presente
    await expect(
      page.getByRole('button', { name: /Confirmar efeitos/i }),
    ).toBeVisible()

    // Botão "← Voltar" deve estar presente para navegar de volta ao step 1
    await expect(
      page.getByRole('button', { name: /Voltar/i }),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW07-04 — refund-wizard-step3-confirm-submits
  //
  // dado wizard no step 3 (após step 1 e 2),
  // when clica "Solicitar Reembolso",
  // then tela de sucesso aparece com "Reembolso solicitado!" e redireciona para
  // /transactions/[id]
  //
  // FLOW-07 §Abertura: INSERT refund(status='requested'), nenhum efeito cascata
  // wizard.tsx handleStep3Confirm → submitOpenRefund → router.push
  // =========================================================================

  test('given wizard no step 3, when clica Solicitar Reembolso, then tela de sucesso aparece e redireciona para transacao', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_APPROVED_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_APPROVED_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await goToRefundWizard(page, transactionId)

    // --- Passo 1: preenche campos válidos ---
    await page.locator('#refund-amount').fill('100')
    await page.locator('#refund-reason').fill('Solicitacao de reembolso completo por insatisfacao')
    await page.getByRole('button', { name: /Próximo/i }).click()

    // --- Passo 2: aguarda preview e avança ---
    await expect(
      page.getByRole('heading', { name: /Efeitos previstos/i }),
    ).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /Confirmar efeitos/i }).click()

    // --- Passo 3: aguarda heading de confirmação ---
    await expect(
      page.getByRole('heading', { name: /Confirmar reembolso/i }),
    ).toBeVisible({ timeout: 5_000 })

    // Step indicator: step 3 (Confirmar) deve estar ativo
    const activeStep = page.locator('[aria-current="step"]')
    await expect.soft(activeStep).toContainText('3')

    // Botão final "Solicitar Reembolso" deve estar presente
    const submitButton = page.getByRole('button', { name: /^Solicitar Reembolso$/ })
    await expect(submitButton).toBeVisible()

    // Clica para confirmar o refund
    await submitButton.click()

    // Tela de sucesso: "Reembolso solicitado!" deve aparecer
    await expect(
      page.getByRole('heading', { name: /Reembolso solicitado!/i }),
    ).toBeVisible({ timeout: 15_000 })

    // Mensagem de redirecionamento
    await expect.soft(
      page.getByText(/Redirecionando para a transação/i),
    ).toBeVisible()

    // Aguarda redirecionamento automático para /transactions/[id] (após 1500ms)
    await page.waitForURL(
      new RegExp(`/transactions/${transactionId}$`),
      { timeout: 10_000 },
    )

    // Verifica que chegou na página de detalhe da transação
    await expect.soft(
      page.getByRole('heading', { name: /Transacao/i, level: 1 }),
    ).toBeVisible({ timeout: 8_000 })
  })

  // =========================================================================
  // CT-FLOW07-05 — transaction-shows-no-refund-button-after-refund
  //
  // dado E2E_APPROVED_TRANSACTION_ID após refund solicitado (status=approved mas
  // hasActiveRefund=true),
  // when acessa /transactions/[id],
  // then botão "Reembolsar" NÃO está visível (canRefund = false)
  //
  // BR-REFUND: canRefund = status=approved AND NOT hasActiveRefund
  // TransactionDetailPage.tsx: {canRefund && <Link>Reembolsar</Link>}
  //
  // Nota: este teste depende do CT-FLOW07-04 ter sido executado (refund criado)
  // ou de E2E_APPROVED_TRANSACTION_ID já ter um refund ativo no banco.
  // Em suites independentes, usar uma transação com refund já semeado.
  // =========================================================================

  test('given transacao approved com refund ativo (hasActiveRefund=true), when acessa /transactions/[id], then botao Reembolsar nao esta visivel', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_APPROVED_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_APPROVED_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)

    // Primeiro: solicita um refund para garantir que hasActiveRefund=true
    // (se já existe um refund ativo, o wizard vai redirecionar — isso é esperado)
    // Tentamos navegar para o wizard e, se redirecionar, já está ok
    await page.goto(`/transactions/${transactionId}/refund`)

    // O Server Component pode redirecionar de volta se já há refund ativo
    // Aguardamos estabilização da URL (pode ter redirected)
    await page.waitForLoadState('networkidle', { timeout: 10_000 })

    const currentUrl = page.url()
    const isOnWizard = currentUrl.includes('/refund')

    if (isOnWizard) {
      // Ainda sem refund ativo — cria um para que o próximo acesso não mostre o botão
      await expect(page.locator('#refund-amount')).toBeVisible({ timeout: 8_000 })
      await page.locator('#refund-amount').fill('100')
      await page.locator('#refund-reason').fill('Teste de ocultacao do botao de reembolso')
      await page.getByRole('button', { name: /Próximo/i }).click()

      await expect(
        page.getByRole('heading', { name: /Efeitos previstos/i }),
      ).toBeVisible({ timeout: 15_000 })
      await page.getByRole('button', { name: /Confirmar efeitos/i }).click()

      await expect(
        page.getByRole('heading', { name: /Confirmar reembolso/i }),
      ).toBeVisible({ timeout: 5_000 })
      await page.getByRole('button', { name: /^Solicitar Reembolso$/ }).click()

      // Aguarda tela de sucesso e redirecionamento
      await expect(
        page.getByRole('heading', { name: /Reembolso solicitado!/i }),
      ).toBeVisible({ timeout: 15_000 })

      await page.waitForURL(
        new RegExp(`/transactions/${transactionId}$`),
        { timeout: 10_000 },
      )
    } else {
      // Já foi redirecionado — estamos na página de detalhe
      await expect(
        page.url(),
      ).toContain(`/transactions/${transactionId}`)
    }

    // Acessa a página de detalhe da transação
    await page.goto(`/transactions/${transactionId}`)
    await page.waitForLoadState('networkidle', { timeout: 10_000 })

    // Botão "Reembolsar" NÃO deve estar visível
    // (hasActiveRefund=true → canRefund=false → link não renderizado)
    const refundButton = page.getByRole('link', { name: /^Reembolsar$/ })
    await expect.soft(refundButton).not.toBeVisible({ timeout: 5_000 })

    // Verifica que a página de detalhe carregou sem erro
    await expect.soft(page.locator('body')).not.toContainText('500')
    await expect(
      page.getByRole('heading', { name: /Transacao/i, level: 1 }),
    ).toBeVisible({ timeout: 8_000 })
  })

  // =========================================================================
  // CT-FLOW07-06 — non-approved-transaction-redirects
  //
  // dado E2E_REFUSED_TRANSACTION_ID (status='refused'),
  // when tenta acessar /transactions/[id]/refund,
  // then é redirecionado de volta para /transactions/[id]
  //
  // FLOW-07 §pré-condições: transaction.status='approved' obrigatório
  // RefundPage Server Component: redirect() se status !== 'approved' || hasRefundActive
  // =========================================================================

  test('given transacao com status refused (nao-approved), when acessa /transactions/[id]/refund, then redireciona para /transactions/[id]', async ({
    page,
  }) => {
    const refusedTransactionId = process.env['E2E_REFUSED_TRANSACTION_ID']

    if (!refusedTransactionId) {
      test.skip(
        true,
        'E2E_REFUSED_TRANSACTION_ID nao configurado — pular este caso',
      )
      return
    }

    await loginAsAdmin(page)

    // Tenta acessar o wizard de refund para a transação recusada
    await page.goto(`/transactions/${refusedTransactionId}/refund`)

    // Aguarda estabilização após possível redirect do Server Component
    await page.waitForLoadState('networkidle', { timeout: 10_000 })

    const finalUrl = page.url()

    // Deve ter sido redirecionado para /transactions/[id] (sem /refund)
    expect(finalUrl).toContain(`/transactions/${refusedTransactionId}`)
    expect(finalUrl).not.toContain('/refund')

    // Verifica que está na página de detalhe da transação
    await expect.soft(
      page.getByRole('heading', { name: /Transacao/i, level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // O heading "Solicitar Reembolso" do wizard NÃO deve estar visível
    await expect.soft(
      page.getByRole('heading', { name: 'Solicitar Reembolso', level: 1 }),
    ).not.toBeVisible()
  })
})
