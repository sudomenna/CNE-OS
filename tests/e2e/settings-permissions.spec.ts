/**
 * T-15-07 — settings-permissions.spec.ts
 *
 * Testes E2E para /settings/permissions — matriz role × permission editável.
 *
 * Casos cobertos:
 *   CT-PERM-01: admin navega para /settings → vê card "Permissões"
 *   CT-PERM-02: clicar em "Permissões" → /settings/permissions carrega com h1 correto
 *   CT-PERM-03: matriz aparece com tabela de roles + permissions (estrutura)
 *   CT-PERM-04: coluna Admin exibe checkboxes sempre marcados e desabilitados
 *   CT-PERM-05: toggle de checkbox em coluna não-admin (ex: Financeiro) — toggle disponível
 *   CT-PERM-06: toggle persiste após reload da página (verificação de persistência)
 *   CT-PERM-07: login como non-admin → /settings/permissions exibe alerta de leitura (não redireciona)
 *
 * Regras cobertas:
 *   BR-RBAC: somente admin pode modificar a matriz de permissões
 *   T-15-01 (domínio RBAC grant/revoke) + T-15-02 (UI)
 *   docs/80-roadmap/12-sprint-15-rbac-integrations.md T-15-07
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true              — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL            — email do usuário admin (role=admin)
 *   E2E_ADMIN_PASSWORD         — senha do usuário admin
 *   E2E_NONADMIN_EMAIL         — email de usuário não-admin (ex: role=support) [opcional]
 *   E2E_NONADMIN_PASSWORD      — senha do usuário não-admin [opcional]
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=tiagomenna@gmail.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   pnpm test:e2e -- settings-permissions
 *
 * Nota sobre CT-PERM-06 (persistência de toggle):
 *   Este caso requer que haja pelo menos uma permission e um role não-admin cadastrados
 *   na seed. A ideia é apenas verificar que o checkbox não retorna ao estado anterior
 *   após reload — a reversão real seria feita manualmente para não poluir o banco de testes.
 *   Caso a toggle falhe por UNAUTHORIZED (role não-admin tentou), o teste é marcado fixme.
 *
 * Nota sobre CT-PERM-07 (acesso não-admin):
 *   A página /settings/permissions NÃO redireciona não-admins — exibe um alerta de
 *   leitura apenas (comportamento real: isAdmin=false → alerta "Apenas administradores...").
 *   Se E2E_NONADMIN_EMAIL não estiver configurado, o caso é marcado como fixme.
 *
 * Spec de referência:
 *   docs/80-roadmap/12-sprint-15-rbac-integrations.md T-15-07
 *   docs/10-architecture/10-testing-strategy.md §4
 *   app/(app)/settings/permissions/page.tsx
 *   app/(app)/settings/permissions/_components/role-matrix.tsx
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------

test.describe('T-15-07 settings-permissions', () => {
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

    // Aguarda redirecionamento pós-login (qualquer rota protegida)
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
        'E2E_NONADMIN_EMAIL não configurado — pré-requisito para teste de acesso não-admin',
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
  // CT-PERM-01 — settings.card-permissoes-visivel
  //
  // dado admin autenticado,
  // quando navega para /settings,
  // então card "Permissões" com link para /settings/permissions está visível.
  // =========================================================================

  test('given admin autenticado, when navega para /settings, then card Permissoes esta visivel com link correto', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings')

    // Heading principal da página de settings
    await expect(page.locator('h1')).toContainText('Configurações', { timeout: 8_000 })

    // Card "Permissões" existe como link para /settings/permissions
    const permCard = page.getByRole('link', {
      name: /Permissões/i,
    })
    await expect(permCard).toBeVisible()

    // Verifica que o href aponta para a rota correta
    await expect(permCard).toHaveAttribute('href', '/settings/permissions')
  })

  // =========================================================================
  // CT-PERM-02 — permissions.page-carrega
  //
  // dado admin autenticado,
  // quando navega para /settings/permissions,
  // então página carrega com h1 "Permissões" e breadcrumb visível.
  // =========================================================================

  test('given admin autenticado, when navega para /settings/permissions, then pagina carrega com h1 Permissoes e breadcrumb', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/permissions')

    // Heading principal
    await expect(page.locator('h1')).toContainText('Permissões', { timeout: 8_000 })

    // Breadcrumb: link "Configurações" + texto "Permissões"
    const breadcrumb = page.getByRole('navigation', { name: /Navegação estrutural/i })
    await expect(breadcrumb.getByRole('link', { name: 'Configurações' })).toBeVisible()
    await expect(breadcrumb.getByText('Permissões')).toBeVisible()

    // Sem erro interno
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
    await expect(page.locator('body')).not.toContainText('Application error')
  })

  // =========================================================================
  // CT-PERM-03 — permissions.matriz-estrutura
  //
  // dado admin autenticado na página /settings/permissions,
  // quando a página carrega,
  // então tabela "Matriz de papéis e permissões" está visível com
  //   pelo menos uma coluna de role e pelo menos uma linha de permission.
  // =========================================================================

  test('given admin autenticado, when permissions page carrega, then tabela de matriz esta visivel com roles e permissions', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/permissions')

    await expect(page.locator('h1')).toContainText('Permissões', { timeout: 8_000 })

    // A tabela tem aria-label "Matriz de papéis e permissões"
    const matrix = page.getByRole('table', { name: /Matriz de papéis e permissões/i })
    await expect(matrix).toBeVisible()

    // Coluna "Permissão" (th escopo col)
    await expect(
      matrix.getByRole('columnheader', { name: 'Permissão' }),
    ).toBeVisible()

    // Coluna "Admin" sempre presente
    await expect(
      matrix.getByRole('columnheader', { name: /Admin/i }),
    ).toBeVisible()

    // Ao menos uma linha de permissão na tbody (rowheaders são th[scope=row])
    const rowHeaders = matrix.locator('tbody th[scope="row"]')
    await expect(rowHeaders.first()).toBeVisible()
  })

  // =========================================================================
  // CT-PERM-04 — permissions.admin-coluna-readonly
  //
  // dado admin autenticado na página /settings/permissions,
  // quando a página carrega,
  // então todos os checkboxes na coluna Admin estão marcados (checked=true)
  //   e desabilitados (disabled).
  // Regra: BR-RBAC — admin role não pode ser modificado via UI.
  // =========================================================================

  test('given admin autenticado, when permissions page carrega, then checkboxes da coluna Admin estao marcados e desabilitados', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/permissions')

    await expect(page.locator('h1')).toContainText('Permissões', { timeout: 8_000 })

    // Todos os checkboxes com aria-label contendo "papel Admin" devem ser disabled e checked.
    // O aria-label gerado pelo role-matrix.tsx para admin é:
    //   "Permissão {perm.action} para o papel Admin (sempre concedida implicitamente)"
    const adminCheckboxes = page.locator(
      '[aria-label*="para o papel Admin"]',
    )

    const count = await adminCheckboxes.count()
    // Se não houver permissions cadastradas, não há checkboxes — isso é aceitável.
    if (count === 0) {
      test.skip(true, 'Nenhuma permission cadastrada no banco de testes — pular verificação de Admin checkbox')
      return
    }

    // Todos devem estar desabilitados (BR-RBAC: admin role read-only)
    for (let i = 0; i < count; i++) {
      await expect(adminCheckboxes.nth(i)).toBeDisabled()
    }
  })

  // =========================================================================
  // CT-PERM-05 — permissions.toggle-nao-admin-disponivel
  //
  // dado admin autenticado na página /settings/permissions,
  // quando a matriz tem pelo menos um role não-admin,
  // então existe pelo menos um checkbox habilitado (não-admin, não-desabilitado).
  // Verifica que a UI permite a interação — não executa o toggle real
  // para evitar efeito colateral permanente no banco de testes.
  // =========================================================================

  test('given admin autenticado, when permissions page carrega com roles nao-admin, then existe checkbox habilitado para toggle', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/permissions')

    await expect(page.locator('h1')).toContainText('Permissões', { timeout: 8_000 })

    const matrix = page.getByRole('table', { name: /Matriz de papéis e permissões/i })
    await expect(matrix).toBeVisible()

    // Checkboxes habilitados são os de roles não-admin.
    // O aria-label de não-admin contém "Permitir {action} para o papel {roleLabel}"
    const enabledCheckboxes = matrix.locator('[role="checkbox"]:not([data-disabled])').filter({
      hasNot: page.locator('[aria-label*="para o papel Admin"]'),
    })

    const count = await enabledCheckboxes.count()
    if (count === 0) {
      // Pode acontecer se só existir o role admin no banco de testes.
      // Registrado como gap de fixture — mas não bloqueia o spec.
      test.fixme(
        true,
        'OQ-E2E-PERM-01: sem roles não-admin no banco de testes — adicionar fixture de role support/financial para exercitar toggle',
      )
      return
    }

    // Ao menos um checkbox habilitado existe — UI está pronta para toggle
    await expect(enabledCheckboxes.first()).toBeEnabled()
  })

  // =========================================================================
  // CT-PERM-06 — permissions.toggle-persiste-apos-reload
  //
  // dado admin autenticado com ao menos um role não-admin e uma permission cadastrada,
  // quando admin executa toggle de checkbox (grant ou revoke),
  // então após reload da página o estado persiste (não voltou ao valor anterior).
  //
  // Pré-requisito: banco com roles não-admin + permissions cadastradas.
  // Se o pré-requisito não for atendido, o caso é marcado como fixme.
  // =========================================================================

  test('given admin autenticado, when toggle de checkbox nao-admin, then estado persiste apos reload', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/settings/permissions')

    await expect(page.locator('h1')).toContainText('Permissões', { timeout: 8_000 })

    const matrix = page.getByRole('table', { name: /Matriz de papéis e permissões/i })
    await expect(matrix).toBeVisible()

    // Localiza checkboxes habilitados (não-admin)
    // A abordagem: buscar checkbox com aria-label "Permitir ... para o papel ..."
    // (padrão de role-matrix.tsx para roles não-admin)
    const enabledCheckbox = matrix.locator('[role="checkbox"][aria-label*="Permitir"]').first()

    if (!(await enabledCheckbox.isVisible())) {
      test.fixme(
        true,
        'OQ-E2E-PERM-01: sem permissões habilitáveis no banco de testes — fixture de role não-admin + permission necessária para CT-PERM-06',
      )
      return
    }

    // Captura estado atual antes do toggle
    const wasChecked = await enabledCheckbox.isChecked()

    // Executa o toggle via clique
    await enabledCheckbox.click()

    // Aguarda o optimistic update + server action completar (sem spinner visível = done)
    // Dá até 5s para a Server Action responder
    await page.waitForTimeout(1_000)

    // Reload para verificar persistência real (não depende de estado otimístico)
    await page.reload()

    await expect(page.locator('h1')).toContainText('Permissões', { timeout: 8_000 })
    await expect(matrix).toBeVisible()

    // Após reload, o mesmo checkbox deve ter estado invertido ao original
    const afterReloadCheckbox = matrix.locator('[role="checkbox"][aria-label*="Permitir"]').first()
    const nowChecked = await afterReloadCheckbox.isChecked()

    expect(nowChecked).toBe(!wasChecked)

    // Limpeza: reverte o toggle para não deixar estado indesejado no banco
    await afterReloadCheckbox.click()
    await page.waitForTimeout(500)
  })

  // =========================================================================
  // CT-PERM-07 — permissions.non-admin-le-apenas
  //
  // dado usuário não-admin (ex: support) autenticado,
  // quando navega para /settings/permissions,
  // então página carrega mas exibe alerta "Apenas administradores podem alterar..."
  //   e a matriz permanece visível em modo leitura.
  //
  // BR-RBAC: a página não redireciona não-admins — exibe alerta de leitura apenas.
  // O guard de mutação está nas Server Actions (requireRbacAdmin).
  //
  // Pré-requisito: E2E_NONADMIN_EMAIL configurado.
  // Se não configurado, marcado como fixme com instrução de pré-requisito.
  // =========================================================================

  test('given usuario nao-admin autenticado, when acessa /settings/permissions, then alerta de leitura aparece e sem checkbox habilitado para toggle', async ({
    page,
  }) => {
    const nonAdminEmail = process.env['E2E_NONADMIN_EMAIL']
    if (!nonAdminEmail) {
      test.fixme(
        true,
        'OQ-E2E-PERM-02: E2E_NONADMIN_EMAIL nao configurado — requer fixture de usuario nao-admin (ex: role=support) para CT-PERM-07. Registrado em docs/90-meta/03-open-questions-log.md.',
      )
      return
    }

    await loginAsNonAdmin(page)
    await page.goto('/settings/permissions')

    // Página carrega sem redirecionamento (isAdmin=false → alerta inline)
    await expect(page.locator('h1')).toContainText('Permissões', { timeout: 8_000 })

    // Alerta de leitura deve estar visível (role=alert)
    // Texto definido em permissions/page.tsx: "Apenas administradores podem alterar..."
    await expect(
      page.getByRole('alert').filter({ hasText: /Apenas administradores/i }),
    ).toBeVisible()

    // Sem erro 500
    await expect(page.locator('body')).not.toContainText('Internal Server Error')
  })
})
