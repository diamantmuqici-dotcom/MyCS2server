import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
      exclude: ['**/*.d.ts', 'apps/web/src/main.tsx'],
    },
  },
});
