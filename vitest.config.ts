import { defineConfig } from 'vitest/config';

/** The unit tests (no server, no window) and the integration tests (real MongoDB and Redis servers), as two projects. */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test.tsx'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/integration/global-setup.ts'],
          testTimeout: 60_000,
          hookTimeout: 180_000,
        },
      },
    ],
  },
});
