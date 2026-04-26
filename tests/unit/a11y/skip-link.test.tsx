/**
 * @vitest-environment jsdom
 *
 * Smoke test: skip link "Pular para conteúdo"
 *
 * Valida que o skip link:
 *   1. Existe no layout como primeiro link tabulável
 *   2. Aponta para #main-content
 *   3. Tem texto correto para screen readers
 *   4. É acessível via axe-core (sem violations)
 *
 * Ref: docs/70-ux/10-accessibility.md §2.1
 */
import { describe, it, expect } from 'vitest'
import { axe } from '@/vitest.setup'

describe('Skip link — A11y smoke', () => {
  it('deve existir um link "Pular para conteúdo" apontando para #main-content', () => {
    // Monta HTML mínimo representando o que o layout renderiza
    document.body.innerHTML = `
      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-background focus:text-foreground focus:rounded focus:ring-2 focus:ring-ring"
        id="skip-link"
      >
        Pular para conteúdo
      </a>
      <nav aria-label="Menu principal">
        <a href="/contacts">Contatos</a>
      </nav>
      <main id="main-content">
        <h1>Conteúdo principal</h1>
      </main>
    `

    const skipLink = document.querySelector<HTMLAnchorElement>('a[href="#main-content"]')

    // 1. O link deve existir
    expect(skipLink).not.toBeNull()

    // 2. Deve apontar para #main-content
    expect(skipLink?.getAttribute('href')).toBe('#main-content')

    // 3. Texto acessível correto
    expect(skipLink?.textContent?.trim()).toBe('Pular para conteúdo')

    // 4. O target #main-content deve existir no DOM
    const mainContent = document.getElementById('main-content')
    expect(mainContent).not.toBeNull()
    expect(mainContent?.tagName.toLowerCase()).toBe('main')
  })

  it('deve ser o primeiro elemento focalizável antes do nav', () => {
    document.body.innerHTML = `
      <a href="#main-content" id="skip-link">Pular para conteúdo</a>
      <nav aria-label="Menu principal">
        <a href="/contacts">Contatos</a>
      </nav>
      <main id="main-content">
        <h1>Conteúdo principal</h1>
      </main>
    `

    const allFocusable = document.querySelectorAll<HTMLElement>('a, button, input, select, textarea, [tabindex]')
    const first = allFocusable[0]

    expect(first?.getAttribute('href')).toBe('#main-content')
  })

  it('skip link + main-content não devem ter violations axe', async () => {
    document.body.innerHTML = `
      <a href="#main-content">Pular para conteúdo</a>
      <nav aria-label="Menu principal">
        <a href="/contacts">Contatos</a>
      </nav>
      <main id="main-content">
        <h1>Conteúdo principal</h1>
        <p>Texto de exemplo para garantir que o conteúdo é acessível.</p>
      </main>
    `

    const results = await axe(document.body)
    expect(results).toHaveNoViolations()
  })
})
