/**
 * FLOW-02 — Inbox omnichannel
 *
 * Cobre o fluxo completo de recepção de mensagem inbound e resposta do atendente:
 * 1. Usuário logado acessa /inbox — layout 3 colunas carrega.
 * 2. Webhook simulado (seed via openOrReopenConversation + appendMessage) cria conversa.
 * 3. Conversa aparece na lista com preview da mensagem inbound.
 * 4. Atendente clica na conversa — thread aparece na coluna central.
 * 5. Atendente digita e envia mensagem outbound — mensagem aparece na thread.
 * 6. Atendente muda status para waiting_reply — badge atualiza na lista.
 * 7. Inbox sem conversa selecionada exibe placeholder "Selecione uma conversa".
 *
 * Requisitos de ambiente:
 *   SEED_E2E=true               — habilita o spec (evita falhas em CI sem banco semeado)
 *   E2E_ADMIN_EMAIL             — email do usuário admin (ex: admin@test.com)
 *   E2E_ADMIN_PASSWORD          — senha do usuário admin
 *   E2E_CONVERSATION_ID         — UUID de conversa ativa com ao menos 1 mensagem inbound
 *                                  (criada via seed antes de rodar os testes)
 *   E2E_CONVERSATION_PREVIEW    — texto preview da mensagem inbound esperada na lista
 *                                  (default: "Olá, preciso de ajuda")
 *
 * Para rodar manualmente:
 *   SEED_E2E=true \
 *   E2E_ADMIN_EMAIL=admin@test.com \
 *   E2E_ADMIN_PASSWORD=<senha> \
 *   E2E_CONVERSATION_ID=<uuid> \
 *   E2E_CONVERSATION_PREVIEW="Olá, preciso de ajuda" \
 *   pnpm test:e2e -- flow-02-omnichannel
 *
 * Spec de referência:
 *   docs/20-domain/05-conversation-inbox.md
 *   docs/80-roadmap/02-sprint-3-4-inbox-tickets.md (T-3-16)
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Guard: o spec só roda quando banco semeado está disponível.
// Em CI sem seed, pula silenciosamente sem falha.
// ---------------------------------------------------------------------------
test.describe('FLOW-02 — inbox omnichannel', () => {
  test.skip(
    process.env['SEED_E2E'] !== 'true',
    'requires seeded test database — run with SEED_E2E=true',
  )

  // -------------------------------------------------------------------------
  // Helper de login reutilizado por todos os casos deste describe
  // -------------------------------------------------------------------------

  /**
   * Realiza login com email + senha via página /login.
   * O app redireciona para /contacts após autenticação bem-sucedida.
   */
  async function loginAsAdmin(page: import('@playwright/test').Page) {
    const email = process.env['E2E_ADMIN_EMAIL'] ?? 'admin@test.com'
    const password = process.env['E2E_ADMIN_PASSWORD'] ?? ''

    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'CNE-OS' })).toBeVisible()

    await page.getByLabel('E-mail').fill(email)
    await page.getByLabel('Senha').fill(password)
    await page.getByRole('button', { name: /^Entrar$/ }).click()

    // Aguarda redirecionamento pós-login (qualquer rota protegida)
    await expect(page).toHaveURL(/\/(contacts|inbox|tickets)/, { timeout: 10_000 })
  }

  // -------------------------------------------------------------------------
  // CT-FLOW02-01: inbox.loads
  // Dado usuário logado, quando acessa /inbox, então página carrega com
  // layout 3 colunas (aside "Conversas", main "Thread de mensagens",
  // aside "Dados do contato").
  // -------------------------------------------------------------------------

  test('given usuário logado, when acessa /inbox, then página carrega com layout 3 colunas', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    await page.goto('/inbox')

    // Coluna esquerda — cabeçalho "Inbox" e landmark aside de conversas
    await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()

    // A lista de conversas (coluna esquerda) deve existir como aside acessível
    const conversationListAside = page.getByRole('complementary', { name: 'Conversas' })
    await expect(conversationListAside).toBeVisible()

    // Coluna central — area de thread (main)
    const threadMain = page.getByRole('main', { name: 'Thread de mensagens' })
    await expect(threadMain).toBeVisible()

    // Coluna direita — aside de dados do contato
    const contactAside = page.getByRole('complementary', { name: 'Dados do contato' })
    await expect(contactAside).toBeVisible()
  })

  // -------------------------------------------------------------------------
  // CT-FLOW02-02: conversation.appears-after-webhook
  // Dado webhook WhatsApp simulado (conversa criada via seed no beforeEach),
  // quando atendente acessa /inbox,
  // então conversa aparece na lista com preview da mensagem inbound.
  // -------------------------------------------------------------------------

  test('given webhook WhatsApp simulado cria conversa, when atendente acessa /inbox, then conversa aparece na lista com preview da mensagem', async ({
    page,
  }) => {
    const conversationId = process.env['E2E_CONVERSATION_ID']
    if (!conversationId) {
      test.skip(true, 'E2E_CONVERSATION_ID não configurado — pular este caso')
      return
    }

    const preview = process.env['E2E_CONVERSATION_PREVIEW'] ?? 'Olá, preciso de ajuda'

    await loginAsAdmin(page)
    await page.goto('/inbox')

    // A lista de conversas deve exibir ao menos uma entrada com o preview da mensagem inbound
    const conversationList = page.getByRole('navigation', { name: 'Lista de conversas' })
    await expect(conversationList).toBeVisible({ timeout: 8_000 })

    // Verifica que o preview do texto inbound aparece em algum item da lista
    await expect(conversationList.getByText(preview, { exact: false })).toBeVisible({
      timeout: 8_000,
    })
  })

  // -------------------------------------------------------------------------
  // CT-FLOW02-03: conversation.select-shows-thread
  // Dado conversa criada no seed,
  // quando atendente clica na conversa,
  // então thread aparece na coluna central com a mensagem inbound.
  // -------------------------------------------------------------------------

  test('given conversa criada no seed, when atendente clica na conversa, then thread aparece na coluna central com a mensagem', async ({
    page,
  }) => {
    const conversationId = process.env['E2E_CONVERSATION_ID']
    if (!conversationId) {
      test.skip(true, 'E2E_CONVERSATION_ID não configurado — pular este caso')
      return
    }

    const preview = process.env['E2E_CONVERSATION_PREVIEW'] ?? 'Olá, preciso de ajuda'

    await loginAsAdmin(page)
    // Navega diretamente com o conversationId como query param para selecionar
    await page.goto(`/inbox?conversation=${conversationId}`)

    // Thread de mensagens (coluna central) deve exibir o log de mensagens
    const threadLog = page.getByRole('log', { name: 'Mensagens da conversa' })
    await expect(threadLog).toBeVisible({ timeout: 8_000 })

    // A mensagem inbound do seed deve aparecer na thread
    await expect(threadLog.getByText(preview, { exact: false })).toBeVisible({
      timeout: 8_000,
    })
  })

  // -------------------------------------------------------------------------
  // CT-FLOW02-04: conversation.send-reply
  // Dado conversa selecionada,
  // quando atendente digita e envia mensagem,
  // então mensagem outbound aparece na thread.
  // -------------------------------------------------------------------------

  test('given conversa selecionada, when atendente digita e envia mensagem, then mensagem outbound aparece na thread', async ({
    page,
  }) => {
    const conversationId = process.env['E2E_CONVERSATION_ID']
    if (!conversationId) {
      test.skip(true, 'E2E_CONVERSATION_ID não configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/inbox?conversation=${conversationId}`)

    // Aguarda o formulário de envio estar visível
    const sendForm = page.getByRole('form', { name: 'Enviar mensagem' })
    await expect(sendForm).toBeVisible({ timeout: 8_000 })

    // Digita mensagem outbound
    const outboundText = `Teste E2E resposta ${Date.now()}`
    await sendForm.getByLabel('Corpo da mensagem').fill(outboundText)

    // Botão Enviar deve ficar habilitado
    const sendButton = sendForm.getByRole('button', { name: /^Enviar$/ })
    await expect(sendButton).toBeEnabled()

    // Envia
    await sendButton.click()

    // Mensagem outbound deve aparecer na thread após envio
    const threadLog = page.getByRole('log', { name: 'Mensagens da conversa' })
    await expect(threadLog.getByText(outboundText, { exact: false })).toBeVisible({
      timeout: 10_000,
    })
  })

  // -------------------------------------------------------------------------
  // CT-FLOW02-05: conversation.change-status
  // Dado conversa open,
  // quando atendente muda status para waiting_reply,
  // então badge de status atualiza na lista.
  //
  // Nota: após mudança de status via ContactPane → ConversationStatusSelect,
  // o badge na ConversationList exibe "Aguardando cliente" (waiting_customer).
  // -------------------------------------------------------------------------

  test('given conversa open, when atendente muda status para waiting_reply, then badge de status atualiza na lista', async ({
    page,
  }) => {
    const conversationId = process.env['E2E_CONVERSATION_ID']
    if (!conversationId) {
      test.skip(true, 'E2E_CONVERSATION_ID não configurado — pular este caso')
      return
    }

    await loginAsAdmin(page)
    await page.goto(`/inbox?conversation=${conversationId}`)

    // Aguarda a coluna de dados do contato (ContactPane) estar visível
    const contactPane = page.getByRole('complementary', { name: 'Dados do contato' })
    await expect(contactPane).toBeVisible({ timeout: 8_000 })

    // Seção de status da conversa dentro do ContactPane
    const statusSection = contactPane.getByRole('region', { name: 'Status da conversa' })
    await expect(statusSection).toBeVisible({ timeout: 8_000 })

    // Abre o SelectTrigger de status
    const statusTrigger = statusSection.getByRole('combobox', { name: 'Status da conversa' })
    await expect(statusTrigger).toBeVisible()
    await statusTrigger.click()

    // Seleciona "Aguardando resposta" (waiting_reply)
    await page.getByRole('option', { name: 'Aguardando resposta' }).click()

    // Após a mudança, o badge na ConversationList deve refletir "Aguardando cliente"
    // (waiting_customer é o mapeamento interno de waiting_reply — ver actions.ts STATUS_MAP)
    const conversationList = page.getByRole('navigation', { name: 'Lista de conversas' })
    await expect(
      conversationList.getByText('Aguardando cliente', { exact: false }),
    ).toBeVisible({ timeout: 10_000 })
  })

  // -------------------------------------------------------------------------
  // CT-FLOW02-06: inbox.no-conversation-selected
  // Dado inbox sem conversa selecionada,
  // então coluna central mostra placeholder "Selecione uma conversa".
  // -------------------------------------------------------------------------

  test('given inbox sem conversa selecionada, then coluna central mostra placeholder "Selecione uma conversa"', async ({
    page,
  }) => {
    await loginAsAdmin(page)
    // Acessa /inbox sem query param ?conversation=
    await page.goto('/inbox')

    // ThreadPane renderiza o placeholder quando conversationId é undefined
    const threadMain = page.getByRole('main', { name: 'Thread de mensagens' })
    await expect(threadMain).toBeVisible({ timeout: 8_000 })
    await expect(threadMain.getByText('Selecione uma conversa')).toBeVisible()
  })
})
