import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Carrega .env.local para que variáveis E2E (E2E_ADMIN_*, E2E_TRANSACTION_ID…)
// estejam disponíveis no processo do Playwright — Next.js as injeta no servidor
// mas o runner do Playwright roda em processo separado e não as lê automaticamente.
const envLocalPath = resolve(process.cwd(), '.env.local')
if (existsSync(envLocalPath)) {
  for (const line of readFileSync(envLocalPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) process.env[key] = val
  }
}

/**
 * Playwright configuration for E2E tests.
 *
 * Test files live in tests/e2e/*.spec.ts
 * Each spec begins with a clean seed (beforeEach truncate + fixture seed).
 *
 * Spec: docs/10-architecture/10-testing-strategy.md §4
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : 4,
  reporter: 'html',

  use: {
    baseURL: process.env['BASE_URL'] ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Global setup/teardown — seed test user + ephemeral DB
  // Uncomment when E2E tests are implemented (Sprint 2+):
  // globalSetup: './tests/e2e/global-setup.ts',
  // globalTeardown: './tests/e2e/global-teardown.ts',
})
