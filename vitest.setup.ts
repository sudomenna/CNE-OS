/**
 * Vitest setup — infraestrutura global de acessibilidade (axe-core).
 *
 * NÃO executa axe em todos os testes.
 * Disponibiliza `configureAxe` para quem quiser usar em testes específicos.
 *
 * Uso em testes:
 *   import { axe } from '@/vitest.setup'
 *   const results = await axe(container)
 *   expect(results).toHaveNoViolations()
 *
 * Ref: docs/70-ux/10-accessibility.md §14 — axe-core em CI
 */
import { configureAxe, toHaveNoViolations } from 'jest-axe'
import { expect } from 'vitest'

// Estende o expect do Vitest com o matcher jest-axe
expect.extend(toHaveNoViolations)

/**
 * Instância pré-configurada do axe.
 *
 * color-contrast desativado porque os tokens OKLCH→HSL podem ter
 * valores computados diferentes no jsdom vs browser real.
 * Contraste é verificado manualmente (WCAG §4) e via Lighthouse CI.
 */
export const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
  },
})
