/**
 * FLOW-05 — External Sale Ingest (ingestao de venda externa via Digital Guru)
 *
 * Cobre os aspectos visiveis na UI do fluxo end-to-end de ingestao de venda:
 *
 * 1. CT-FLOW05-01 — happy-path-approved-via-ui
 *    /transactions carrega sem erro 500 e exibe heading "Transacoes".
 *
 * 2. CT-FLOW05-02 — transaction-detail-loads
 *    /transactions/[E2E_TRANSACTION_ID] exibe badge "Aprovada", secao
 *    "Snapshot da Venda" e tabela de itens.
 *
 * 3. CT-FLOW05-03 — snapshot-viewer-shows-payload
 *    SnapshotViewer esta visivel com secoes de oferta/condicao e botoes de
 *    colapso/expansao presentes (aria-expanded).
 *
 * 4. CT-FLOW05-04 — refund-button-visible-only-when-approved
 *    Transacao approved sem refund ativo exibe botao "Reembolsar".
 *
 * 5. CT-FLOW05-05 — refused-transaction-no-refund-button
 *    Transacao refused exibe badge "Recusada" e NAO exibe botao "Reembolsar".
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true                    — habilita este spec
 *   E2E_ADMIN_EMAIL                  — email do usuario admin
 *   E2E_ADMIN_PASSWORD               — senha do usuario admin
 *   E2E_TRANSACTION_ID               — UUID de transacao approved com snapshot e itens
 *   E2E_REFUSED_TRANSACTION_ID       — UUID de transacao refused (opcional)
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=admin@test.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   E2E_TRANSACTION_ID=<uuid-approved> \
 *   E2E_REFUSED_TRANSACTION_ID=<uuid-refused> \
 *   pnpm test:e2e -- flow-05-external-sale-ingest
 *
 * Spec de referencia:
 *   docs/60-flows/05-external-sale-ingest.md (casos de teste E2E obrigatorios)
 *   docs/20-domain/11-transaction-snapshot.md §3.2 (payload snapshot)
 *   docs/80-roadmap/05-sprint-8-snapshot-dg-integration.md T-8-22
 *   docs/50-business-rules/BR-SNAPSHOT-IMMUTABILITY.md
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec so roda quando banco semeado esta disponivel.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------
test.describe('FLOW-05 — external-sale-ingest', () => {
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

    // Aguarda redirecionamento pos-login (qualquer rota protegida)
    await page.waitForURL(/\/(contacts|campaigns|funnels|tickets|inbox|offers|transactions)/, {
      timeout: 10_000,
    })
  }

  // =========================================================================
  // CT-FLOW05-01 — happy-path-approved-via-ui
  // dado usuario logado,
  // quando acessa /transactions,
  // entao lista carrega sem erro 500 e exibe heading "Transacoes"
  //
  // FLOW-05 §passos-pos-condicoes: transacao approved deve aparecer na lista
  // =========================================================================

  test('given usuario logado, when acessa /transactions, then lista carrega sem erro 500 e exibe heading Transacoes', async ({
    page,
  }) => {
    await loginAsAdmin(page)

    await page.goto('/transactions')

    // Nao deve ter renderizado uma pagina de erro 500
    await expect.soft(page.locator('body')).not.toContainText('500')
    await expect.soft(page.locator('body')).not.toContainText('Internal Server Error')

    // Heading principal — app/transactions/page.tsx renderiza h1 "Transacoes"
    await expect(
      page.getByRole('heading', { name: 'Transacoes', level: 1 }),
    ).toBeVisible({ timeout: 8_000 })

    // Elemento de contagem de resultados deve estar presente (first: evita strict-mode com h1)
    await expect.soft(
      page.locator('body').getByText(/transac/i).first(),
    ).toBeVisible({ timeout: 5_000 })
  })

  // =========================================================================
  // CT-FLOW05-02 — transaction-detail-loads
  // dado E2E_TRANSACTION_ID com transacao approved com snapshot e itens,
  // quando acessa /transactions/[id],
  // entao exibe badge "Aprovada", secao "Snapshot da Venda" e tabela de itens
  //
  // FLOW-05 §pos-condicoes: transaction.status='approved', snapshot_id setado,
  //   transaction_item inseridos
  // T-8-16: detalhe mostra payload do snapshot e secao de itens
  // =========================================================================

  test('given E2E_TRANSACTION_ID approved com snapshot, when acessa /transactions/[id], then badge Aprovada e secao Snapshot da Venda estao visiveis', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/transactions/${transactionId}`)

    // Nao deve ter renderizado 404 ou 500
    await expect.soft(page.locator('body')).not.toContainText('500')
    await expect.soft(page.locator('body')).not.toContainText('Not Found')

    // Badge de status "Aprovada" — renderizado como <Badge> no h1 area
    // app/transactions/[id]/page.tsx: STATUS_LABEL.approved = 'Aprovada'
    // .first() evita strict-mode: badge aparece tb no histórico de status
    await expect(
      page.getByText('Aprovada').first(),
    ).toBeVisible({ timeout: 8_000 })

    // Secao "Snapshot da Venda" — h2 aria-labelledby="snapshot-heading"
    await expect(
      page.getByRole('heading', { name: 'Snapshot da Venda' }),
    ).toBeVisible({ timeout: 8_000 })

    // Secao de itens — h2 "Itens (...)"
    // Pode ser "Itens (0)" se sem itens, mas a secao deve existir
    await expect.soft(
      page.getByRole('heading', { name: /^Itens/ }),
    ).toBeVisible({ timeout: 5_000 })
  })

  // =========================================================================
  // CT-FLOW05-03 — snapshot-viewer-shows-payload
  // dado transacao com snapshot criado pelo FLOW-05,
  // quando acessa /transactions/[id],
  // entao SnapshotViewer esta visivel com secoes colapsaveis e aria-expanded presente
  //
  // BR-SNAPSHOT-IMMUTABILITY: payload congelado, nao editavel
  // components/transaction/snapshot-viewer.tsx: role="region" aria-label="Snapshot da venda"
  //   Sections com buttons aria-expanded={open}
  // =========================================================================

  test('given transacao com snapshot, when acessa /transactions/[id], then SnapshotViewer esta visivel com secoes e botoes de colapso', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/transactions/${transactionId}`)

    // Aguarda a pagina carregar
    await expect(
      page.getByText('Aprovada').first(),
    ).toBeVisible({ timeout: 8_000 })

    // SnapshotViewer — div com role="region" e aria-label="Snapshot da venda" (lowercase 'v')
    // components/transaction/snapshot-viewer.tsx: <div role="region" aria-label="Snapshot da venda">
    // Usar exact:true para nao confundir com a section pai que tem "Snapshot da Venda" (capital V)
    const snapshotRegion = page.getByRole('region', { name: 'Snapshot da venda', exact: true })
    await expect(snapshotRegion).toBeVisible({ timeout: 8_000 })

    // Banner "Snapshot imutavel" presente
    await expect.soft(
      snapshotRegion.getByText(/Snapshot imutavel/i),
    ).toBeVisible({ timeout: 5_000 })

    // Secao "Oferta" deve estar presente e colapsavel (aria-expanded)
    const ofertaSection = snapshotRegion.getByRole('button', { name: /^Oferta$/i })
    await expect(ofertaSection).toBeVisible({ timeout: 5_000 })
    await expect.soft(ofertaSection).toHaveAttribute('aria-expanded', 'true')

    // Ao clicar na secao, deve colapsar (aria-expanded muda para false)
    await ofertaSection.click()
    await expect.soft(ofertaSection).toHaveAttribute('aria-expanded', 'false')

    // Clicar novamente deve expandir
    await ofertaSection.click()
    await expect.soft(ofertaSection).toHaveAttribute('aria-expanded', 'true')

    // Secao "Condicao Comercial" deve existir
    await expect.soft(
      snapshotRegion.getByRole('button', { name: /Condicao Comercial/i }),
    ).toBeVisible({ timeout: 5_000 })
  })

  // =========================================================================
  // CT-FLOW05-04 — refund-button-visible-only-when-approved
  // dado E2E_TRANSACTION_ID com status approved e sem refund ativo,
  // quando acessa /transactions/[id],
  // entao botao "Reembolsar" esta visivel
  //
  // T-8-16: "Botao 'reembolsar' aparece so se status=approved e sem refund ativo"
  // app/transactions/[id]/page.tsx linha 106: const canRefund = trx.status === 'approved' && !hasRefundActive
  // =========================================================================

  test('given E2E_TRANSACTION_ID approved sem refund ativo, when acessa /transactions/[id], then botao Reembolsar esta visivel', async ({
    page,
  }) => {
    const transactionId = process.env['E2E_TRANSACTION_ID']

    if (!transactionId) {
      test.skip(true, 'E2E_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/transactions/${transactionId}`)

    // Aguarda o badge de status aparecer
    await expect(
      page.getByText('Aprovada').first(),
    ).toBeVisible({ timeout: 8_000 })

    // Botao "Reembolsar" — Link estilizado como botao vermelho
    // app/transactions/[id]/page.tsx linha 143-149: Link href=".../refund" com texto "Reembolsar"
    const refundButton = page.getByRole('link', { name: /Reembolsar/i })
    await expect(refundButton).toBeVisible({ timeout: 5_000 })

    // Deve apontar para a rota de refund
    await expect.soft(refundButton).toHaveAttribute('href', new RegExp(`/transactions/${transactionId}/refund`))
  })

  // =========================================================================
  // CT-FLOW05-05 — refused-transaction-no-refund-button
  // dado E2E_REFUSED_TRANSACTION_ID com status refused,
  // quando acessa /transactions/[id],
  // entao badge "Recusada" esta visivel e botao "Reembolsar" NAO esta presente
  //
  // FLOW-05 §passo-19: order.refused -> status='refused'; nenhum snapshot criado
  // app/transactions/[id]/page.tsx: canRefund=false quando status != 'approved'
  // =========================================================================

  test('given E2E_REFUSED_TRANSACTION_ID com status refused, when acessa /transactions/[id], then badge Recusada visivel e sem botao Reembolsar', async ({
    page,
  }) => {
    const refusedTransactionId = process.env['E2E_REFUSED_TRANSACTION_ID']

    if (!refusedTransactionId) {
      test.skip(true, 'E2E_REFUSED_TRANSACTION_ID nao configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/transactions/${refusedTransactionId}`)

    // Nao deve ter renderizado 404 ou 500
    await expect.soft(page.locator('body')).not.toContainText('500')
    await expect.soft(page.locator('body')).not.toContainText('Not Found')

    // Badge de status "Recusada" — STATUS_LABEL.refused = 'Recusada'
    // .first() evita strict-mode: "Recusada" aparece no badge, em "Recusada em" e no histórico
    await expect(
      page.getByText('Recusada').first(),
    ).toBeVisible({ timeout: 8_000 })

    // Botao "Reembolsar" NAO deve estar presente para transacao refused
    await expect(
      page.getByRole('link', { name: /Reembolsar/i }),
    ).not.toBeVisible({ timeout: 3_000 })
  })
})
