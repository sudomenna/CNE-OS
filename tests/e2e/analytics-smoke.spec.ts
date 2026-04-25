/**
 * ANALYTICS-SMOKE — dashboards de analytics carregam sem erro
 *
 * Smoke test E2E: verifica que cada rota de analytics existe, responde com
 * status != 500 e exibe o h1 correto apos autenticacao do admin.
 *
 * Nao requer banco semeado com dados analiticos — apenas que o servidor
 * Next.js esteja rodando e o usuario admin consiga autenticar.
 *
 * Dashboards cobertos:
 *   /analytics            — Visao Geral
 *   /analytics/sales      — Vendas
 *   /analytics/funnels    — Funis
 *   /analytics/inbox      — Inbox
 *   /analytics/campaigns  — Campanhas
 *   /analytics/refunds    — Reembolsos
 *
 * Requisitos de ambiente:
 *   E2E_ADMIN_EMAIL     — email do usuario admin
 *   E2E_ADMIN_PASSWORD  — senha do usuario admin
 *
 * Para rodar manualmente:
 *   E2E_ADMIN_EMAIL=tiagomenna@gmail.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   pnpm test:e2e -- analytics-smoke
 *
 * Spec de referencia:
 *   docs/80-roadmap/07-sprint-10-analytics.md
 *   docs/10-architecture/10-testing-strategy.md §4
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Tabela de dashboards: path → titulo esperado no h1
// ---------------------------------------------------------------------------

const DASHBOARDS = [
  { path: '/analytics', title: 'Visao Geral' },
  { path: '/analytics/sales', title: 'Vendas' },
  { path: '/analytics/funnels', title: 'Funis' },
  { path: '/analytics/inbox', title: 'Inbox' },
  { path: '/analytics/campaigns', title: 'Campanhas' },
  { path: '/analytics/refunds', title: 'Reembolsos' },
] as const

// ---------------------------------------------------------------------------
// Guard: o spec so roda quando credenciais de admin estao configuradas.
// Sem E2E_ADMIN_EMAIL, pula silenciosamente (ex: CI sem env vars).
// ---------------------------------------------------------------------------

test.describe('ANALYTICS-SMOKE — dashboards carregam sem erro', () => {
  test.skip(
    !process.env['E2E_ADMIN_EMAIL'],
    'requires E2E_ADMIN_EMAIL to be set — configure env vars to run',
  )

  // -------------------------------------------------------------------------
  // Helper: login como admin via /login (email + senha)
  // Padrao identico ao usado em flow-07, flow-11, flow-02.
  // -------------------------------------------------------------------------

  async function loginAsAdmin(page: import('@playwright/test').Page) {
    const email = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@test.com'
    const password = process.env['E2E_ADMIN_PASSWORD'] ?? ''

    await page.goto('/login')
    await expect(page.getByText('CNE-OS').first()).toBeVisible()

    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    // Aguarda redirecionamento pos-login (qualquer rota protegida)
    await page.waitForURL(
      /\/(contacts|campaigns|funnels|tickets|inbox|offers|transactions|billing|analytics)/,
      { timeout: 10_000 },
    )
  }

  // -------------------------------------------------------------------------
  // beforeEach: autentica uma vez por teste (cada teste = nova page isolada)
  // -------------------------------------------------------------------------

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  // -------------------------------------------------------------------------
  // Smoke tests: um por dashboard
  // -------------------------------------------------------------------------

  for (const dashboard of DASHBOARDS) {
    test(`given admin autenticado, when navega para ${dashboard.path}, then pagina carrega sem erro 500 e h1 exibe "${dashboard.title}"`, async ({
      page,
    }) => {
      const response = await page.goto(dashboard.path)

      // Nao deve retornar 500
      expect(response?.status()).not.toBe(500)

      // h1 com o titulo correto deve estar visivel
      // Usa toContainText para tolerar acentuacao e variacao de pontuacao
      await expect(page.locator('h1')).toContainText(dashboard.title, {
        timeout: 10_000,
      })

      // Sem mensagem de erro interno na pagina
      await expect.soft(page.locator('body')).not.toContainText('Internal Server Error')
      await expect.soft(page.locator('body')).not.toContainText('Application error')
    })
  }
})
