import { defineConfig, devices } from '@playwright/test'

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
