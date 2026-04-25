/**
 * FLOW-12 — Reprocessamento manual de webhook DLQ
 *
 * Cobre o fluxo end-to-end de reprocessamento de evento em dead letter queue
 * via UI de /settings/webhooks:
 *
 * 1. webhooks-list-loads — /settings/webhooks carrega sem erro 500.
 * 2. webhook-detail-loads — /settings/webhooks/[id] exibe provider e status.
 * 3. reprocess-button-visible-for-dead-letter — botão "Reprocessar" visível
 *    para admin com webhook de status dead_letter (RBAC: webhook.reprocess).
 * 4. reprocess-button-triggers-action — clique em "Reprocessar" produz
 *    feedback de sucesso; operação não retorna erro 500.
 * 5. settings-page-shows-webhooks-card — /settings exibe card "Webhooks"
 *    com link para /settings/webhooks.
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true                    — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL                  — email do usuário admin
 *   E2E_ADMIN_PASSWORD               — senha do usuário admin
 *   E2E_WEBHOOK_LOG_ID               — UUID de webhook_log existente (qualquer status)
 *   E2E_DEAD_LETTER_WEBHOOK_ID       — UUID de webhook_log com status='dead_letter' (opcional)
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=admin@test.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   E2E_WEBHOOK_LOG_ID=<uuid> \
 *   E2E_DEAD_LETTER_WEBHOOK_ID=<uuid> \
 *   pnpm test:e2e -- flow-12-webhook-reprocess
 *
 * Spec de referência:
 *   docs/60-flows/12-webhook-reprocess.md
 *   docs/50-business-rules/BR-RBAC.md (webhook.reprocess: admin|financial + 2FA)
 *   docs/50-business-rules/BR-INTEGRATION-IDEMPOTENCY.md
 *   docs/80-roadmap/05-sprint-8-snapshot-dg-integration.md T-8-25
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------
test.describe('FLOW-12 — webhook-reprocess', () => {
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
    await page.waitForURL(/\/(contacts|campaigns|funnels|tickets|inbox|offers|settings)/, {
      timeout: 10_000,
    })
  }

  // =========================================================================
  // CT-FLOW12-01 — webhooks-list-loads
  // dado usuário logado,
  // quando acessa /settings/webhooks,
  // então heading "Webhooks" (ou "Logs de Webhook") visível sem erro 500
  //
  // FLOW-12 §1: UI mostra tabela de webhook_log filtrada por status
  // =========================================================================

  test('given usuario logado, when acessa /settings/webhooks, then heading Webhooks visivel sem erro 500', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    await page.goto('/settings/webhooks')

    // Página não deve renderizar erro 500 nem Internal Server Error
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')

    // Heading principal — conforme webhooks/page.tsx linha h1 "Webhooks"
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // O heading deve conter "Webhooks" ou "Logs de Webhook"
    const headingText = await page.getByRole('heading', { level: 1 }).textContent()
    expect.soft(
      headingText?.toLowerCase().includes('webhook'),
    ).toBe(true)

    // Tabela de webhooks deve estar presente (aria-label="Lista de webhooks")
    await expect.soft(
      page.getByRole('table', { name: /Lista de webhooks/i }),
    ).toBeVisible({ timeout: 8_000 })

    // Filtros de status e provedor devem estar presentes
    await expect.soft(page.locator('select[name="status"]')).toBeVisible()
    await expect.soft(page.locator('select[name="provider"]')).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW12-02 — webhook-detail-loads
  // dado E2E_WEBHOOK_LOG_ID configurado,
  // quando acessa /settings/webhooks/[id],
  // então detalhe do webhook carrega sem erro 500 e mostra provider e status
  //
  // FLOW-12 §2: UI mostra payload bruto, last_error com stack trace, tentativas
  // =========================================================================

  test('given E2E_WEBHOOK_LOG_ID configurado, when acessa /settings/webhooks/[id], then detalhe carrega sem erro 500 e mostra provider e status', async ({
    page,
  }) => {
    const webhookLogId = process.env['E2E_WEBHOOK_LOG_ID']

    if (!webhookLogId) {
      test.skip(true, 'E2E_WEBHOOK_LOG_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/settings/webhooks/${webhookLogId}`)

    // Não deve ter renderizado erro 500
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')

    // Heading "Detalhe do Webhook" deve estar presente — conforme [id]/page.tsx
    await expect(
      page.getByRole('heading', { name: /Detalhe do Webhook/i, level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // Seção de Metadados deve estar presente (aria-labelledby="metadata-heading")
    await expect.soft(
      page.getByRole('heading', { name: /Metadados/i }),
    ).toBeVisible({ timeout: 8_000 })

    // Provider deve estar visível na tabela de metadados (dt "Provedor")
    await expect.soft(
      page.getByRole('term').filter({ hasText: 'Provedor' }),
    ).toBeVisible()

    // Status deve estar visível (dt "Status" com Badge)
    await expect.soft(
      page.getByRole('term').filter({ hasText: 'Status' }),
    ).toBeVisible()

    // Seção de Payload deve estar presente (aria-labelledby="payload-heading")
    await expect.soft(
      page.getByRole('heading', { name: /Payload/i }),
    ).toBeVisible({ timeout: 8_000 })

    // Link de volta para lista deve estar presente
    await expect.soft(
      page.getByRole('link', { name: /Voltar para webhooks/i }),
    ).toBeVisible()
  })

  // =========================================================================
  // CT-FLOW12-03 — reprocess-button-visible-for-dead-letter
  // dado E2E_DEAD_LETTER_WEBHOOK_ID (webhook_log com status='dead_letter'),
  // quando admin acessa /settings/webhooks/[id],
  // então botão "Reprocessar" está visível (RBAC admin tem webhook.reprocess)
  //
  // FLOW-12 §pré-condições: operador com papel admin ou financial
  // BR-RBAC: webhook.reprocess requer admin|financial + 2FA
  // ReprocessButton: visível apenas para status failed|dead_letter + canReprocess=true
  // =========================================================================

  test('given E2E_DEAD_LETTER_WEBHOOK_ID com status dead_letter, when admin acessa /settings/webhooks/[id], then botao Reprocessar esta visivel', async ({
    page,
  }) => {
    const deadLetterId = process.env['E2E_DEAD_LETTER_WEBHOOK_ID']

    if (!deadLetterId) {
      test.skip(true, 'E2E_DEAD_LETTER_WEBHOOK_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/settings/webhooks/${deadLetterId}`)

    // Não deve ter erro 500
    await expect(page.locator('body')).not.toContainText('500')

    // Aguarda a página carregar (heading presente)
    await expect(
      page.getByRole('heading', { name: /Detalhe do Webhook/i, level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // Alerta de Dead Letter Queue deve estar presente para status=dead_letter
    // conforme [id]/page.tsx — div role="alert" com texto "Dead Letter Queue"
    await expect.soft(
      page.getByRole('alert').filter({ hasText: /Dead Letter Queue|DLQ/i }),
    ).toBeVisible({ timeout: 5_000 })

    // Botão "Reprocessar" deve estar visível para admin com status dead_letter
    // aria-label="Reprocessar este webhook" — conforme reprocess-button.tsx
    const reprocessButton = page.getByRole('button', { name: /Reprocessar este webhook|Reprocessar/i })
    await expect(reprocessButton).toBeVisible({ timeout: 8_000 })
    await expect.soft(reprocessButton).toBeEnabled()
  })

  // =========================================================================
  // CT-FLOW12-04 — reprocess-button-triggers-action
  // dado E2E_DEAD_LETTER_WEBHOOK_ID,
  // quando admin clica "Reprocessar",
  // então algum feedback de sucesso aparece (status na página, toast, ou
  // redirecionamento); a operação não retorna erro 500
  //
  // FLOW-12 §5: reprocessWebhook atualiza status para 'received', zera attempts,
  //             enfileira no Inngest, registra audit_log
  // ReprocessButton: exibe "Reprocessado!" + role="status" com mensagem de sucesso
  //                  e redireciona para /settings/webhooks após 1s
  // =========================================================================

  test('given E2E_DEAD_LETTER_WEBHOOK_ID, when admin clica Reprocessar, then feedback de sucesso aparece sem erro 500', async ({
    page,
  }) => {
    const deadLetterId = process.env['E2E_DEAD_LETTER_WEBHOOK_ID']

    if (!deadLetterId) {
      test.skip(true, 'E2E_DEAD_LETTER_WEBHOOK_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/settings/webhooks/${deadLetterId}`)

    // Aguarda a página carregar
    await expect(
      page.getByRole('heading', { name: /Detalhe do Webhook/i, level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // Botão deve estar presente e ativo
    const reprocessButton = page.getByRole('button', { name: /Reprocessar este webhook|Reprocessar/i })
    await expect(reprocessButton).toBeVisible({ timeout: 8_000 })

    // Registra dialog de confirmação e aceita automaticamente
    // ReprocessButton usa window.confirm() antes de executar
    page.on('dialog', async (dialog) => {
      // Confirma o reprocessamento
      await dialog.accept()
    })

    // Clica no botão de reprocessar
    await reprocessButton.click()

    // Aguarda feedback de sucesso — ReprocessButton exibe role="status"
    // com texto "Webhook re-enfileirado com sucesso. Redirecionando..."
    // OU redireciona para /settings/webhooks
    await Promise.race([
      // Caminho 1: mensagem de sucesso visível
      expect(page.getByRole('status').filter({ hasText: /sucesso|re-enfileirado/i }))
        .toBeVisible({ timeout: 15_000 }),
      // Caminho 2: redirecionamento para lista de webhooks
      page.waitForURL(/\/settings\/webhooks$/, { timeout: 15_000 }),
    ])

    // Confirma que não houve erro 500 em nenhum momento
    await expect.soft(page.locator('body')).not.toContainText('500')
    await expect.soft(page.locator('body')).not.toContainText('Internal Server Error')

    // Se ainda na mesma página, o botão deve exibir "Reprocessado!" ou estar desabilitado
    if (page.url().includes(deadLetterId)) {
      const buttonText = await reprocessButton.textContent()
      expect.soft(
        buttonText?.includes('Reprocessado') ||
        buttonText?.includes('Reprocessando') ||
        await reprocessButton.isDisabled(),
      ).toBe(true)
    }
  })

  // =========================================================================
  // CT-FLOW12-05 — settings-page-shows-webhooks-card
  // dado usuário logado,
  // quando acessa /settings,
  // então card "Webhooks" está visível com link para /settings/webhooks
  //
  // settings/page.tsx: SECTIONS array contém { href: '/settings/webhooks', label: 'Webhooks' }
  // =========================================================================

  test('given usuario logado, when acessa /settings, then card Webhooks visivel com link para /settings/webhooks', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    await page.goto('/settings')

    // Não deve ter erro 500
    await expect(page.locator('body')).not.toContainText('500')
    await expect(page.locator('body')).not.toContainText('Internal Server Error')

    // Heading "Configurações" deve estar presente
    await expect(
      page.getByRole('heading', { name: 'Configurações', level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // Card "Webhooks" deve estar presente como link
    // settings/page.tsx: Link com aria-label "Webhooks: Monitore e reprocesse eventos de integração"
    const webhooksCard = page.getByRole('link', { name: /Webhooks/i })
    await expect(webhooksCard).toBeVisible({ timeout: 8_000 })

    // O link deve apontar para /settings/webhooks
    const href = await webhooksCard.getAttribute('href')
    expect.soft(href).toContain('/settings/webhooks')

    // Clicar no card deve navegar para /settings/webhooks
    await webhooksCard.click()
    await page.waitForURL(/\/settings\/webhooks/, { timeout: 8_000 })

    // Confirma que chegou na página de webhooks sem erro
    await expect.soft(page.locator('body')).not.toContainText('500')
    await expect(
      page.getByRole('heading', { level: 1 }),
    ).toBeVisible({ timeout: 8_000 })
  })
})
