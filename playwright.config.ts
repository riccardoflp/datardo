import { defineConfig } from '@playwright/test';

/** The UI tests drive the built application through its window (testing.md); they run one at a time. */
export default defineConfig({
  testDir: 'test/ui',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
});
